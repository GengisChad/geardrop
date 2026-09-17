import { describe, expect, it } from "vitest";
import { z } from "zod";
import { BUNDLES, PRODUCTS } from "@/data/catalog";
import { escapeHtml } from "@/lib/orders/order-email";
import { restockNotificationEmail } from "@/lib/orders/restock-email";
import type { RestockDemand } from "@/lib/admin/inventory-restock";

// ---------------------------------------------------------------------------
// Form schema (mirrors the action so tests are independent of the server)
// ---------------------------------------------------------------------------
const restockNoticeSchema = z.object({
  slug: z.string().min(1).max(120).trim(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Controlla l'indirizzo email.")
    .max(320, "Controlla l'indirizzo email.")
    .email("Controlla l'indirizzo email."),
});

describe("restock notice form schema", () => {
  it("accepts a valid slug and email", () => {
    const result = restockNoticeSchema.safeParse({
      slug: "cobalt-dragoon-2-60c",
      email: "user@example.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("user@example.com");
    }
  });

  it("normalises email to lower-case", () => {
    const result = restockNoticeSchema.safeParse({
      slug: "slug",
      email: "User@Example.COM",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("user@example.com");
  });

  it("rejects an email without @", () => {
    const result = restockNoticeSchema.safeParse({ slug: "slug", email: "notanemail" });
    expect(result.success).toBe(false);
    const issue = result.success ? null : result.error.issues[0];
    expect(issue?.message).toContain("Controlla l'indirizzo email.");
  });

  it("rejects an empty email", () => {
    const result = restockNoticeSchema.safeParse({ slug: "slug", email: "" });
    expect(result.success).toBe(false);
  });

  it("rejects an email longer than 320 characters", () => {
    // 316 'a's + "@b.co" = 321 characters, which exceeds the 320-char max.
    const long = "a".repeat(316) + "@b.co";
    expect(long.length).toBeGreaterThan(320);
    const result = restockNoticeSchema.safeParse({ slug: "slug", email: long });
    expect(result.success).toBe(false);
  });

  it("rejects an empty slug", () => {
    const result = restockNoticeSchema.safeParse({ slug: "", email: "a@b.co" });
    expect(result.success).toBe(false);
  });

  it("trims whitespace from slug", () => {
    const result = restockNoticeSchema.safeParse({ slug: "  cobalt  ", email: "a@b.co" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.slug).toBe("cobalt");
  });
});

// ---------------------------------------------------------------------------
// Restock email content
// ---------------------------------------------------------------------------
describe("restockNotificationEmail", () => {
  const input = {
    productName: "Glory Valkerion LF",
    productSlug: "glory-valkerion-lf",
    to: "buyer@example.com",
  };

  it("addresses the correct recipient", () => {
    const email = restockNotificationEmail(input);
    expect(email.to).toBe("buyer@example.com");
  });

  it("has the product name in the subject", () => {
    const email = restockNotificationEmail(input);
    expect(email.subject).toContain("Glory Valkerion LF");
    expect(email.subject).toContain("GEAR//DROP");
  });

  it("html body mentions the product and a CTA link to the PDP", () => {
    const email = restockNotificationEmail(input);
    expect(email.html).toContain("Glory Valkerion LF");
    expect(email.html).toContain("glory-valkerion-lf");
    expect(email.html).toContain("Acquista ora");
    expect(email.html).toContain("geardropshop.it/prodotto/glory-valkerion-lf");
  });

  it("text body contains the PDP URL", () => {
    const email = restockNotificationEmail(input);
    expect(email.text).toContain("geardropshop.it/prodotto/glory-valkerion-lf");
  });

  it("includes an unsubscribe/privacy note", () => {
    const email = restockNotificationEmail(input);
    expect(email.html).toContain("Hai ricevuto questa email");
    expect(email.text).toContain("avviso di disponibilità");
  });

  it("escapes HTML in the product name", () => {
    const xss = restockNotificationEmail({
      productName: '<script>alert("xss")</script>',
      productSlug: "test-product",
      to: "buyer@example.com",
    });
    // escapeHtml uses numeric entities: < → &#60; > → &#62;
    expect(xss.html).not.toContain("<script>");
    expect(xss.html).toContain("&#60;script&#62;");
  });
});

// ---------------------------------------------------------------------------
// escapeHtml (shared from order-email, reused by restock-email)
// ---------------------------------------------------------------------------
describe("escapeHtml (restock context)", () => {
  it("escapes all five dangerous characters", () => {
    expect(escapeHtml('a & b < c > d " e \' f')).toBe(
      "a &#38; b &#60; c &#62; d &#34; e &#39; f",
    );
  });

  it("leaves safe text unchanged", () => {
    expect(escapeHtml("Glory Valkerion LF")).toBe("Glory Valkerion LF");
  });
});

// ---------------------------------------------------------------------------
// Bundle demand aggregation (TypeScript side of getRestockDemand)
// ---------------------------------------------------------------------------
describe("bundle component expansion for restock demand", () => {
  it("BUNDLES catalogue has at least one bundle with components", () => {
    const withComponents = BUNDLES.filter((b) => b.bundleOf && b.bundleOf.length > 0);
    expect(withComponents.length).toBeGreaterThan(0);
  });

  it("every bundle component slug exists in PRODUCTS", () => {
    const productSlugs = new Set(PRODUCTS.map((p) => p.slug));
    for (const bundle of BUNDLES) {
      for (const component of bundle.bundleOf ?? []) {
        expect(productSlugs.has(component.slug), `${component.slug} not in PRODUCTS`).toBe(true);
      }
    }
  });

  it("aggregates bundle preorder demand over its components", () => {
    // Simulate the TypeScript aggregation logic from inventory-restock.ts.
    const duo = BUNDLES.find((b) => b.slug === "duo-horus-enlil");
    expect(duo?.bundleOf).toBeDefined();

    const mockRpcResults: RestockDemand[] = [
      { productSlug: "shatter-horus-9-65gb", pendingNotices: 1, preorderDemand: 3 },
      { productSlug: "hurricane-enlil-is-7-55t", pendingNotices: 0, preorderDemand: 2 },
      { productSlug: "duo-horus-enlil", pendingNotices: 2, preorderDemand: 0 },
    ];
    const bySlug = new Map(mockRpcResults.map((r) => [r.productSlug, r]));

    // Re-implement aggregation logic inline to test it.
    const duoBundleOf = duo?.bundleOf ?? [];
    const bundlePreorder = duoBundleOf.reduce((sum, part) => {
      return sum + (bySlug.get(part.slug)?.preorderDemand ?? 0);
    }, 0);
    // duo has 3 + 2 = 5 from its components.
    expect(bundlePreorder).toBe(5);

    // duo's own direct demand (from the RPC) is 0 preorder, plus bundle components = 5.
    const duoDirect = bySlug.get("duo-horus-enlil");
    expect((duoDirect?.preorderDemand ?? 0) + bundlePreorder).toBe(5);
  });
});
