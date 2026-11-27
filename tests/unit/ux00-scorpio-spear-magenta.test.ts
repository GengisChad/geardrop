/**
 * UX-00 Scorpio Spear 0-70Z Metal Coat: Magenta (owner, 2026-11-27): two pieces, pre-ordered on
 * Telegram only and paid with PayPal.me only ("metti pre-order due scorpion spear ma quello magenta,
 * al vendita al prezzo di 100euro", "Telegram, PayPal.me"). No page of the shop lists it while it
 * is a pre-order.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PRODUCTS, brandOf, fitsLocker } from "@/data/catalog";
import { hiddenFromShop, isArriving, shopView } from "@/lib/commerce/channel-only";
import { createMockProvider } from "@/lib/commerce/mock-provider";
import { PREORDER_DELIVERY } from "@/lib/labels";
import { channelPreorderPost } from "@/lib/telegram/messages";
import { scanProducts } from "@/lib/telegram/news";
import { paypalMeUrl, preorderOpen, preorderTotals } from "@/lib/telegram/preorder-rules";

const SLUG = "ux-00-scorpio-spear-0-70z-magenta";
const spear = PRODUCTS.find((product) => product.slug === SLUG)!;
const other = PRODUCTS.find((product) => product.slug === "glory-valkerion-lf")!;

describe("the Scorpio Spear Magenta in the catalogue", () => {
  it("is Takara Tomy's UX-00 at the owner's price, two pieces, paid with PayPal.me only", () => {
    expect(spear).toMatchObject({
      name: "UX-00 Scorpio Spear 0-70Z Metal Coat: Magenta",
      price: { amount: 10000, currency: "EUR" },
      category: "beyblade-x",
      stock: "pre-ordine",
      availableQuantity: 2,
      channelOnly: true,
      channelPayment: "paypal",
    });
    expect(brandOf(spear)).toBe("takara-tomy");
    expect(fitsLocker(spear)).toBe(true);
  });

  it("says what Takara Tomy's sheet says: booster only, no launcher, Metal Coat paint warning", () => {
    const spec = (label: string) => spear.specs.find((entry) => entry.label === label)?.value;
    expect(spec("Tipo")).toContain("Booster");
    expect(spec("Non inclusi")).toBe("Lanciatore, stadio");
    expect(spear.description).toContain("Metal Coat può consumarsi");
    expect(spear.boxContents).toEqual(["1 × Trottola Scorpio Spear 0-70Z Metal Coat Magenta", "Istruzioni in giapponese"]);
    expect(spear.images).toHaveLength(1);
  });

  it("is written into the database by a migration that says the same words", () => {
    const migration = readFileSync("supabase/migrations/20261127170000_ux00_scorpio_spear_magenta.sql", "utf8").replaceAll("''", "'");
    for (const text of [spear.name, spear.tagline, spear.images[0]!.src, spear.images[0]!.alt]) expect(migration).toContain(`'${text}'`);
    expect(migration).toContain("10000, 45)");
    expect(migration).toContain("'preorder'::public.availability_override, 2, false");
  });
});

describe("kept out of the shop", () => {
  it("is in no list, search or filter, and reads as it is by its own link", async () => {
    expect(hiddenFromShop(spear)).toBe(true);
    expect(isArriving(spear)).toBe(false);
    expect(shopView(spear)).toBe(spear);
    const provider = createMockProvider([spear, other]);
    expect((await provider.listProducts({ perPage: 100 })).items.map((product) => product.slug)).toEqual([other.slug]);
    expect((await provider.listProducts({ search: "Scorpio" })).total).toBe(0);
    expect((await provider.getFacets()).total).toBe(1);
  });
});

describe("pre-ordered in the bot with PayPal.me", () => {
  it("ships free: at €100 the piece alone meets the free-shipping threshold", () => {
    // FREE_SHIPPING_THRESHOLD is 10000 (€100). One piece of €100 already qualifies.
    expect(preorderOpen(spear)).toBe(true);
    expect(preorderTotals(spear, 1)).toMatchObject({ unitCents: 10000, shippingCents: 0, totalCents: 10000 });
    expect(preorderTotals(spear, 2)).toMatchObject({ shippingCents: 0, totalCents: 20000 });
    expect(paypalMeUrl("federicosangroyal", 10000)).toBe("https://paypal.me/federicosangroyal/100.00EUR");
  });

  it("is announced on the channel with one button that opens the bot", () => {
    const NOW = new Date("2026-11-27T09:00:00.000Z");
    const seen = new Map(scanProducts(new Map(), [other], NOW, true).memory);
    expect(scanProducts(seen, [other, spear], NOW).events).toEqual([{ eventKey: `preorder:${SLUG}:2026-11-27`, payload: { kind: "channel_preorder", slugs: [SLUG] } }]);

    const result = channelPreorderPost({ slugs: [SLUG] }, [spear], "GearDropNewsBot", "paypal");
    if (!result.ok) throw new Error(result.reason);
    expect(result.post.text.split("\n")).toEqual([
      "PRE-ORDINE // solo sul canale",
      "<b>UX-00 Scorpio Spear 0-70Z Metal Coat: Magenta</b>",
      "<b>€100,00</b> · 2 pezzi",
      PREORDER_DELIVERY,
      "Si prenota e si paga qui. Sul sito arriva quando è in magazzino.",
    ]);
    expect(result.post.link).toEqual({ label: "Pre-ordina", url: `https://t.me/GearDropNewsBot?start=pre-${SLUG}` });
    // The picture made for this post, not the packshot.
    expect(result.post.photoUrl).toBe(`https://geardropshop.it/telegram/${SLUG}.jpg`);
    expect(result.post.videoUrl).toBeUndefined();
  });

  it("has no Stripe product: the site checkout cannot sell it", () => {
    // channelOnly: true + channelPayment: "paypal" means no Stripe product is ever created.
    expect(spear.channelOnly).toBe(true);
    expect(spear.channelPayment).toBe("paypal");
  });
});
