import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Supabase recognises a migration by its version, not its name. Two files with the same version
// is not a merge conflict git would show: whichever reaches production first is recorded, and the
// other is then skipped as "already applied", silently. On 6 October 2026 three migrations of the
// organization layer shared their versions with Vinted work on another branch; had that work been
// deployed first, the rewrite of row level security for companies would never have run.
const MIGRATION = /^(\d{14})_[a-z0-9_]+\.sql$/;

function versionsOf(names: readonly string[]): string[] {
  return names.map((name) => MIGRATION.exec(name)?.[1] ?? `invalid:${name}`);
}

function duplicates(versions: readonly string[]): string[] {
  const seen = new Set<string>();
  return [...new Set(versions.filter((version) => (seen.has(version) ? true : (seen.add(version), false))))];
}

function notATime(version: string): boolean {
  const [hour, minute, second] = [version.slice(8, 10), version.slice(10, 12), version.slice(12, 14)].map(Number);
  return hour! > 23 || minute! > 59 || second! > 59;
}

const names = readdirSync(join(process.cwd(), "supabase/migrations")).filter((name) => name.endsWith(".sql"));

describe("migration versions", () => {
  it("catches two migrations that share a version", () => {
    expect(duplicates(versionsOf(["20261006120000_a.sql", "20261006120000_b.sql", "20261006120100_c.sql"]))).toEqual(["20261006120000"]);
    expect(notATime("20261006240000")).toBe(true);
  });

  it("names every migration with a timestamp version and a snake_case name", () => {
    expect(names.filter((name) => !MIGRATION.test(name))).toEqual([]);
  });

  it("never gives two migrations the same version", () => {
    expect(duplicates(versionsOf(names))).toEqual([]);
  });

  it("uses versions that are real times of day", () => {
    expect(versionsOf(names).filter(notATime)).toEqual([]);
  });
});
