/**
 * Tests for Package A: delivery copy, trust copy, SEO improvements.
 * Covers items 1, 4, 15, 16, 19, 20 from the work package.
 */
import { describe, expect, it } from "vitest";
import { PRODUCTS, BUNDLES } from "../../src/data/catalog";
import { STANDARD_DELIVERY, PREORDER_DELIVERY } from "../../src/lib/labels";
import { SUPPORT_PAGES, LEGAL_PAGES } from "../../src/data/pages";
import { productJsonLd } from "../../src/lib/seo";
import { DEFAULT_HERO_TITLE, NEW_RELEASES_HERO_TITLE, heroTitleLines } from "../../src/lib/home/hero-title";
import { HOMEPAGE_SECTION_SEEDS } from "../../src/data/content-seed";

// ---------------------------------------------------------------------------
// Item 1: STANDARD_DELIVERY constant and no stale "14 giorni dalla conferma"
// dispatch copy in src/
// ---------------------------------------------------------------------------

describe("STANDARD_DELIVERY constant", () => {
  it("is defined and contains 1-5 giorni lavorativi", () => {
    expect(STANDARD_DELIVERY).toContain("1-5 giorni lavorativi");
    expect(STANDARD_DELIVERY).toBeTruthy();
  });

  it("does not mention 14 giorni dalla conferma", () => {
    expect(STANDARD_DELIVERY).not.toContain("14 giorni");
  });

  it("PREORDER_DELIVERY still describes pre-order timing", () => {
    expect(PREORDER_DELIVERY).toContain("10/15 giorni lavorativi");
  });
});

describe("pages.ts delivery copy", () => {
  it("spedizioni Tempi di consegna uses 1-5 giorni not 14 days", () => {
    const spedizioni = SUPPORT_PAGES.spedizioni;
    const tempi = spedizioni.sections.find((s) => s.heading === "Tempi di consegna");
    expect(tempi).toBeDefined();
    const body = tempi!.body.join(" ");
    expect(body).toContain("1-5 giorni lavorativi");
    expect(body).not.toContain("14 giorni dalla conferma");
  });

  it("spedizioni has Italy-only destination section", () => {
    const spedizioni = SUPPORT_PAGES.spedizioni;
    const destinazioni = spedizioni.sections.find((s) => s.heading === "Destinazioni");
    expect(destinazioni).toBeDefined();
    expect(destinazioni!.body.join(" ")).toContain("solo in Italia");
  });

  it("termini spedizione e consegna mentions Italy-only and 1-5 days", () => {
    const termini = LEGAL_PAGES.termini;
    const consegna = termini.sections.find((s) => s.heading === "Spedizione e consegna");
    expect(consegna).toBeDefined();
    const body = consegna!.body.join(" ");
    expect(body).toContain("1-5 giorni lavorativi");
    expect(body).toContain("solo in Italia");
  });
});

// ---------------------------------------------------------------------------
// Item 4: Privacy page lists all data processors
// ---------------------------------------------------------------------------

describe("privacy page processors", () => {
  const privacySection = LEGAL_PAGES.privacy.sections.find((s) => s.heading === "A chi li comunichiamo");

  it("lists Stripe as payment processor", () => {
    const body = privacySection!.body.join(" ");
    expect(body).toContain("Stripe");
  });

  it("lists Vercel for hosting", () => {
    const body = privacySection!.body.join(" ");
    expect(body).toContain("Vercel");
  });

  it("lists Supabase for orders and accounts", () => {
    const body = privacySection!.body.join(" ");
    expect(body).toContain("Supabase");
  });

  it("lists Resend for emails", () => {
    const body = privacySection!.body.join(" ");
    expect(body).toContain("Resend");
  });

  it("mentions availability notice email retention policy", () => {
    const body = privacySection!.body.join(" ");
    expect(body).toContain("notifica di disponibilità");
    expect(body).toContain("sei mesi");
  });
});

// ---------------------------------------------------------------------------
// Item 15: contatti page no longer references social channels
// ---------------------------------------------------------------------------

describe("contatti page social channels", () => {
  it("does not reference social channels", () => {
    const contatti = SUPPORT_PAGES.contatti;
    const allText = contatti.sections.flatMap((s) => s.body).join(" ");
    expect(allText).not.toContain("canali social");
    expect(allText).not.toContain("sui canali");
  });

  it("points to email for community questions", () => {
    const community = SUPPORT_PAGES.contatti.sections.find((s) => s.heading === "Community");
    expect(community).toBeDefined();
    expect(community!.body.join(" ")).toContain("infogeardrop@gmail.com");
  });
});

// ---------------------------------------------------------------------------
// Item 16: Products are marked as Hasbro originals
// ---------------------------------------------------------------------------

describe("catalog authenticity", () => {
  it("every product has a Produttore spec for Hasbro", () => {
    for (const product of PRODUCTS) {
      const hasbro = product.specs.find((s) => s.label === "Produttore");
      expect(hasbro, `${product.slug} is missing Produttore spec`).toBeDefined();
      expect(hasbro!.value).toContain("Hasbro");
    }
  });

  it("every bundle has a Produttore spec for Hasbro", () => {
    for (const bundle of BUNDLES) {
      const hasbro = bundle.specs.find((s) => s.label === "Produttore");
      expect(hasbro, `${bundle.slug} is missing Produttore spec`).toBeDefined();
      expect(hasbro!.value).toContain("Hasbro");
    }
  });

  it("faq has an authenticity entry", () => {
    const entry = SUPPORT_PAGES.faq.sections.find((s) => s.heading === "I prodotti sono originali?");
    expect(entry).toBeDefined();
    expect(entry!.body.join(" ")).toContain("Hasbro");
  });
});

describe("SEO JSON-LD brand", () => {
  const glory = PRODUCTS.find((p) => p.slug === "glory-valkerion-lf")!;

  it("product JSON-LD brand is Hasbro not Beyblade X", () => {
    const data = productJsonLd(glory);
    expect(data.brand).toEqual({ "@type": "Brand", name: "Hasbro" });
    expect(JSON.stringify(data.brand)).not.toContain("Beyblade X");
  });

  it("product JSON-LD includes shippingDetails deliveryTime", () => {
    const data = productJsonLd(glory);
    expect(data.offers.shippingDetails).toMatchObject({
      deliveryTime: {
        "@type": "ShippingDeliveryTime",
        handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 1, unitCode: "DAY" },
        transitTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 4, unitCode: "DAY" },
      },
    });
  });

  it("deliveryTime business days cover Monday through Friday", () => {
    const data = productJsonLd(glory);
    const businessDays = (data.offers.shippingDetails as { deliveryTime: { businessDays: { dayOfWeek: string[] } } }).deliveryTime.businessDays;
    expect(businessDays.dayOfWeek).toEqual(expect.arrayContaining(["Monday", "Friday"]));
  });
});

// ---------------------------------------------------------------------------
// Item 19: H1 includes Beyblade X originali keyword
// ---------------------------------------------------------------------------

describe("hero title SEO", () => {
  it("DEFAULT_HERO_TITLE includes Beyblade X originali", () => {
    expect(DEFAULT_HERO_TITLE).toContain("Beyblade X");
    expect(DEFAULT_HERO_TITLE.toLowerCase()).toContain("originali");
  });

  it("NEW_RELEASES_HERO_TITLE includes Beyblade X originali", () => {
    expect(NEW_RELEASES_HERO_TITLE).toContain("Beyblade X");
    expect(NEW_RELEASES_HERO_TITLE.toLowerCase()).toContain("originali");
  });

  it("default hero renders exactly three lines", () => {
    const lines = heroTitleLines(DEFAULT_HERO_TITLE);
    expect(lines).toHaveLength(3);
  });

  it("homepage hero seed title includes Beyblade X originali", () => {
    const hero = HOMEPAGE_SECTION_SEEDS.find((s) => s.key === "hero");
    expect(hero).toBeDefined();
    expect(hero!.title).toContain("Beyblade X");
    expect(hero!.title.toLowerCase()).toContain("originali");
  });

  it("homepage hero seed eyebrow mentions Hasbro originals", () => {
    const hero = HOMEPAGE_SECTION_SEEDS.find((s) => s.key === "hero");
    expect(hero!.eyebrow).toContain("Hasbro");
  });
});
