import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_HERO_TITLE, heroTitleLines } from "../../src/lib/home/hero-title";
import { selectHomepageCategories } from "../../src/lib/home/category-selection";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("hero headline lines", () => {
  it("renders the default as three lines with the last one carrying the accent", () => {
    const lines = heroTitleLines(DEFAULT_HERO_TITLE);
    expect(lines).toEqual(["Pronti alla", "battaglia.", "Nati per vincere."]);
    // The renderer paints the last line lime; here we pin that it is the closing statement.
    expect(lines.at(-1)).toBe("Nati per vincere.");
  });

  it("splits a single-line CMS title at its final sentence so the accent survives", () => {
    expect(heroTitleLines("Pronti alla battaglia. Nati per vincere.")).toEqual([
      "Pronti alla battaglia.",
      "Nati per vincere.",
    ]);
    // The accent is the LAST sentence, not the first — three sentences keep two leading.
    expect(heroTitleLines("Uno. Due. Tre.")).toEqual(["Uno. Due.", "Tre."]);
  });

  it("leaves a title with no sentence break as a single line", () => {
    expect(heroTitleLines("Solo un titolo")).toEqual(["Solo un titolo"]);
  });

  it("keeps exactly one accent line for any input, so the h1 stays single", () => {
    for (const title of [DEFAULT_HERO_TITLE, "A. B. C. D.", "Una frase sola", "Riga uno\nRiga due"]) {
      const lines = heroTitleLines(title);
      expect(lines.length).toBeGreaterThanOrEqual(1);
      expect(lines.at(-1)?.length).toBeGreaterThan(0);
    }
  });
});

describe("homepage category selection", () => {
  const all = [
    { slug: "beyblade-x" },
    { slug: "lanciatori" },
    { slug: "stadi" },
    { slug: "accessori" },
  ] as const;
  const renderable = new Set(all.map((category) => category.slug));

  it("shows exactly the CMS-selected categories, in the CMS order", () => {
    const picked = selectHomepageCategories(all, ["stadi", "beyblade-x"], renderable);
    expect(picked.map((category) => category.slug)).toEqual(["stadi", "beyblade-x"]);
  });

  it("reversing the CMS order reverses the tiles", () => {
    const forward = selectHomepageCategories(all, ["beyblade-x", "stadi"], renderable);
    const reversed = selectHomepageCategories(all, ["stadi", "beyblade-x"], renderable);
    expect(forward.map((c) => c.slug)).toEqual(["beyblade-x", "stadi"]);
    expect(reversed.map((c) => c.slug)).toEqual(["stadi", "beyblade-x"]);
  });

  it("falls back to the full set only when the CMS selects nothing renderable", () => {
    expect(selectHomepageCategories(all, [], renderable)).toHaveLength(4);
    expect(selectHomepageCategories(all, undefined, renderable)).toHaveLength(4);
    // An id that maps to no renderable tile drops out; an all-unrenderable list falls back.
    expect(selectHomepageCategories(all, ["ignoto"], renderable)).toHaveLength(4);
    expect(selectHomepageCategories(all, ["stadi", "ignoto"], renderable).map((c) => c.slug)).toEqual(["stadi"]);
  });
});

describe("managed renderer wiring", () => {
  const renderer = read("src/components/content/managed-homepage.tsx");
  const resolver = read("src/lib/storefront/homepage-resolver.ts");

  it("drives categories, bundle and trust from resolved CMS data, not from position", () => {
    // Categories come from the resolved slugs, not the hardcoded constant.
    expect(renderer).toContain("categorySlugs={resolved.categorySlugs}");
    // Bundle uses the CMS-resolved bundle with its own hero; fallback only when none named.
    expect(renderer).toContain("resolved.bundle");
    expect(renderer).toContain("section.bundleIds.length === 0");
    // Trust variant is keyed on section_key, never on the section's index in the page.
    expect(renderer).toContain("section.section_key");
    expect(renderer).not.toContain("index % 2");
  });

  it("resolves every relation kind server-side and batched, through the public client", () => {
    for (const kind of ['from("products")', 'from("categories")', 'from("bundles")']) {
      expect(resolver).toContain(kind);
    }
    expect(resolver).toContain("createSupabasePublicClient");
    expect(resolver).toContain("getBundleBySlug");
    // A named-but-unpublishable bundle resolves to null, never to a substitute.
    expect(resolver).toContain("if (!bundle) continue");
    expect(resolver).not.toContain("service_role");
    expect(resolver).not.toContain("SUPABASE_SECRET");
  });
});
