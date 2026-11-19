import "server-only";

import { cutoutSrc } from "@/data/assets";
import { fitsLocker } from "@/data/catalog";
import { bladeName, partCode } from "@/lib/holo";
import { storefrontOrganizationId } from "@/lib/org/storefront";
import { cacheStorefrontRead, STOREFRONT_CACHE_TAGS } from "@/lib/storefront/cache";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/admin";
import { NO_SALES_FACTS, salesFacts, type CartPick, type CartPickShelf, type OrderLineFact, type SalesFacts } from "./cart-picks";
import type { Product } from "./types";
import { familyColours, familyLead } from "./variants";

/** A stalled database must not hold the cart page: the shelf then falls back to related pieces. */
const SALES_TIMEOUT_MS = 4_000;

/** The most recent paid orders read. Their lines fit one page of the API with room to spare. */
const ORDERS_READ = 400;

/**
 * What paid orders say about which pieces sell and which sell together.
 *
 * Orders are closed to the public, so the read uses the server's own key and names the shop's
 * company. Only slugs and quantities are read, never who bought. Cached under the products tag,
 * which the payment webhook expires after each order. Without the key, or if the read fails, there
 * are no facts and the cart makes no sales claim.
 */
export async function loadSalesFacts(canonical: (slug: string) => string): Promise<SalesFacts> {
  if (!process.env["NEXT_PUBLIC_SUPABASE_URL"]?.trim() || !process.env["SUPABASE_SECRET_KEY"]?.trim()) return NO_SALES_FACTS;
  try {
    const orders = await cacheStorefrontRead(["commerce", "sales-lines"], [STOREFRONT_CACHE_TAGS.products], async () => {
      const client = createPrivilegedSupabaseClient();
      const signal = AbortSignal.timeout(SALES_TIMEOUT_MS);
      const organizationId = await storefrontOrganizationId();
      const paid = await client
        .from("orders")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("payment_status", "paid")
        .neq("status", "cancelled")
        .order("id", { ascending: false })
        .limit(ORDERS_READ)
        .abortSignal(signal);
      if (paid.error) throw new Error(paid.error.message);
      if (paid.data.length === 0) return [];
      const lines = await client
        .from("order_items")
        .select("order_id,sku_snapshot,quantity")
        .eq("organization_id", organizationId)
        .in(
          "order_id",
          paid.data.map((order) => order.id),
        )
        .abortSignal(signal);
      if (lines.error) throw new Error(lines.error.message);
      const byOrder = new Map<number, OrderLineFact[]>();
      for (const line of lines.data) {
        // The snapshot is the product's slug in capitals.
        const held = byOrder.get(line.order_id) ?? [];
        held.push({ slug: line.sku_snapshot.toLowerCase(), quantity: line.quantity });
        byOrder.set(line.order_id, held);
      }
      return [...byOrder.values()];
    });
    return salesFacts(orders, canonical);
  } catch (error) {
    console.error("[cart-picks] no sales facts:", error instanceof Error ? error.message : error);
    return NO_SALES_FACTS;
  }
}

/**
 * A piece the cart may suggest: on the shelf now, sent from the shop's own warehouse in the same
 * parcel. Bundles have their own offer in the cart; a stadium box would change the carrier and a
 * partner's piece the warehouse, and a suggestion must never do that behind the buyer's back.
 * Pre-orders and arrivals stay out: nothing that would make the parcel wait.
 */
function suggestable(product: Product): boolean {
  return (
    !product.bundleOf &&
    !product.consignment &&
    product.category !== "stadi" &&
    fitsLocker(product) &&
    product.stock === "disponibile" &&
    (product.availableQuantity === undefined || product.availableQuantity > 0)
  );
}

/** The slug each colour of an item is counted under: the family's leading colour. */
export function colourAliases(catalogue: readonly Product[]): Record<string, string> {
  const alias: Record<string, string> = {};
  for (const product of catalogue) {
    const lead = familyLead(product);
    if (lead !== product.slug) alias[product.slug] = lead;
  }
  return alias;
}

/** The shelf for today's catalogue, with what paid orders say about it. */
export async function loadCartPickShelf(catalogue: readonly Product[]): Promise<CartPickShelf> {
  const alias = colourAliases(catalogue);
  return cartPickShelf(catalogue, await loadSalesFacts((slug) => alias[slug] ?? slug), alias);
}

/** The cart's suggestion shelf: every piece it may offer, as its small card shows it, and the sales facts. */
export function cartPickShelf(catalogue: readonly Product[], facts: SalesFacts, alias: Readonly<Record<string, string>> = colourAliases(catalogue)): CartPickShelf {
  const bySlug = new Map(catalogue.map((product) => [product.slug as string, product]));
  const relatedTo = new Map<string, string[]>();
  for (const product of catalogue) {
    for (const related of product.relatedSlugs) relatedTo.set(related, [...(relatedTo.get(related) ?? []), product.slug]);
  }

  const picks: CartPick[] = [];
  const placed = new Set<string>();
  for (const product of catalogue) {
    const lead = familyLead(product);
    if (placed.has(lead)) continue;
    const colours = familyColours(product);
    // An item in colours is one card: it stands on the first colour still on the shelf.
    const members = colours.length > 0 ? colours.map((colour) => colour.slug as string) : [product.slug as string];
    const shown = members.map((slug) => bySlug.get(slug)).find((member) => member !== undefined && suggestable(member));
    if (!shown) continue;
    placed.add(lead);
    const family = colours.length > 1 ? shown.variant : undefined;
    const code = family ? null : partCode(shown);
    const image = shown.images[0];
    picks.push({
      // Sales are counted on the family's leading slug, so the card carries it.
      slug: (family ? lead : shown.slug) as CartPick["slug"],
      name: family ? family.familyName : shown.name,
      title: family ? family.familyName : bladeName(shown.name, code),
      code,
      price: shown.price,
      ...(shown.compareAtPrice ? { compareAtPrice: shown.compareAtPrice } : {}),
      image: image ? { src: cutoutSrc(image.src) ?? image.src, alt: image.alt } : null,
      members,
      ...(family ? { colours: colours.length } : {}),
      relatedTo: [...new Set(members.flatMap((slug) => relatedTo.get(slug) ?? []))],
    });
  }

  // Only what can be shown travels to the browser.
  const offered = new Set(picks.map((pick) => pick.slug as string));
  const together: Record<string, readonly string[]> = {};
  for (const [slug, others] of Object.entries(facts.together)) {
    const kept = others.filter((other) => offered.has(other));
    if (kept.length > 0) together[slug] = kept;
  }
  return { picks, facts: { together, bestSellers: facts.bestSellers.filter((slug) => offered.has(slug)) }, alias };
}
