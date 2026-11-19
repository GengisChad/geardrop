import type { Money, Product } from "./types";

/**
 * What the cart suggests next to its lines, and why.
 *
 * The shop only says "other customers also bought" when paid orders really held the two pieces
 * together. Without that it says "best sellers", from units really sold, and without any sales
 * data it falls back to the pieces the catalogue lists as related, under a title that claims
 * nothing. Sales figures never leave the server: the browser gets the pieces in order, no counts.
 */

/** Two orders must hold a pair before it counts: one buyer's taste is not "other customers". */
export const MIN_ORDERS_TOGETHER = 2;

/** A suggestion shelf shorter than this is not shown under a sales claim. */
const MIN_PICKS = 2;

export type SalesFacts = {
  /** For a piece, the pieces paid orders held with it at least twice, the most frequent first. */
  readonly together: Readonly<Record<string, readonly string[]>>;
  /** Pieces by units sold in paid orders, the most sold first. */
  readonly bestSellers: readonly string[];
};

export const NO_SALES_FACTS: SalesFacts = { together: {}, bestSellers: [] };

export type OrderLineFact = { readonly slug: string; readonly quantity: number };

/**
 * Reads the facts out of paid orders. `canonical` folds the colours of one item into the slug
 * that stands for it, so a deck case sold in six colours counts once.
 */
export function salesFacts(
  orders: readonly (readonly OrderLineFact[])[],
  canonical: (slug: string) => string = (slug) => slug,
): SalesFacts {
  const units = new Map<string, number>();
  const pairs = new Map<string, Map<string, number>>();
  const bump = (left: string, right: string) => {
    const row = pairs.get(left) ?? new Map<string, number>();
    row.set(right, (row.get(right) ?? 0) + 1);
    pairs.set(left, row);
  };

  for (const order of orders) {
    const slugs = new Set<string>();
    for (const line of order) {
      const slug = canonical(line.slug);
      units.set(slug, (units.get(slug) ?? 0) + line.quantity);
      slugs.add(slug);
    }
    const held = [...slugs];
    for (const left of held) for (const right of held) if (left !== right) bump(left, right);
  }

  const bySales = (left: string, right: string) => (units.get(right) ?? 0) - (units.get(left) ?? 0) || left.localeCompare(right);
  const together: Record<string, readonly string[]> = {};
  for (const [slug, row] of pairs) {
    const often = [...row].filter(([, count]) => count >= MIN_ORDERS_TOGETHER);
    if (often.length === 0) continue;
    together[slug] = often.sort(([left, a], [right, b]) => b - a || bySales(left, right)).map(([other]) => other);
  }
  return { together, bestSellers: [...units.keys()].sort(bySales) };
}

/** One piece the cart can suggest, with only what its small card shows. */
export type CartPick = {
  readonly slug: Product["slug"];
  /** Full name, for labels and analytics. */
  readonly name: string;
  /** The name as the card prints it, without the part code. */
  readonly title: string;
  readonly code: string | null;
  readonly price: Money;
  readonly compareAtPrice?: Money;
  readonly image: { readonly src: string; readonly alt: string } | null;
  /** Every slug this card stands for: itself, or all the colours of the item. */
  readonly members: readonly string[];
  /** Set when the item comes in colours: the card sends the buyer to choose one. */
  readonly colours?: number;
  /** Catalogue pieces whose page lists this one as related. */
  readonly relatedTo: readonly string[];
};

export type CartPickShelf = {
  readonly picks: readonly CartPick[];
  readonly facts: SalesFacts;
  /** A colour's slug to the slug its item is counted under; pieces sold in one version are absent. */
  readonly alias: Readonly<Record<string, string>>;
};

export const EMPTY_PICK_SHELF: CartPickShelf = { picks: [], facts: NO_SALES_FACTS, alias: {} };

export type PickReason = "together" | "bestsellers" | "related";

export type CartSuggestion = {
  readonly pick: CartPick;
  /** With "together": the cart line it was most often bought with. */
  readonly with: string | null;
};

export type CartSuggestions = { readonly reason: PickReason; readonly items: readonly CartSuggestion[] };

/**
 * The pieces to suggest for this cart. One reason for the whole shelf, so its title is true of
 * every card under it.
 */
export function picksForCart(cart: readonly string[], shelf: CartPickShelf, limit = 4): CartSuggestions | null {
  const inCart = new Set(cart);
  const open = shelf.picks.filter((pick) => !pick.members.some((slug) => inCart.has(slug)));
  if (cart.length === 0 || open.length === 0) return null;
  const bySlug = new Map<string, CartPick>(open.map((pick) => [pick.slug, pick]));
  const sales = new Map(shelf.facts.bestSellers.map((slug, index) => [slug, index]));
  const salesRank = (slug: string) => sales.get(slug) ?? Number.MAX_SAFE_INTEGER;

  // Bought together: a piece that went with two cart lines leads one that went with a single line.
  const links = new Map<string, { count: number; best: number; with: string }>();
  for (const line of cart) {
    (shelf.facts.together[shelf.alias[line] ?? line] ?? []).forEach((slug, position) => {
      if (!bySlug.has(slug)) return;
      const link = links.get(slug);
      if (!link) links.set(slug, { count: 1, best: position, with: line });
      else links.set(slug, { count: link.count + 1, best: Math.min(link.best, position), with: position < link.best ? line : link.with });
    });
  }
  const together = [...links]
    .sort(([left, a], [right, b]) => b.count - a.count || a.best - b.best || salesRank(left) - salesRank(right))
    .flatMap(([slug, link]) => {
      const pick = bySlug.get(slug);
      return pick ? [{ pick, with: link.with }] : [];
    });
  if (together.length >= MIN_PICKS) return { reason: "together", items: together.slice(0, limit) };

  const bestSellers = shelf.facts.bestSellers.flatMap((slug) => {
    const pick = bySlug.get(slug);
    return pick ? [{ pick, with: null }] : [];
  });
  if (bestSellers.length >= MIN_PICKS) return { reason: "bestsellers", items: bestSellers.slice(0, limit) };

  const related = open.filter((pick) => pick.relatedTo.some((slug) => inCart.has(slug))).map((pick) => ({ pick, with: null }));
  return related.length > 0 ? { reason: "related", items: related.slice(0, limit) } : null;
}
