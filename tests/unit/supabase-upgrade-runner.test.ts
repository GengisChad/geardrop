import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("Supabase populated-upgrade runner", () => {
  it("starts from the last migration before organizations existed", () => {
    const migrations = readdirSync(join(root, "supabase/migrations")).filter((name) => name.endsWith(".sql")).sort();
    const first = migrations.findIndex((name) => name.endsWith("_add_organizations.sql"));
    const previous = migrations[first - 1]?.slice(0, 14);

    expect(first).toBeGreaterThan(0);
    // A migration slipped in before the organizations would be skipped by the replay.
    expect(read("scripts/test-supabase-upgrades.ts")).toContain(`const LAST_MIGRATION_BEFORE_ORGANIZATIONS = "${previous}";`);
  });

  it("loads the populated fixture and proves the upgrade with pgTAP", () => {
    expect(existsSync(join(root, "supabase/tests/upgrades/organizations_before.sql.in"))).toBe(true);
    const after = read("supabase/tests/upgrades/organizations_after.sql.in");
    expect(after).toMatch(/select plan\(\d+\);/);
    expect(after).toContain("select * from finish();");
  });
});
