# Task 1 report — real catalogue, media, and preorder data boundary

## Outcome

Implemented and committed the reviewed six-product preorder catalogue on
`codex/preorder-production`.

Commit: `26756732f9b3c2697a609ef537a768cd3de99f62`

The static catalogue now contains exactly the six owner-supplied products with prices
`2550, 3200, 2790, 2950, 4650, 4500` cents and reviewed allocations
`10, 60, 30, 30, 30, 30`. All are `pre-ordine` with zero rating and review count.
Supabase catalogue and cart quote projections expose `availableQuantity` from the same
authoritative rows used for availability checks. The mock provider exposes the reviewed
allocation but remains non-orderable (`orderIntake: "unconfigured"`).

The forward migration uses an advisory transaction lock, a persistent campaign marker,
and a first-application balance precondition. It updates Cobalt and Sneak by slug, archives
only the six replaced mock products, preserves consumed allocation on rerun, leaves
`accept_orders` untouched, and does not delete products, orders, images/media, or inventory
history. Product detail/relation rows are replaced only for the six reviewed products.

## Changed files

- Catalogue/provider boundary: `src/data/catalog.ts`, `src/data/assets.ts`,
  `src/lib/commerce/types.ts`, `src/lib/commerce/supabase-provider.ts`,
  `src/lib/commerce/mock-provider.ts`.
- Catalogue anchors: `src/app/(storefront)/page.tsx`,
  `src/app/(storefront)/negozio/page.tsx`,
  `src/app/(storefront)/negozio/[categoria]/page.tsx`,
  `src/app/admin/(protected)/homepage/anteprima/page.tsx`,
  `src/components/home/category-tiles.tsx`.
- Database generation/migration/CI: `scripts/generate-supabase-seed.ts`,
  `supabase/seed.sql`,
  `supabase/migrations/20260904143000_publish_preorder_catalog.sql`,
  `.github/workflows/supabase-database-ci.yml`.
- Focused tests: `tests/unit/preorder-catalog.test.ts`,
  `tests/unit/preorder-catalog-migration.test.ts`,
  `tests/unit/supabase-provider.test.ts`, `tests/unit/supabase-quote.test.ts`,
  `tests/unit/mock-provider.test.ts`, `tests/unit/supabase-seed.test.ts`,
  `tests/unit/supabase-ci-workflow.test.ts`,
  `tests/unit/promotions-coupons-migration.test.ts`.
- Owner-supplied storefront media: `public/products/blast-pegasus-a-tr.webp`,
  `public/products/cobalt-dragoon-2-60c.webp`,
  `public/products/drop-attack-battle-set.webp`,
  `public/products/saber-samurai-2-70l.webp`,
  `public/products/sneak-attack-battle-set.webp`,
  `public/products/soar-phoenix-9-60gf.webp`.
- Owner source media: `prodotti/cobaltdragoon.jpg`, `prodotti/dropattack.jpg`,
  `prodotti/pegasusblastpack.webp`, `prodotti/phoenixred.jpg`,
  `prodotti/sabersamurai.jpg`, `prodotti/sneakattack.jpg`.

No old public product media was removed. All twelve restored files have the same Git blob
hash as `d427c81`.

## RED evidence

Baseline command:

```text
pnpm test
```

Baseline result: exit `1`; 415/416 tests passed. The sole failure was the known
Windows CRLF-sensitive assertion in `promotions-coupons-migration.test.ts`. The test now
normalizes CRLF to LF; historical SQL was not changed.

Focused RED command:

```text
pnpm exec vitest run tests/unit/preorder-catalog.test.ts tests/unit/supabase-provider.test.ts tests/unit/supabase-quote.test.ts tests/unit/mock-provider.test.ts tests/unit/supabase-seed.test.ts tests/unit/preorder-catalog-migration.test.ts tests/unit/supabase-ci-workflow.test.ts tests/unit/promotions-coupons-migration.test.ts
```

Focused RED result: exit `1`; 16 expected failures. They demonstrated the old eight-item
catalogue and prices, absent `availableQuantity`, absent migration/campaign guard, old
lowercase/no-allocation seed rows, and missing CI seed-drift check.

A second RED cycle for generated relations ran:

```text
pnpm exec vitest run tests/unit/supabase-seed.test.ts
```

Result: exit `1`; the generated homepage relations still contained archived mock slugs.
The generator now falls back to the current catalogue whenever a legacy section contains
unknown product slugs and omits the tag CTE when there are no tags.

## GREEN and verification evidence

Final focused command (after all edits):

```text
pnpm exec vitest run tests/unit/preorder-catalog.test.ts tests/unit/supabase-provider.test.ts tests/unit/supabase-quote.test.ts tests/unit/mock-provider.test.ts tests/unit/supabase-seed.test.ts tests/unit/preorder-catalog-migration.test.ts tests/unit/supabase-ci-workflow.test.ts tests/unit/promotions-coupons-migration.test.ts
```

Result: exit `0`; 8 files and 77 tests passed.

Additional verification:

- `pnpm test` — exit `0`; 62 files and 428 tests passed.
- `pnpm typecheck` — exit `0`; Next route types generated and TypeScript passed.
- `pnpm lint` — exit `0`.
- `pnpm seed:supabase` followed by a second generation — exit `0`; SHA-256 remained
  `F058DBA9EFFC7F4CA7930CEBAD2665994D458E2F2923221B0644654021FDA6AB`.
- `git diff --check` — exit `0` (only Git's Windows LF/CRLF checkout warnings).
- Twelve explicit `git hash-object` comparisons against `d427c81` — 12/12 matched.

## Assumptions

- Uppercase internal SKU means the six reviewed database SKU values are uppercase. The
  migration relaxes the historical lowercase-only check, adds case-insensitive uniqueness,
  and keeps `adjust_inventory` case-insensitive so existing callers remain compatible.
- Direct migration execution has no request actor, matching the repository's existing
  maintenance/seed trigger convention.
- Product relations, bundle items, and homepage product links are catalogue content rather
  than order/inventory history and may be replaced to remove dead product links.

## Remaining risks / follow-up

- The local Supabase stack could not be started or inspected because Docker Desktop's
  daemon is not running (`open //./pipe/docker_engine: file not found`). Migration behavior
  is covered by focused static contracts but still needs the CI/local database reset gate.
- Existing pgTAP files outside Task 1 ownership still hard-code the old seed counts:
  `supabase/tests/002_commerce_schema.test.sql`, `004_rls_roles.test.sql`, and
  `019_full_seed.test.sql` expect eight products/nine images. They must be updated by the
  owning integration task before the full database CI gate can pass with six products/six
  images.

## Fix round 1

### Changes

- `supabase/migrations/20260904143000_publish_preorder_catalog.sql` now preserves an
  existing product `rating` and `review_count` when the persistent preorder campaign marker
  already exists. The first application still uses the inserted zero values to clean up the
  fabricated aggregates.
- `tests/unit/preorder-catalog-migration.test.ts` adds a rerun contract asserting both
  review aggregate fields are guarded by the campaign marker.
- `.github/workflows/supabase-database-ci.yml` now directly triggers on both
  `codex/admin-supabase` and `main`, retaining its pull-request-to-main and manual triggers.
- `tests/unit/supabase-ci-workflow.test.ts` covers the production direct-push trigger.

### TDD evidence

RED command:

```text
pnpm exec vitest run tests/unit/preorder-catalog-migration.test.ts tests/unit/supabase-ci-workflow.test.ts
```

RED result: exit `1`; 2/18 tests failed as expected. The migration had unconditional
`rating = 0` and `review_count = 0`, and the workflow's push branch list omitted `main`.

GREEN command:

```text
pnpm exec vitest run tests/unit/preorder-catalog-migration.test.ts tests/unit/supabase-ci-workflow.test.ts
```

GREEN result: exit `0`; 2 files and 18 tests passed.

### Additional verification

- `pnpm typecheck` — exit `0`; route types generated and TypeScript passed.
- `pnpm lint` — exit `0`.
- `git diff --check` — exit `0`; only Git Windows LF-to-CRLF warnings were emitted.
