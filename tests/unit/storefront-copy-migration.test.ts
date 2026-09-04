import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260904150000_align_storefront_copy.sql",
);

type PublicationFixture = {
  readonly createdAt: string;
  readonly publishedAt: string | null;
};

function publicationGuardMatches(guard: string, fixture: PublicationFixture): boolean {
  if (guard.includes("section.published_at = section.created_at")) {
    return fixture.publishedAt === fixture.createdAt;
  }
  if (guard.includes("section.published_at is not null")) {
    return fixture.publishedAt !== null;
  }
  throw new Error("Migration publication guard is missing");
}

describe("truthful storefront copy migration", () => {
  it("exists as the guarded forward migration", () => {
    expect(existsSync(migrationPath)).toBe(true);
  });

  it("updates only known defaults, hides seeded Club/bundle, and preserves reviewed legal text", () => {
    if (!existsSync(migrationPath)) {
      expect(existsSync(migrationPath)).toBe(true);
      return;
    }
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();

    expect(sql).toContain("where section_key = 'hero'");
    expect(sql).toContain("prodotti originali, drop esclusivi");
    expect(sql).toContain("## i prodotti sono originali?");
    expect(sql).toContain("section_key in ('champion-bundle', 'club')");
    expect(sql).toContain("testo segnaposto");
    expect(sql).toContain("publication_status = 'draft'");
    expect(sql).not.toMatch(/update public\.content_pages[\s\S]+where slug in \('termini', 'privacy'\)\s*;/);
    expect(sql).not.toContain("accept_orders = true");
  });

  it("hides bundle and Club only when their complete seeded presentation and relations are untouched", () => {
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();
    const hideDefaults = sql.slice(
      sql.indexOf("-- keep the reusable section types"),
      sql.indexOf("-- update only the known stale sentences"),
    );
    const bundleGuard = hideDefaults.slice(
      hideDefaults.indexOf("section.section_key = 'champion-bundle'"),
      hideDefaults.indexOf("\n    or\n"),
    );
    const clubGuard = hideDefaults.slice(hideDefaults.indexOf("section.section_key = 'club'"));

    // Each fixture is an admin edit that must stop the exact-default predicate matching.
    const sharedCustomizedFixtures = [
      { custom: "eyebrow: 'Edizione limitata'", guard: "section.eyebrow is null" },
      { custom: "description: 'Testo redazionale'", guard: "section.description is null" },
      { custom: "desktop media assigned", guard: "section.desktop_media_asset_id is null" },
      { custom: "mobile media assigned", guard: "section.mobile_media_asset_id is null" },
      { custom: "scheduled publication", guard: "section.starts_at is null" },
      { custom: "scheduled expiry", guard: "section.ends_at is null" },
      { custom: "publication status", guard: "section.publication_status = 'published'" },
      { custom: "active state", guard: "section.active = true" },
    ];

    for (const fixture of sharedCustomizedFixtures) {
      expect(bundleGuard, `bundle would hide customized ${fixture.custom}`).toContain(fixture.guard);
      expect(clubGuard, `Club would hide customized ${fixture.custom}`).toContain(fixture.guard);
    }

    const originalSeededPublication = {
      createdAt: "2026-07-18T18:14:01.000Z",
      publishedAt: "2026-07-18T18:14:01.000Z",
    };
    const adminChangedPublication = {
      createdAt: "2026-07-18T18:14:01.000Z",
      publishedAt: "2026-09-04T20:00:00.000Z",
    };
    expect(publicationGuardMatches(bundleGuard, originalSeededPublication)).toBe(true);
    expect(publicationGuardMatches(clubGuard, originalSeededPublication)).toBe(true);
    expect(publicationGuardMatches(bundleGuard, adminChangedPublication)).toBe(false);
    expect(publicationGuardMatches(clubGuard, adminChangedPublication)).toBe(false);
    expect(hideDefaults).not.toContain("section.published_at is not null");

    expect(bundleGuard).toContain("section.title = 'bundle campione'");
    expect(bundleGuard).toContain("section.subtitle is null");
    expect(bundleGuard).toContain("section.cta_label is null");
    expect(bundleGuard).toContain("section.cta_href is null");
    expect(bundleGuard).toContain("section.sort_order = 7");
    expect(bundleGuard).toContain("relation.sort_order = 0");
    expect(bundleGuard).toContain("bundle.slug = 'bundle-campione'");
    expect(bundleGuard).toMatch(/select count\(\*\)[\s\S]*from public\.homepage_section_bundles[\s\S]*\) = 1/);
    expect(bundleGuard).toContain("from public.homepage_section_products");
    expect(bundleGuard).toContain("from public.homepage_section_categories");

    expect(clubGuard).toContain("section.title = 'gear//drop club'");
    expect(clubGuard).toContain("section.subtitle = 'entra nel club. sblocca vantaggi esclusivi.'");
    expect(clubGuard).toContain("section.cta_label = 'scopri di più'");
    expect(clubGuard).toContain("section.cta_href = '/account'");
    expect(clubGuard).toContain("section.sort_order = 9");
    expect(clubGuard).toContain("from public.homepage_section_products");
    expect(clubGuard).toContain("from public.homepage_section_categories");
    expect(clubGuard).toContain("from public.homepage_section_bundles");
  });

  it("replaces the exact old community heading with the reviewed assistance heading", () => {
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();

    expect(sql).toContain("### community prima di tutto");
    expect(sql).toContain("### assistenza prima dell''ordine");
  });
});
