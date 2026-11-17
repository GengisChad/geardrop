import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localPsql } from "../tests/e2e/support/local-psql";

/**
 * Proves the organization migrations on a populated database, not only on an empty one.
 *
 * 1. Reset the local stack to the last migration before organizations, without the seed.
 * 2. Load supabase/tests/upgrades/organizations_before.sql.in: every kind of row, the way
 *    they were stored before companies existed.
 * 3. Apply every later migration, exactly as a live database would receive them.
 * 4. Run organizations_after.sql.in (pgTAP): each row is Gear Drop's, nothing lost or moved,
 *    memberships derived from staff, one settings row and checklist per company.
 * 5. Reset again with the seed, so the steps that follow find the database they expect.
 *
 * The organization migrations are numbered after the whole shop history, because that is the
 * order a live database receives them in: the catalogue, prices and orders exist first, and the
 * scoping migrations then backfill them. So the replay starts from the last shop migration, and
 * the retired September pre-order catalogue replay stays retired.
 */
const LAST_MIGRATION_BEFORE_ORGANIZATIONS = "20261009090000";

const root = process.cwd();
const require = createRequire(import.meta.url);
const supabaseCli = require.resolve("supabase/dist/supabase.js");

function supabase(...args: string[]): void {
  // Node resolves the pinned CLI on every OS; no shell quoting or remote target.
  execFileSync(process.execPath, [supabaseCli, ...args], { stdio: "inherit" });
}

const before = readFileSync(join(root, "supabase/tests/upgrades/organizations_before.sql.in"), "utf8");
const after = readFileSync(join(root, "supabase/tests/upgrades/organizations_after.sql.in"), "utf8");
const directory = mkdtempSync(join(tmpdir(), "geardrop-upgrade-"));

try {
  supabase("db", "reset", "--local", "--version", LAST_MIGRATION_BEFORE_ORGANIZATIONS, "--no-seed");
  localPsql(["--set", "ON_ERROR_STOP=1", "--quiet"], { input: before, stdio: ["pipe", "inherit", "inherit"] });
  supabase("migration", "up", "--local");
  const testPath = join(directory, "045_organizations_upgrade.test.sql");
  writeFileSync(testPath, after);
  supabase("test", "db", "--local", testPath);
} finally {
  rmSync(directory, { recursive: true, force: true });
  supabase("db", "reset", "--local");
}
