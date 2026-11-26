/**
 * The BX-09 Beybattle Pass (owner, 2026-11-26): three pieces, pre-ordered on Telegram only and paid
 * with PayPal.me only ("Bx-09 solo paypal.me"). No page of the shop lists it while it is a pre-order.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PRODUCTS, brandOf, fitsLocker } from "@/data/catalog";
import { LEGAL_PAGES } from "@/data/pages";
import { hiddenFromShop, isArriving, shopView } from "@/lib/commerce/channel-only";
import { createMockProvider } from "@/lib/commerce/mock-provider";
import { PREORDER_DELIVERY } from "@/lib/labels";
import { channelPreorderPost } from "@/lib/telegram/messages";
import { scanProducts } from "@/lib/telegram/news";
import { UNPAID_DATA_DAYS, paypalMeUrl, preorderOpen, preorderTotals } from "@/lib/telegram/preorder-rules";

const SLUG = "bx-09-beybattle-pass";
const pass = PRODUCTS.find((product) => product.slug === SLUG)!;
const other = PRODUCTS.find((product) => product.slug === "glory-valkerion-lf")!;

describe("the Beybattle Pass in the catalogue", () => {
  it("is Takara Tomy's BX-09 at the owner's price, three pieces, paid with PayPal.me only", () => {
    expect(pass).toMatchObject({
      name: "BX-09 Beybattle Pass",
      price: { amount: 8000, currency: "EUR" },
      category: "accessori",
      stock: "pre-ordine",
      availableQuantity: 3,
      channelOnly: true,
      channelPayment: "paypal",
    });
    expect(brandOf(pass)).toBe("takara-tomy");
    expect(fitsLocker(pass)).toBe(true);
  });

  it("says what Takara Tomy's sheet says: batteries, top, launcher and phone are not in the box", () => {
    const spec = (label: string) => pass.specs.find((entry) => entry.label === label)?.value;
    expect(spec("Alimentazione")).toBe("2 pile alcaline AAA, non incluse");
    expect(spec("Non inclusi")).toBe("Trottola, lanciatore, launcher grip, stadio, smartphone");
    expect(pass.boxContents).toEqual(["1 × Beybattle Pass", "Istruzioni in giapponese"]);
    // One photo: the tool alone. The render with a launcher, a top and a phone would show what is not sold.
    expect(pass.images).toHaveLength(1);
  });

  it("is written into the database by a migration that says the same words", () => {
    const migration = readFileSync("supabase/migrations/20261126200000_bx09_beybattle_pass.sql", "utf8").replaceAll("''", "'");
    for (const text of [pass.name, pass.tagline, pass.description, pass.images[0]!.src, pass.images[0]!.alt]) expect(migration).toContain(`'${text}'`);
    expect(migration).toContain("8000, 44)");
    expect(migration).toContain("'preorder'::public.availability_override, 3, false");
  });
});

describe("kept out of the shop", () => {
  it("is in no list, search or filter, and reads as it is by its own link", async () => {
    expect(hiddenFromShop(pass)).toBe(true);
    expect(isArriving(pass)).toBe(false);
    expect(shopView(pass)).toBe(pass);
    const provider = createMockProvider([pass, other]);
    expect((await provider.listProducts({ perPage: 100 })).items.map((product) => product.slug)).toEqual([other.slug]);
    expect((await provider.listProducts({ search: "Beybattle" })).total).toBe(0);
    expect((await provider.getFacets()).total).toBe(1);
  });
});

describe("pre-ordered in the bot with PayPal.me", () => {
  it("costs the piece plus the Locker, and ships free from two", () => {
    expect(preorderOpen(pass)).toBe(true);
    expect(preorderTotals(pass, 1)).toMatchObject({ unitCents: 8000, shippingCents: 490, totalCents: 8490 });
    expect(preorderTotals(pass, 2)).toMatchObject({ shippingCents: 0, totalCents: 16000 });
    expect(paypalMeUrl("federicosangroyal", 8490)).toBe("https://paypal.me/federicosangroyal/84.90EUR");
  });

  it("is announced on the channel with one button that opens the bot", () => {
    const NOW = new Date("2026-11-27T09:00:00.000Z");
    const seen = new Map(scanProducts(new Map(), [other], NOW, true).memory);
    expect(scanProducts(seen, [other, pass], NOW).events).toEqual([{ eventKey: `preorder:${SLUG}:2026-11-27`, payload: { kind: "channel_preorder", slugs: [SLUG] } }]);

    const result = channelPreorderPost({ slugs: [SLUG] }, [pass], "GearDropNewsBot", "paypal");
    if (!result.ok) throw new Error(result.reason);
    expect(result.post.text.split("\n")).toEqual([
      "PRE-ORDINE // solo sul canale",
      "<b>BX-09 Beybattle Pass</b>",
      "<b>€80,00</b> · 3 pezzi",
      PREORDER_DELIVERY,
      "Si prenota e si paga qui. Sul sito arriva quando è in magazzino.",
    ]);
    expect(result.post.link).toEqual({ label: "Pre-ordina", url: `https://t.me/GearDropNewsBot?start=pre-${SLUG}` });
    // The picture made for this post, not the packshot.
    expect(result.post.photoUrl).toBe(`https://geardropshop.it/telegram/${SLUG}.jpg`);
    expect(result.post.videoUrl).toBeUndefined();
  });
});

describe("what the privacy notice says about it", () => {
  const sections = LEGAL_PAGES.privacy.sections;
  const body = (heading: string) => sections.find((section) => section.heading === heading)!.body.join(" ");

  it("names the data the bot collects, and who else sees it", () => {
    expect(body("Quali dati trattiamo")).toContain("Pre-ordine su Telegram");
    for (const word of ["nome utente Telegram", "email", "telefono", "Locker InPost"]) expect(body("Quali dati trattiamo")).toContain(word);
    expect(body("A chi li comunichiamo")).toContain("Telegram, che gestisce il canale e la chat con il nostro bot");
    expect(body("A chi li comunichiamo")).toContain("PayPal (Europe) S.à r.l. et Cie, S.C.A. (Lussemburgo)");
  });

  it("promises the same number of days the bot keeps to", () => {
    expect(UNPAID_DATA_DAYS).toBe(30);
    expect(body("Per quanto tempo")).toContain(`cancelliamo dopo ${UNPAID_DATA_DAYS} giorni tutto ciò che ti identifica`);
  });
});
