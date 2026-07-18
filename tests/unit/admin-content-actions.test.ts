import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  contentPageSchema,
  homepageSectionSchema,
  navigationTreeSchema,
} from "@/lib/admin/content";

const root = process.cwd();
const baseSection = {
  sectionKey: "hero-home",
  eyebrow: null,
  title: "Nuovo drop",
  subtitle: null,
  description: null,
  desktopMediaAssetId: null,
  mobileMediaAssetId: null,
  ctaLabel: "Scopri",
  ctaHref: "/negozio",
  publicationStatus: "draft" as const,
  startsAt: null,
  endsAt: null,
  active: false,
  sortOrder: 0,
};

describe("admin structured content actions", () => {
  it("uses a closed discriminated section schema", () => {
    expect(homepageSectionSchema.safeParse({ ...baseSection, sectionType: "hero", targetIds: [] }).success).toBe(true);
    expect(homepageSectionSchema.safeParse({ ...baseSection, sectionType: "esegui_codice", targetIds: [] }).success).toBe(false);
    expect(homepageSectionSchema.safeParse({ ...baseSection, sectionType: "categories", targetIds: [] }).success).toBe(false);
    expect(homepageSectionSchema.safeParse({ ...baseSection, sectionType: "bundle", targetIds: [1, 2] }).success).toBe(false);
    expect(homepageSectionSchema.safeParse({ ...baseSection, sectionType: "featured_products", targetIds: [1, 1] }).success).toBe(false);
  });

  it("rejects unsafe URLs, HTML pages, and invalid windows", () => {
    expect(homepageSectionSchema.safeParse({ ...baseSection, sectionType: "cta", targetIds: [], ctaHref: "javascript:alert(1)" }).success).toBe(false);
    expect(contentPageSchema.safeParse({
      slug: "privacy", title: "Privacy", excerpt: null, markdownSource: "<script>alert(1)</script>",
      seoTitle: null, seoDescription: null, publicationStatus: "draft", startsAt: null, endsAt: null,
      active: false, sortOrder: 0,
    }).success).toBe(false);
    expect(homepageSectionSchema.safeParse({
      ...baseSection, sectionType: "hero", targetIds: [],
      startsAt: "2026-08-02T10:00:00.000Z", endsAt: "2026-08-01T10:00:00.000Z",
    }).success).toBe(false);
    expect(navigationTreeSchema.safeParse({
      menu: { key: "main", label: "Main", publicationStatus: "draft", active: false },
      items: [{ label: "Bad", href: "//evil.example", active: true, children: [] }],
    }).success).toBe(false);
  });

  it("authenticates, authorizes, validates, revalidates, and uses CMS RPCs", () => {
    const source = readFileSync(join(root, "src/app/admin/actions/content.ts"), "utf8");
    expect(source).toContain('"use server"');
    expect(source).toContain("requireUser");
    expect(source).toContain("requireStaffRole");
    expect(source).toContain("safeParse");
    expect(source).toContain('.rpc("reorder_homepage_sections"');
    expect(source).toContain('.rpc("publish_homepage_section"');
    expect(source).toContain('.rpc("save_homepage_section"');
    expect(source).toContain('.rpc("save_navigation_tree"');
    for (const tag of ["homepage", "pages", "navigation", "footer"]) expect(source).toContain(`revalidateTag("${tag}"`);
    expect(source).not.toContain("service_role");
    expect(source).not.toContain("getSession(");
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });
});
