/**
 * The Takara Tomy pieces the shop bought itself (owner, 2026-11-06): they carry the Takara Tomy brand
 * but none of the partner's rules, because they sit on the shop's own shelf.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PRODUCTS, SHIPPING_METHODS, brandOf, partnerLines, shippingBrandOf, shippingMethodsFor } from "@/data/catalog";
import { STOREFRONT_CATALOGUE, createMockProvider } from "@/lib/commerce/mock-provider";
import { orderChoices } from "@/lib/commerce/order-choices";
import { oneCardPerFamily } from "@/lib/commerce/variants";
import { homepagePlan } from "@/lib/home/product-selection";

/** What the owner listed: selling price in cents and pieces on the shelf. */
const OWNER_LIST: Readonly<Record<string, { readonly price: number; readonly stock: number }>> = {
  "bx-48-random-booster-vol-9": { price: 3699, stock: 6 },
  "cx-18-random-booster-brachio-whip": { price: 3000, stock: 20 },
  "custom-grip-takara-tomy": { price: 2599, stock: 15 },
  "long-winder-launcher-takara-tomy": { price: 2000, stock: 6 },
  "string-launcher-takara-tomy": { price: 1699, stock: 9 },
  "winder-launcher-takara-tomy": { price: 1299, stock: 33 },
};

/** What sells below its listing price today. The owner, 2026-11-15: the Brachio at 28,00, on promotion. */
const PROMOTIONS: Readonly<Record<string, number>> = {
  "cx-18-random-booster-brachio-whip": 2800,
};

const pieces = PRODUCTS.filter((product) => product.slug in OWNER_LIST);
const piece = (slug: string) => PRODUCTS.find((product) => product.slug === slug)!;
const consignmentPiece = PRODUCTS.find((product) => product.consignment)!;
const hasbroPiece = PRODUCTS.find((product) => product.slug === "cobalt-dragoon-2-60c")!;

describe("the owner's list", () => {
  it("is in the catalogue at the listed prices and quantities, under Takara Tomy", () => {
    expect(pieces).toHaveLength(Object.keys(OWNER_LIST).length);
    for (const product of pieces) {
      const listed = OWNER_LIST[product.slug]!;
      expect(product.price.amount, product.slug).toBe(PROMOTIONS[product.slug] ?? listed.price);
      expect(product.availableQuantity, product.slug).toBe(listed.stock);
      expect(product.stock, product.slug).toBe("disponibile");
      expect(brandOf(product), product.slug).toBe("takara-tomy");
    }
  });

  it("shows all of it in the Takara Tomy section, ahead of the partner's limited editions", async () => {
    const page = await createMockProvider().listProducts({ brand: "takara-tomy", perPage: 48 });
    const slugs = page.items.map((product) => product.slug);
    expect(slugs).toEqual(expect.arrayContaining(Object.keys(OWNER_LIST)));
    expect(slugs.indexOf("winder-launcher-takara-tomy")).toBeLessThan(slugs.indexOf(consignmentPiece.slug));
  });
});

describe("the Brachio Whip promotion (owner, 2026-11-15)", () => {
  const SLUG = "cx-18-random-booster-brachio-whip";
  const brachio = piece(SLUG);

  it("sells at 28,00 against the 30,00 it was listed at, under the offer tag and still a new release", () => {
    expect(brachio.price.amount).toBe(2800);
    // The listing price is the only one it has had: the lowest of the previous 30 days.
    expect(brachio.compareAtPrice?.amount).toBe(OWNER_LIST[SLUG]!.price);
    // The card shows the first tag.
    expect(brachio.tags).toEqual(["offerta", "novita"]);
  });

  it("joins the promotions on the first screen, after the loose Phoenix and before the bundles", () => {
    const plan = homepagePlan(oneCardPerFamily(STOREFRONT_CATALOGUE), 5);
    const slugs = plan.hero.map((product) => product.slug);
    expect(plan.heroIsPromos).toBe(true);
    expect(slugs).toContain(SLUG);
    expect(slugs.indexOf(SLUG)).toBeGreaterThan(slugs.indexOf("soar-phoenix-9-60gf-solo-trottola"));
    expect(slugs.indexOf(SLUG)).toBeLessThan(plan.hero.findIndex((product) => product.bundleOf));
    expect(plan.spotlight.map((product) => product.slug)).not.toContain(SLUG);
  });

  it("tells Google the sale price next to the full one", async () => {
    const { GET } = await import("@/app/google-merchant.xml/route");
    const xml = await (await GET()).text();
    const chunk = xml.split("<item>").find((item) => item.includes(`<g:id>${SLUG}</g:id>`)) ?? "";
    expect(chunk).toContain("<g:price>30.00 EUR</g:price>");
    expect(chunk).toContain("<g:sale_price>28.00 EUR</g:sale_price>");
  });

  it("is mirrored by its migration: price, struck-through price and offer tag, stock untouched", () => {
    const promo = readFileSync("supabase/migrations/20261115120000_brachio_whip_promo.sql", "utf8");
    expect(promo).toContain(`where slug = '${SLUG}'`);
    expect(promo).toContain("price_cents = 2800");
    expect(promo).toContain("compare_at_price_cents = 3000");
    expect(promo).toContain("'offerta'::public.promo_tag");
    expect(promo).toContain("on conflict (product_id, tag) do nothing");
    expect(promo).not.toContain("stock_quantity");
  });
});

describe("they are not the partner's", () => {
  it("are not consignment, and owe the partner nothing", () => {
    for (const product of pieces) {
      expect(product.consignment, product.slug).toBeUndefined();
      expect(product.commissionCents, product.slug).toBeUndefined();
    }
    const lines = pieces.map((product) => ({ slug: product.slug, name: product.name, quantity: 1, unitPriceCents: product.price.amount }));
    expect(partnerLines(lines)).toEqual([]);
  });

  it("ship like the shop's other pieces", () => {
    for (const product of pieces) {
      expect(shippingBrandOf(product), product.slug).toBe("hasbro");
      expect(shippingMethodsFor(product), product.slug).toEqual(SHIPPING_METHODS);
    }
    expect(shippingBrandOf(consignmentPiece)).toBe("takara-tomy");
  });

  it("a cart of them keeps the Locker, with nothing locking it", async () => {
    const quote = await createMockProvider().quoteCart({ lines: [{ slug: "winder-launcher-takara-tomy", quantity: 1 }] });
    expect(quote.shippingCode).toBe("inpost-locker");
    expect(quote.shippingOptions.map((option) => option.locked)).toEqual([undefined]);
    expect(quote.shippingOptions.map((option) => option.lockReasons)).toEqual([undefined]);
  });

  it("a cart with a Hasbro piece is one parcel, not a mixed one", async () => {
    const quote = await createMockProvider().quoteCart({
      lines: [
        { slug: "bx-48-random-booster-vol-9", quantity: 1 },
        { slug: hasbroPiece.slug, quantity: 1 },
      ],
    });
    expect(quote.shippingCode).toBe("inpost-locker");
    expect(quote.shippingOptions.flatMap((option) => option.lockReasons ?? [])).toEqual([]);
  });

  it("a cart with the partner's piece is two parcels: mixed, on the shop's Locker", async () => {
    const quote = await createMockProvider().quoteCart({
      lines: [
        { slug: "bx-48-random-booster-vol-9", quantity: 1 },
        { slug: consignmentPiece.slug, quantity: 1 },
      ],
    });
    expect(quote.shippingCode).toBe("inpost-locker");
    expect(quote.shippingOptions.flatMap((option) => option.lockReasons ?? [])).toEqual(["mixed"]);
  });

  it("the Merchant feed names Takara Tomy and quotes the Locker", async () => {
    const { GET } = await import("@/app/google-merchant.xml/route");
    const xml = await (await GET()).text();
    for (const product of pieces) {
      const chunk = xml.split("<item>").find((item) => item.includes(`<g:id>${product.slug}</g:id>`)) ?? "";
      expect(chunk, product.slug).toContain("<g:brand>Takara Tomy</g:brand>");
      expect(chunk, product.slug).toContain("<g:service>InPost · Locker</g:service>");
    }
  });
});

describe("the page says what the box does not", () => {
  it("BX-48: one of five tops at random, and it names them, with the one that spins left", () => {
    const { description, specs, features } = piece("bx-48-random-booster-vol-9");
    expect(description).toContain("a caso e sigillata: non si sceglie");
    expect(description).toContain("Il lanciatore non è incluso");
    expect(specs.find((spec) => spec.label === "Contenuto")?.value).toContain("a caso tra 5");
    expect(features.at(-1)?.title).toBe("Da sapere prima di comprare");
    for (const top of ["Cobalt Dragoon 9-80F", "Shark Edge 4-70E", "Mammoth Tusk 7-60S", "Hells Scythe 3-85GB", "Dran Buster 2-80Q"]) {
      expect(description).toContain(top);
      expect(specs.find((spec) => spec.label === "Varianti")?.value).toContain(top);
    }
    expect(description).toContain("Cobalt Dragoon gira a sinistra");
  });

  it("CX-18: always the same top, at random only the colour (owner, 2026-11-06)", () => {
    const { description, specs, features } = piece("cx-18-random-booster-brachio-whip");
    expect(description).toContain("la trottola è sempre questa, a caso è solo il colore");
    expect(description).toContain("non si sceglie");
    expect(description).toContain("Il lanciatore non è incluso");
    expect(specs.find((spec) => spec.label === "Contenuto")?.value).toContain("a caso solo il colore");
    expect(features.at(-1)?.title).toBe("Da sapere prima di comprare");
  });

  it("the winder: the buyer says right or left, the colour is assorted", () => {
    const { description, specs, features } = piece("winder-launcher-takara-tomy");
    expect(description).toContain("Ci sono sia destri (right) sia sinistri (L), che lanciano solo le trottole a rotazione sinistra");
    expect(description).toContain("scrivi quale vuoi nelle note dell'ordine");
    expect(description).toContain("senza indicazioni spediamo il destro");
    expect(description).toContain("non si sceglie");
    expect(specs.find((spec) => spec.label === "Rotazione")?.value).toContain("nelle note dell'ordine");
    expect(features.at(-1)?.description).toContain("destro (right) o sinistro (L)");
  });

  it("the string launcher: only the left-spin ones are left (owner, 2026-11-13), so nothing to choose", () => {
    const { name, description, specs, features, boxContents } = piece("string-launcher-takara-tomy");
    expect(name).toBe("String Launcher L Takara Tomy");
    expect(description).toContain("Sono rimasti solo i sinistri (L)");
    expect(description).toContain("le trottole a rotazione destra non le lancia");
    expect(description).not.toMatch(/destri \(right\)|spediamo il destro|note dell'ordine/);
    expect(specs.find((spec) => spec.label === "Rotazione")?.value).toBe("Sinistra (L): solo trottole left-spin");
    expect(features.at(-1)?.description).toContain("Solo sinistro (L)");
    expect(boxContents).toEqual(["1 × String Launcher L Takara Tomy"]);
  });

  it("the grip: the black BX-11 Launcher Grip since 2026-11-24, nothing to choose", () => {
    const { name, description, specs, features, boxContents, variant, images } = piece("custom-grip-takara-tomy");
    expect(name).toBe("BX-11 Launcher Grip Takara Tomy");
    expect(variant).toBeUndefined();
    expect(description).toContain("nera");
    expect(description).not.toMatch(/BX-30|BX-41|BX-42|note dell'ordine|colore preciso/);
    expect(specs.find((spec) => spec.label === "Colore")?.value).toBe("Nero");
    expect(features.at(-1)?.description).toContain("Il lanciatore non è incluso");
    expect(boxContents).toEqual(["1 × Launcher Grip BX-11", "1 × Pannello del grip"]);
    // Takara Tomy's own renders: the grip, then with its panel off, then from below.
    expect(images.map((image) => image.src)).toEqual([
      "/products/custom-grip-takara-tomy.webp",
      "/products/custom-grip-takara-tomy-bx11_05.webp",
      "/products/custom-grip-takara-tomy-bx11_02.webp",
    ]);
  });

  it("the launchers come in a bag, and Google is told they have no barcode", async () => {
    const { GET } = await import("@/app/google-merchant.xml/route");
    const xml = await (await GET()).text();
    for (const slug of ["winder-launcher-takara-tomy", "string-launcher-takara-tomy", "long-winder-launcher-takara-tomy"]) {
      expect(piece(slug).description, slug).toContain("in busta");
      const chunk = xml.split("<item>").find((item) => item.includes(`<g:id>${slug}</g:id>`)) ?? "";
      expect(chunk, slug).toContain("<g:identifier_exists>no</g:identifier_exists>");
    }
  });
});

describe("what the buyer is asked at the checkout", () => {
  it("lists a choice for each piece that has one, and nothing for the rest", () => {
    expect(orderChoices(["winder-launcher-takara-tomy"])).toEqual(["Winder Launcher, destro (right) o sinistro (L)"]);
    expect(orderChoices(["string-launcher-takara-tomy"])).toEqual([]);
    // The BX-11 grip is one black edition: nothing to ask (2026-11-24).
    expect(orderChoices(["custom-grip-takara-tomy"])).toEqual([]);
    expect(orderChoices(["bx-48-random-booster-vol-9", "long-winder-launcher-takara-tomy", hasbroPiece.slug])).toEqual([]);
  });

  it("the checkout and the cart both show it", () => {
    const checkout = readFileSync("src/app/(storefront)/checkout/checkout-client.tsx", "utf8");
    const cart = readFileSync("src/app/(storefront)/carrello/cart-client.tsx", "utf8");
    expect(checkout).toContain('data-testid="checkout-order-choices"');
    expect(cart).toContain('data-testid="cart-order-choices"');
  });
});

describe("the migration", () => {
  const migration = readFileSync("supabase/migrations/20261106120000_takara_tomy_on_the_shop_shelf.sql", "utf8");
  // The String Launcher's words were rewritten when only the left-spin ones were left.
  const leftOnly = readFileSync("supabase/migrations/20261113120000_soar_phoenix_loose_and_string_launcher_l.sql", "utf8");
  // The grip's listing became the black BX-11 Launcher Grip (2026-11-24): new words and photos.
  const bx11 = readFileSync("supabase/migrations/20261124130000_bx11_launcher_grip.sql", "utf8");

  it("mirrors the catalogue: price, stock and every photo", () => {
    for (const product of pieces) {
      const listed = OWNER_LIST[product.slug]!;
      const words = product.slug === "string-launcher-takara-tomy" ? leftOnly : product.slug === "custom-grip-takara-tomy" ? bx11 : migration;
      const photos = product.slug === "custom-grip-takara-tomy" ? bx11 : migration;
      expect(migration, product.slug).toContain(`${listed.price}, ${listed.stock},`);
      expect(migration, product.slug).toContain(`'${product.slug}'`);
      expect(words, product.slug).toContain(`${product.description.replaceAll("'", "''")}`);
      for (const image of product.images) expect(photos, image.src).toContain(`'${image.src}'`);
    }
  });

  it("sells out at zero, and never resets a count on a replay", () => {
    expect(migration).toContain("null, 0, false, null, 0, 0, seed.sort_order");
    expect(migration).toContain("where not exists (select 1 from public.products as existing where existing.slug = seed.slug)");
  });

  it("does not put what the shop paid in a public repository", () => {
    expect(migration.toLowerCase()).not.toMatch(/\bcost|costo|paid|pagat/);
    expect(bx11.toLowerCase()).not.toMatch(/\bcost|costo|pagat/);
  });

  it("turns the grip into the BX-11 without touching its price, its stock or its address", () => {
    const grip = piece("custom-grip-takara-tomy");
    expect(bx11).toContain(`name = '${grip.name}'`);
    expect(bx11).toContain("sku = case when product.sku = 'CUSTOM-GRIP-TAKARA-TOMY' then 'BX-11' else product.sku end");
    expect(bx11).not.toMatch(/price_cents|stock_quantity|set slug/);
    for (const spec of grip.specs) expect(bx11, spec.label).toContain(`('${spec.label}', '${spec.value}'`);
    for (const content of grip.boxContents) expect(bx11, content).toContain(`('${content}'`);
  });
});
