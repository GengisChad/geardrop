import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderSupabaseUpgradeFixture } from "../../scripts/render-supabase-upgrade-fixture";

describe("Supabase populated-upgrade runner", () => {
  it("preserves the exact migration body and dollar quotes in every replay", () => {
    const root = process.cwd();
    const migration = readFileSync(
      join(root, "supabase/migrations/20260904143000_publish_preorder_catalog.sql"),
      "utf8",
    ).replaceAll("\r\n", "\n");
    const body = migration.replace(/^begin;\s*/, "").replace(/commit;\s*$/, "");
    const fixture = readFileSync(
      join(root, "supabase/tests/upgrades/preorder_catalog.sql.in"),
      "utf8",
    );

    const rendered = renderSupabaseUpgradeFixture(fixture, body);
    const replayBodies = Array.from(
      rendered.matchAll(/\$catalog_migration\$([\s\S]*?)\$catalog_migration\$/g),
      (match) => match[1],
    );

    expect(replayBodies).toEqual([body, body, body]);
    expect(rendered).not.toContain("-- @run-preorder-migration");
    expect(body).toContain("do $$");
  });
});
