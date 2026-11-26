/**
 * The CX-20 Customize Set C (owner, 2026-11-26): "arrivano 20 cx-20. mettili sul sito con avvisami
 * e solo 8 in pre order per telegram", resold at 140 euro and paid on the site's checkout.
 *
 * The shop shows it "In arrivo" with "Avvisami" (his correction the same evening: "sul sito devi
 * mettere «in arrivo»", not sold out); the eight pieces live in the database and are sold only
 * through the cart the channel's post opens.
 */
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BuyPanel } from "@/components/product/buy-panel";
import { Providers } from "@/components/providers";
import { PRODUCTS, brandOf, fitsLocker } from "@/data/catalog";
import { ProductCard } from "@/components/product/product-card";
import { hiddenFromShop, isArriving, shopView } from "@/lib/commerce/channel-only";
import { applyLiveStock } from "@/lib/commerce/live-stock-overlay";
import { createMockProvider } from "@/lib/commerce/mock-provider";
import { availabilityLine } from "@/lib/holo";
import { PREORDER_DELIVERY, isPurchasable, stockHint, stockLabel, stockTone } from "@/lib/labels";
import { channelPreorderPost } from "@/lib/telegram/messages";
import { scanProducts } from "@/lib/telegram/news";
import { preorderOpen } from "@/lib/telegram/preorder-rules";

const SLUG = "cx-20-customize-set-c";
const catalogued = PRODUCTS.find((product) => product.slug === SLUG)!;
const other = PRODUCTS.find((product) => product.slug === "glory-valkerion-lf")!;
/** What the back office holds once the migration has run: eight pieces set aside as a pre-order. */
const row = { slug: SLUG, stock_status: "pre-ordine" as const, stock_quantity: 0, preorder_allocation: 8, availability_override: "preorder", price_cents: 14000 };
const live = applyLiveStock([catalogued], [row])[0]!;

describe("the CX-20 in the catalogue", () => {
  it("is Takara Tomy's set at the owner's price, sold out until the database says otherwise", () => {
    expect(catalogued).toMatchObject({
      name: "CX-20 Customize Set C",
      price: { amount: 14000, currency: "EUR" },
      stock: "esaurito",
      availableQuantity: 0,
      channelOnly: "avvisami",
      channelPayment: "stripe",
    });
    expect(brandOf(catalogued)).toBe("takara-tomy");
    // A box of parts: it travels to an InPost Locker like any top.
    expect(fitsLocker(catalogued)).toBe(true);
  });

  it("lists what Takara Tomy's sheet lists, and that launcher and stadium are not in the box", () => {
    const spec = (label: string) => catalogued.specs.find((entry) => entry.label === label)?.value;
    expect(spec("Componenti")).toBe("4 blade, 3 ratchet, 6 bit");
    expect(spec("Ratchet inclusi")).toBe("M-65 · 8-80 · 1-70");
    expect(spec("Lanciatore e stadio")).toBe("Non inclusi");
    expect(catalogued.boxContents.filter((item) => item.includes("Blade"))).toHaveLength(4);
    expect(catalogued.boxContents.filter((item) => item.includes("Ratchet"))).toHaveLength(3);
    expect(catalogued.boxContents.filter((item) => item.includes("Bit"))).toHaveLength(6);
    expect(catalogued.images).toHaveLength(7);
    // No comparative price claim and no tournament rule in the copy.
    expect(`${catalogued.tagline} ${catalogued.description}`).not.toMatch(/più bass|WBO|bandit|vietat/i);
  });

  it("is written into the database by a migration that says the same words", () => {
    const migration = readFileSync("supabase/migrations/20261126190000_cx20_customize_set_c.sql", "utf8").replaceAll("''", "'");
    for (const text of [catalogued.name, catalogued.tagline, catalogued.description]) expect(migration).toContain(`'${text}'`);
    expect(migration).toContain("14000, 43)");
    expect(migration).toContain("'preorder'::public.availability_override, 8, false");
    for (const image of catalogued.images) {
      expect(migration).toContain(`'${image.src}'`);
      expect(migration).toContain(`'${image.alt}'`);
    }
  });
});

describe("on the shop, In arrivo with Avvisami, while Telegram takes its pre-orders", () => {
  it("keeps its eight pieces for the channel", () => {
    expect(live).toMatchObject({ stock: "pre-ordine", availableQuantity: 8, channelOnly: "avvisami" });
    expect(hiddenFromShop(live)).toBe(false);
    expect(preorderOpen(live)).toBe(true);
  });

  it("cannot be bought from the shop's own pages", async () => {
    expect(shopView(live)).toMatchObject({ slug: SLUG, stock: "esaurito", availableQuantity: 0, channelOnly: "avvisami" });
    expect(isPurchasable(shopView(live).stock)).toBe(false);
    const provider = createMockProvider([live, other]);
    const listed = (await provider.listProducts({ perPage: 100 })).items.find((product) => product.slug === SLUG);
    expect(listed).toMatchObject({ stock: "esaurito", availableQuantity: 0 });
    expect((await provider.listProducts({ search: "Customize Set" })).items.map((product) => product.slug)).toEqual([SLUG]);
    expect(await provider.getProduct(SLUG)).toMatchObject({ stock: "esaurito", availableQuantity: 0 });
    expect((await provider.getProductsBySlugs([SLUG]))[0]).toMatchObject({ stock: "esaurito" });
    expect((await provider.getFacets()).stock.find((facet) => facet.value === "pre-ordine")?.count).toBe(0);
  });

  it("reads In arrivo there, never Esaurito", async () => {
    const shown = shopView(live);
    expect(isArriving(shown)).toBe(true);
    expect(stockLabel(shown)).toBe("In arrivo");
    expect(stockTone(shown)).toBe("in-arrivo");
    expect(stockHint(shown)).toBe("Lascia la tua email: ti avvisiamo quando si può ordinare");
    expect(availabilityLine(shown)).toBe("In arrivo");
    // A product that is simply sold out keeps its own word.
    expect(stockLabel({ ...other, stock: "esaurito" })).toBe("Esaurito");
    expect(stockTone({ ...other, stock: "esaurito" })).toBe("esaurito");

    // The filter finds it under the word it reads, and counts it there.
    const provider = createMockProvider([live, other]);
    expect((await provider.listProducts({ stock: ["in-arrivo"] })).items.map((product) => product.slug)).toEqual([SLUG]);
    expect((await provider.listProducts({ stock: ["esaurito"] })).total).toBe(0);
    const facets = (await provider.getFacets()).stock;
    expect(facets.find((facet) => facet.value === "in-arrivo")?.count).toBe(1);
    expect(facets.find((facet) => facet.value === "esaurito")?.count).toBe(0);

    const card = renderToStaticMarkup(
      <Providers>
        <ProductCard product={shown} />
      </Providers>,
    );
    expect(card).toContain("In arrivo");
    expect(card).not.toContain("Esaurito");
    expect(card).toContain('data-testid="notify-me"');
    expect(card).not.toContain('data-testid="add-to-cart"');
  });

  it("is still sold by the cart, up to the pieces set aside", async () => {
    const provider = createMockProvider([live, other]);
    const quote = await provider.quoteCart({ lines: [{ slug: SLUG, quantity: 1 }] });
    expect(quote.lines[0]).toMatchObject({ slug: SLUG, unitPrice: { amount: 14000 }, issue: null });
    const tooMany = await provider.quoteCart({ lines: [{ slug: SLUG, quantity: 9 }] });
    expect(tooMany.lines[0]?.issue).not.toBeNull();
  });

  it("offers Avvisami and points to the channel on its page", () => {
    const html = renderToStaticMarkup(
      <Providers>
        <BuyPanel product={shopView(live)} />
      </Providers>,
    );
    expect(html).toContain('id="restock-form"');
    expect(html).not.toContain('data-testid="add-to-cart"');
    expect(html).toContain("In arrivo");
    expect(html).not.toContain("Esaurito");
    expect(html).toContain("Avvisami quando CX-20 Customize Set C si può ordinare");
    expect(html).toContain('data-testid="telegram-preorder-hint"');
    expect(html).toContain('href="https://t.me/geardropshop"');

    const plain = renderToStaticMarkup(
      <Providers>
        <BuyPanel product={{ ...other, stock: "esaurito", availableQuantity: 0 }} />
      </Providers>,
    );
    expect(plain).not.toContain("telegram-preorder-hint");
  });

  it("becomes a product of the shop like any other when its pieces arrive", () => {
    const [arrived] = applyLiveStock([catalogued], [{ ...row, stock_status: "disponibile", stock_quantity: 12, preorder_allocation: 0, availability_override: null }]);
    expect(arrived!.channelOnly).toBeUndefined();
    expect(shopView(arrived!)).toMatchObject({ stock: "disponibile", availableQuantity: 12 });
  });
});

describe("what the bot makes of it", () => {
  const NOW = new Date("2026-11-27T09:00:00.000Z");
  const seen = new Map(scanProducts(new Map(), [other, catalogued], NOW, true).memory);

  it("announces the pre-order on the channel once the pieces are in the database", () => {
    const scan = scanProducts(seen, [other, live], NOW);
    expect(scan.events).toEqual([{ eventKey: `preorder:${SLUG}:2026-11-27`, payload: { kind: "channel_preorder", slugs: [SLUG] } }]);
  });

  it("writes a post that opens the site's cart with the piece in it", () => {
    const result = channelPreorderPost({ slugs: [SLUG] }, [live], "GearDropNewsBot", "stripe");
    if (!result.ok) throw new Error(result.reason);
    expect(result.post.text.split("\n")).toEqual([
      "PRE-ORDINE // solo sul canale",
      "<b>CX-20 Customize Set C</b>",
      "<b>€140,00</b> · 8 pezzi",
      PREORDER_DELIVERY,
      "Si paga sul sito, con carta, PayPal o Revolut. Questi pezzi sono solo per il canale: sul sito si ordina quando arriva in magazzino.",
    ]);
    expect(result.post.link).toEqual({
      label: "Pre-ordina",
      url: `https://geardropshop.it/carrello?preordine=${SLUG}&utm_source=telegram&utm_medium=social&utm_campaign=news`,
    });
    // The picture made for this post, not the packshot.
    expect(result.post.photoUrl).toBe(`https://geardropshop.it/telegram/${SLUG}.jpg`);
  });

  it("announces the arrival, not a pre-order, when the pieces reach the shelf", () => {
    const withPreorder = new Map([...seen, ...scanProducts(seen, [other, live], NOW).memory]);
    const [arrived] = applyLiveStock([catalogued], [{ ...row, stock_status: "disponibile", stock_quantity: 12, preorder_allocation: 0, availability_override: null }]);
    const scan = scanProducts(withPreorder, [other, arrived!], NOW);
    expect(scan.events).toEqual([{ eventKey: `new:${SLUG}`, payload: { kind: "new_product", slugs: [SLUG] } }]);
  });
});
