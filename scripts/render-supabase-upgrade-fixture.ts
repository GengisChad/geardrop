const RUN_MIGRATION_MARKER = "-- @run-preorder-migration";

export function renderSupabaseUpgradeFixture(fixture: string, migrationBody: string): string {
  const replacement = `
-- Simulate ON COMMIT DROP between replays, keeping the test itself rollback-only.
drop table if exists pg_temp.preorder_catalog_seed;
drop table if exists pg_temp.preorder_untouched_homepage_sections;
select lives_ok($catalog_migration$${migrationBody}$catalog_migration$, 'catalogue migration completes on populated data');
`;

  // A replacement string gives `$` special meaning (`$$` becomes one literal `$`).
  // Returning it from a callback preserves the migration's PL/pgSQL delimiters byte-for-byte.
  return fixture.replaceAll(RUN_MIGRATION_MARKER, () => replacement);
}
