import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderSupabaseUpgradeFixture } from "./render-supabase-upgrade-fixture";

// Keep one source of truth: the pgTAP fixture executes the current migration body,
// never a copied implementation. The surrounding transaction rolls back all fixtures.
const root = process.cwd();
const migration = readFileSync(join(root, "supabase/migrations/20260904143000_publish_preorder_catalog.sql"), "utf8")
  .replaceAll("\r\n", "\n");
if (!migration.startsWith("begin;\n") || !migration.trimEnd().endsWith("commit;")) {
  throw new Error("Expected one explicit transaction around the catalogue migration");
}
const body = migration.replace(/^begin;\s*/, "").replace(/commit;\s*$/, "");
const fixture = readFileSync(join(root, "supabase/tests/upgrades/preorder_catalog.sql.in"), "utf8");
const sql = renderSupabaseUpgradeFixture(fixture, body);
const directory = mkdtempSync(join(tmpdir(), "geardrop-upgrade-"));
try {
  const testPath = join(directory, "025_preorder_catalog_upgrade.test.sql");
  writeFileSync(testPath, sql);
  const require = createRequire(import.meta.url);
  // Node resolves the pinned CLI on every OS; no shell quoting or remote target.
  execFileSync(process.execPath, [require.resolve("supabase/dist/supabase.js"), "test", "db", "--local", testPath], { stdio: "inherit" });
} finally {
  rmSync(directory, { recursive: true, force: true });
}
