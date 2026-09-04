# GearDrop preorder go-live implementation plan

> Execute sequentially with a fresh implementer and a diff reviewer for every task. Tests must demonstrate RED before production edits and GREEN afterwards.

**Goal:** port the six real preorder products onto current `main`, expose/enforce remaining allocation, remove unsupported storefront claims, add production-only privacy-minimised Vercel Analytics, correct canonicals, and push a verified fast-forward deployment to `main`.

**Tech stack:** Next.js 16.2.10, React 19.2.7, TypeScript 5.9.3, Supabase/Postgres 17, Vitest 4.1.10, Playwright 1.61.1, pnpm 11.13.0, Vercel Analytics 2.0.1.

---

## Task 1: real catalogue, media, and preorder data boundary

**Owned files:**

- `src/data/catalog.ts`
- `src/data/assets.ts`
- `src/lib/commerce/types.ts`
- `src/lib/commerce/supabase-provider.ts`
- `src/lib/commerce/mock-provider.ts`
- `src/app/(storefront)/page.tsx` (catalogue anchor slug only)
- `src/app/(storefront)/negozio/page.tsx`
- `src/app/(storefront)/negozio/[categoria]/page.tsx`
- `src/app/admin/(protected)/homepage/anteprima/page.tsx`
- `src/components/home/category-tiles.tsx`
- `scripts/generate-supabase-seed.ts`
- `.github/workflows/supabase-database-ci.yml`
- `supabase/seed.sql` (generated only)
- `supabase/migrations/20260904143000_publish_preorder_catalog.sql`
- `public/products/{blast-pegasus-a-tr,cobalt-dragoon-2-60c,drop-attack-battle-set,saber-samurai-2-70l,sneak-attack-battle-set,soar-phoenix-9-60gf}.webp`
- `prodotti/{cobaltdragoon.jpg,dropattack.jpg,pegasusblastpack.webp,phoenixred.jpg,sabersamurai.jpg,sneakattack.jpg}`
- focused unit and migration tests under `tests/unit/`

1. Add a failing catalogue contract test asserting the exact six slugs, prices, preorder status, allocations, and zero rating/review counts. Add provider tests asserting authoritative `availableQuantity` projection and cart quote behavior. Add a migration contract test proving all six allocations exist, old seeded SKUs are archived, and the SQL does not blindly reset an existing preorder allocation.
2. Run the focused tests and retain the expected failure output in the task report.
3. Restore only the twelve owner-supplied media files from commit `d427c81`; do not cherry-pick that commit.
4. Replace the static product catalogue with the six owner-supplied records from `d427c81:src/data/catalog.ts`; keep the existing category taxonomy, shipping constants, and per-line limit. Update asset mappings, catalogue anchor slugs, admin preview defaults, and all relations so no dead slug remains. Preserve old public media because archived products or historic order snapshots may still reference it.
5. Add optional `availableQuantity` to the storefront product and cart-quote projections. Select/map Supabase `stock_quantity`, `preorder_allocation`, and `availability_override`; for preorder rows expose the allocation. Mock data exposes its reviewed allocation but remains non-orderable when no backend is configured.
6. Update the seed generator to emit uppercase internal SKUs, `stock_quantity=0`, preorder override, and initial allocation on bootstrap while preserving the existing “do not overwrite operated state” guarantees. Regenerate `supabase/seed.sql` with `pnpm seed:supabase`; never hand-edit it. Add a CI drift check that regenerates the seed and fails on a diff before the local database reset.
7. Add the forward migration under an advisory lock. Upsert the six reviewed products/media/content, archive only the known old mock slugs, and use an idempotent campaign marker/precondition so a rerun cannot replenish consumed allocation. Update Cobalt and Sneak in place to preserve their foreign-key history; fail rather than overwrite an unexpected live balance. Do not enable `accept_orders`; do not delete products, orders, media, or inventory history.
8. Make the existing CRLF-sensitive migration assertion platform-neutral if the baseline failure reproduces; change only the test normalization, not historical SQL.
9. Run focused tests, `pnpm typecheck`, and seed determinism checks. Commit.

## Task 2: quantity UX and truthful public copy

**Owned files:**

- `src/components/product/buy-panel.tsx`
- `src/components/product/quantity-stepper.tsx`
- `src/app/(storefront)/carrello/cart-client.tsx`
- `src/app/(storefront)/prodotto/[slug]/page.tsx`
- `src/app/(storefront)/page.tsx`
- `src/components/content/managed-homepage.tsx`
- `src/components/home/{hero,trust}.tsx`
- `src/components/layout/footer.tsx`
- `src/lib/labels.ts`
- `src/data/pages.ts`
- `src/data/content-seed.ts`
- `scripts/generate-supabase-seed.ts`
- `supabase/seed.sql` (generated only)
- `supabase/migrations/20260904150000_align_storefront_copy.sql`
- affected unit/E2E tests

1. Add failing tests for “N pre-ordini rimasti”, stepper cap, no zero-review rating/structured-data block, no `45.000`, no fake newsletter success, no fake Club/bundle, no “Più venduti”, and preorder dispatch copy. Include generated-seed assertions against stale phrases.
2. Run focused tests and capture RED evidence.
3. Display the current allocation on the product page and cart. Cap controls at `min(MAX_QUANTITY_PER_LINE, availableQuantity)` without silently changing an invalid persisted line; retain the server/database block.
4. Omit rating UI and `AggregateRating` JSON-LD when `reviewCount` is zero. Rename the bestseller presentation to “Pre-ordini aperti” and remove ranking/rating decoration.
5. Remove the newsletter form from the footer, replace the `45.000` sentence with neutral project copy, and remove Club/bundle from fallback and seeded homepage presentation. Leave the underlying reusable admin/component infrastructure intact.
6. Replace rapid-shipping/payment/social-proof claims with: preorder dispatch within 14 days, carrier transit after dispatch, assisted order/no online charge, and neutral Beyblade-X catalogue language. Do not invent supply-chain authenticity evidence or legal identity.
7. Keep placeholder Terms/Privacy out of published seed content. Update the operations checklist to require reviewed seller identity, Terms, and Privacy before order acceptance. Add a guarded forward migration that updates only known seeded CMS defaults, hides Club/bundle, and unpublishes legal rows only when the known placeholder marker is still present. It must not overwrite reviewed admin-authored legal text.
8. Regenerate `supabase/seed.sql`, run focused unit/E2E tests, `pnpm lint`, and `pnpm typecheck`. Commit.

## Task 3: Vercel page analytics and canonical URLs

**Owned files:**

- `package.json`
- `pnpm-lock.yaml`
- `src/lib/analytics.ts`
- `src/components/analytics/storefront-analytics.tsx`
- `src/app/(storefront)/layout.tsx`
- metadata exports/generators for home, shop, category, product, about, assistance and legal routes
- `src/app/layout.tsx`
- `docs/operations/vercel-rollout.md`
- `tests/unit/analytics.test.ts`
- `tests/e2e/metadata.spec.ts`
- affected metadata tests

1. Add failing unit tests for exact sensitive-route boundaries, malformed URL fail-closed behavior, and query/hash stripping. Add a failing metadata matrix asserting self-canonicals for public pages and clean canonicals for query variants.
2. Run the focused tests and capture RED evidence.
3. Install exact `@vercel/analytics@2.0.1`. Implement the pure sanitizer and a client wrapper. Mount it only in the storefront route group and only when `VERCEL_ENV === "production"`; never mount it in root providers, admin, account, or auth.
4. Keep this release pageview-only: do not send order number, email, idempotency key, coupon, product names, or a misleading purchase event.
5. Remove the root-wide `/` canonical and give every indexable public route a clean self-canonical. Keep legal/non-indexable behavior truthful.
6. Document dashboard enablement, redeploy, public `/_vercel/insights/script.js` and pageview-request verification, and negative checks for sensitive routes.
7. Run focused tests, lint, typecheck, and build. Commit.

## Task 4: integration verification and production promotion

1. Generate one final review package from the merge base of `origin/main` and `HEAD`; run a fresh broad reviewer and resolve every Important/Critical finding with re-review.
2. Run from the isolated worktree: `pnpm verify`, public Playwright suites, metadata tests, and the local Supabase database CI sequence when Docker is available (`db:start`, `db:reset`, second seed, `db:test`, `db:lint`, type parity). Record environmental skips exactly; never represent a skipped gate as passed.
3. Search the full source/generated seed for `45.000`, fake newsletter success, fake Club benefits, `Più venduti`, `24/48h`, “spedizione veloce”, and non-zero seeded reviews. Inspect desktop/mobile home, shop, PDP, cart, and checkout.
4. Fetch `origin/main` and verify `git merge-base --is-ancestor origin/main HEAD`. If it fails, integrate current remote main and repeat all affected gates. Push non-force with `git push origin HEAD:main`.
5. Wait for GitHub database CI and Vercel deployment on the exact pushed SHA. Verify `https://geardropshop.it` serves the six-product catalogue, truthful copy, route-specific canonical tags, and the Analytics script on public storefront pages. Verify no Analytics request on admin/account/auth routes.
6. Do not enable order acceptance or apply a remote Supabase migration without a positively identified GearDrop project, reviewed legal data, and the existing owner rollout checklist. Report this operational gate separately from the successful code/Vercel deployment.
