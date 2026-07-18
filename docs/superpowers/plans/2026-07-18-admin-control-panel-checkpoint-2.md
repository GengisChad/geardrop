# Admin Control Panel Checkpoint 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the real-Supabase `/admin` product, media, and inventory surfaces, verify them against the ephemeral Supabase CI stack, and stop at Checkpoint 2.

**Architecture:** Next.js Server Components read through request-scoped authenticated Supabase clients. Every application mutation begins or completes in an authenticated, authorized, Zod-validated Server Action; PostgreSQL RPCs own multi-row atomicity, generated availability remains authoritative, and Supabase Storage accepts bytes only through short-lived path-specific signed uploads backed by pending media reservations. The public storefront remains on the mock `CommerceProvider`.

**Tech Stack:** Next.js 16.2.10, React 19.2.7, TypeScript 5.9.3, Zod 4.4.3, Supabase Postgres 17, `@supabase/supabase-js` 2.110.7, `@supabase/ssr` 0.12.3, Supabase CLI 2.109.1, Sharp 0.34.5, Vitest 4.1.10, pgTAP, Playwright 1.61.1, pnpm 11.13.0.

## Global Constraints

- Execute only in `C:\Users\feder\Downloads\GearDrop-admin-supabase` on branch `codex/admin-supabase`.
- Treat `docs/superpowers/specs/2026-07-18-admin-control-panel-design.md` at commit `d5ca9265f891bbb2af72d45478ac9034085c9b22` as authoritative.
- Use only the ephemeral Supabase CLI/CI stack for schema runtime tests, Auth users, Storage objects, and temporary data.
- Never link, inspect, or mutate IBNApp or another remote Supabase project.
- Never run remote `db push`, use remote credentials, or change a remote Supabase project.
- Keep PR #2 draft through Checkpoint 2.
- Keep public storefront selection on `COMMERCE_PROVIDER=mock`; do not roll out the Supabase provider remotely.
- Do not implement homepage, coupon, order-management, team, settings, or remote-rollout work.
- Do not create an admin mock repository, fallback sample dashboard, or invented operational value.
- Empty database state renders numeric zeroes and directed empty states.
- Use a fresh request-scoped Supabase client for every Server Component, Server Action, and Route Handler operation.
- Authenticate with `getUser()`/`getClaims()`, authorize through active `staff_profiles`, and never trust `getSession()` or user metadata for server authorization.
- Keep secret/service credentials out of Client Components. A local service key is allowed only inside the disposable browser-test fixture bootstrap.
- Every untrusted path, query, form, enum, number, text, and file declaration is parsed with Zod before mutation.
- Every product, child, media, Storage, and inventory mutation produces `audit_events`; stock also produces `inventory_movements`.
- Use database-generated `stock_status` and `is_purchasable`; delete the in-progress client/domain availability reimplementation.
- Archive is the normal product-removal operation. Hard delete is manager-only and dependency-gated.
- Never overwrite an existing Storage object path. Replace creates a new version and swaps associations transactionally.
- Only `ready` media can be associated, published, or publicly served.
- Follow red-green-refactor for each application behavior and pgTAP/database invariant.
- Do not begin any task in this plan until the user approves the plan.
- Stop after Task 9 and report Checkpoint 2 evidence; do not continue into later product areas.

## Current worktree state to preserve

The following in-progress product slice already exists as untracked work and must be hardened, not discarded:

- `src/app/admin/(protected)/prodotti/**`
- `src/app/admin/actions/products.ts`
- `src/components/admin/products/**`
- `src/lib/admin/product-repository.ts`
- `src/lib/admin/products.ts`
- `supabase/migrations/20260718010000_enforce_product_editor_boundaries.sql`
- `supabase/tests/009_product_editor_boundaries.test.sql`
- `tests/unit/admin-products-contract.test.ts`
- `tests/unit/admin-products.test.ts`

Before each task, run `git status --short`; stage only files listed by that task. Never use `git add -A` in this mixed worktree.

## Migration filename rule

Do not invent Supabase migration timestamps. At execution time create migrations with:

```powershell
pnpm exec supabase migration new finalize_media_lifecycle
pnpm exec supabase migration new add_atomic_admin_operations
```

Use the exact paths printed by the CLI. This intentionally overrides the normal exact-path requirement for migration files.

## File map

- CLI-generated `finalize_media_lifecycle` migration: media status, ready-only policies, signed-path reservation support, lifecycle RPCs.
- CLI-generated `add_atomic_admin_operations` migration: atomic product/image/bulk/delete RPCs and inventory audit.
- `supabase/tests/010_media_lifecycle.test.sql`: lifecycle, RLS, public visibility, compensation primitives.
- `supabase/tests/011_admin_atomic_operations.test.sql`: duplication, bulk, child replacement, image ordering, delete gates, inventory audit.
- `src/lib/admin/action-state.ts`: serializable success/failure result contract shared by admin Client Components.
- `src/lib/admin/products.ts`: product schemas/capabilities only; no availability derivation.
- `src/lib/admin/product-repository.ts`: real server-side list/editor/deletion-impact queries.
- `src/app/admin/actions/products.ts`: validated product actions and RPC calls.
- `src/components/admin/products/**`: product list/editor/deletion consequence UI.
- `src/lib/admin/media.ts`: media input schemas, status/result types, batch limits.
- `src/lib/admin/media-config.server.ts`: server-only configurable upload batch limit.
- `src/lib/admin/media-repository.ts`: ready/pending media reads and signed previews.
- `src/lib/admin/media-service.ts`: begin/finalize/fail/replace/delete orchestration with injected Storage boundary.
- `src/app/admin/actions/media.ts`: authenticated media lifecycle Server Actions.
- `src/app/admin/(protected)/media/page.tsx`: real media library Server Component.
- `src/components/admin/media/**`: multi-file dropzone, per-file results, library, replace/associate UI.
- `src/lib/admin/inventory.ts`: inventory schemas and safe error mapping.
- `src/lib/admin/inventory-repository.ts`: product and movement reads.
- `src/app/admin/actions/inventory.ts`: manager-only `adjust_inventory()` action.
- `src/app/admin/(protected)/inventario/page.tsx`: inventory Server Component.
- `src/components/admin/inventory/**`: adjustment form and movement list.
- `tests/e2e/admin/**`: authenticated browser tests and local-only fixture bootstrap.
- `playwright.admin.config.ts`: serial 390/768/1440 admin projects.
- `.github/workflows/supabase-database-ci.yml`: ephemeral Stack + admin browser gate.

---

### Task 1: Add media lifecycle and ready-only Storage invariants

**Files:**

- Create: migration from `pnpm exec supabase migration new finalize_media_lifecycle`
- Create: `supabase/tests/010_media_lifecycle.test.sql`
- Modify after generation: `src/lib/supabase/database.types.ts`
- Test: `tests/unit/supabase-admin-media-migrations.test.ts`

**Interfaces:**

- Produces enum `public.media_asset_status = ('pending','ready','failed')`.
- Produces `public.finalize_media_upload(p_media_asset_id bigint, p_mime_type text, p_byte_size bigint, p_width integer, p_height integer) returns void`.
- Produces `public.fail_media_upload(p_media_asset_id bigint, p_failure_code text) returns void`.
- Produces `public.begin_media_delete(p_media_asset_id bigint) returns text` and `public.complete_media_delete(p_media_asset_id bigint) returns void` for manager-only, unlinked cleanup.
- Updates `private.is_public_product_image_object(text,text)` and product-image enforcement to require `media_assets.status = 'ready'`.

- [ ] **Step 1: Write failing pgTAP lifecycle tests**

Add `supabase/tests/010_media_lifecycle.test.sql` with fixtures for owner, editor, customer, one pending media row, one ready row, and one published product image. Require these exact behaviors:

```sql
select has_enum('public', 'media_asset_status', 'media lifecycle enum exists');
select col_type_is('public', 'media_assets', 'status', 'media_asset_status', 'media status is typed');
select throws_ok(
  $$insert into public.product_images (product_id, media_asset_id, src, width, height, alt, sort_order, published)
    values (:product_id, :pending_asset_id, 'pending.webp', 10, 10, 'Pending', 90, true)$$,
  '23514', 'GD_MEDIA_NOT_READY',
  'pending media cannot be associated'
);
select is(
  private.is_public_product_image_object('product-images', :pending_path),
  false,
  'pending object is never public'
);
select is(
  private.is_public_product_image_object('product-images', :ready_path),
  true,
  'ready associated published object is public'
);
```

Also prove customers cannot reserve/finalize/fail media, an editor can finalize only their own pending reservation, Storage INSERT is allowed only for the exact pending path owned by the actor, finalized metadata becomes authoritative, failed media stays non-public, and delete begin refuses linked assets.

- [ ] **Step 2: Run RED database test**

Run:

```powershell
pnpm db:start
pnpm db:reset
pnpm exec supabase test db --local supabase/tests/010_media_lifecycle.test.sql
```

Expected: FAIL because `media_asset_status` and lifecycle functions do not exist.

- [ ] **Step 3: Create migration through CLI and implement lifecycle**

Run `pnpm exec supabase migration new finalize_media_lifecycle`, then implement:

```sql
create type public.media_asset_status as enum ('pending', 'ready', 'failed');

alter table public.media_assets
  add column status public.media_asset_status not null default 'pending',
  add column failure_code text,
  add column ready_at timestamptz,
  add constraint media_assets_ready_metadata check (
    status <> 'ready'
    or (failure_code is null and ready_at is not null and byte_size > 0 and width > 0 and height > 0)
  );

create index media_assets_status_created_idx
  on public.media_assets(status, created_at desc);
```

Implement all four declared functions with fixed `search_path = ''`, `auth.uid()` checks, exact staff-role checks, row locks, stable `GD_*` errors, least-privilege `REVOKE`/`GRANT`, and audit insertion inside the same database transaction as each lifecycle transition. Replace the Storage INSERT policy so it accepts only `product-images` paths matching a `pending` reservation whose `uploaded_by = auth.uid()`; the signed upload token remains scoped to that same path. Add a trigger rejecting non-null `product_images.media_asset_id` unless the referenced row is `ready`. Replace the public Storage helper body so its `exists` clause includes `media_asset.status = 'ready'`.

- [ ] **Step 4: Extend source-contract tests**

In `tests/unit/supabase-admin-media-migrations.test.ts`, assert the migration contains the enum, ready checks, lifecycle RPC names, `status = 'ready'`, fixed search paths, execute revokes, and no direct writes to `storage.objects`.

- [ ] **Step 5: Run GREEN database and application tests**

Run:

```powershell
pnpm db:reset
pnpm db:test
pnpm test -- tests/unit/supabase-admin-media-migrations.test.ts
pnpm db:lint
pnpm db:types
pnpm typecheck
```

Expected: all pass; generated `Database` contains `media_asset_status` and the four functions.

- [ ] **Step 6: Commit Task 1 only**

```powershell
$mediaMigration = (Get-ChildItem supabase/migrations -Filter '*_finalize_media_lifecycle.sql' -File).FullName
if (@($mediaMigration).Count -ne 1) { throw 'Expected exactly one finalize_media_lifecycle migration' }
git add -- $mediaMigration supabase/tests/010_media_lifecycle.test.sql tests/unit/supabase-admin-media-migrations.test.ts src/lib/supabase/database.types.ts
git commit -m "feat: add verified media lifecycle"
```

---

### Task 2: Add atomic catalog operations, delete gates, and complete audit

**Files:**

- Create: migration from `pnpm exec supabase migration new add_atomic_admin_operations`
- Create: `supabase/tests/011_admin_atomic_operations.test.sql`
- Modify: `supabase/migrations/20260718010000_enforce_product_editor_boundaries.sql` only if Task 2 tests prove its uncommitted rules conflict with the final RPC boundary
- Modify after generation: `src/lib/supabase/database.types.ts`
- Test: `tests/unit/admin-products-contract.test.ts`

**Interfaces:**

- Produces `duplicate_product_draft(p_source_product_id bigint, p_name text, p_slug text, p_sku text) returns bigint`.
- Produces `bulk_update_products(p_product_ids bigint[], p_operation text, p_category_id bigint default null) returns integer`.
- Produces `replace_product_details(p_product_id bigint, p_specs jsonb, p_features jsonb, p_box_contents jsonb) returns void`.
- Produces `reorder_product_images(p_product_id bigint, p_image_ids bigint[]) returns void`.
- Produces `set_primary_product_image(p_product_id bigint, p_image_id bigint) returns void`.
- Produces `swap_media_asset_associations(p_old_media_asset_id bigint, p_new_media_asset_id bigint) returns jsonb` with `updated_count` and `old_asset_unused`.
- Produces `product_deletion_impact(p_product_id bigint) returns jsonb`.
- Produces `delete_product_permanently(p_product_id bigint, p_expected_name text) returns void`.
- Replaces `adjust_inventory(...)` with the same signature and return type while inserting its administrative `audit_events` record in the same transaction.

- [ ] **Step 1: Write failing atomicity tests**

Create `supabase/tests/011_admin_atomic_operations.test.sql`. Use savepoints and constraint-triggered failures to prove rollback, not merely function existence. Include:

```sql
select throws_ok(
  $$select public.duplicate_product_draft(:source_id, 'Copy', 'duplicate-slug', 'duplicate-sku')$$,
  '23505', null,
  'duplicate collision rolls back product and every copied child'
);
select is(
  (select count(*) from public.products where slug = 'duplicate-slug'),
  0::bigint,
  'failed duplicate leaves no parent'
);
select throws_ok(
  $$select public.delete_product_permanently(:ordered_product_id, 'Ordered product')$$,
  '23503', 'GD_PRODUCT_HAS_ORDERS',
  'ordered product cannot be hard deleted'
);
```

Also assert: editor commerce denial; bulk all-or-nothing behavior; coordinated child replacement rollback; reorder with `unique(product_id, sort_order)`; one primary after switch; swap only to ready media and old association preserved on failure; bundle dependency delete denial; explicit name confirmation; per-family audit rows; inventory movement plus inventory audit.

- [ ] **Step 2: Run RED atomicity test**

Run `pnpm exec supabase test db --local supabase/tests/011_admin_atomic_operations.test.sql`.

Expected: FAIL because the atomic RPCs do not exist and inventory lacks the administrative action audit.

- [ ] **Step 3: Create migration and implement exact RPC surface**

Run `pnpm exec supabase migration new add_atomic_admin_operations`. Every RPC must:

```sql
security definer
set search_path = ''
```

and begin by checking `private.has_staff_role(...)`. Manager-only functions use owner/admin; content functions include editor. Revoke from `PUBLIC`, `anon`, and inappropriate roles before granting `EXECUTE` to `authenticated`.

Use ascending row-ID locks for bulk operations. Product duplication copies specifications, features, box contents, tags, relations, and ready image associations; it never copies stock, inventory movements, orders, and bundle membership, and always creates an inactive zero-stock draft. Use temporary negative sort values before final positive image positions. Validate the exact submitted image ID set matches the product's current image set. `set_primary_product_image` clears the old flag and sets the new flag in one transaction. `product_deletion_impact` returns concrete counts for orders, bundles, relations, images, and children; `delete_product_permanently` repeats all checks under lock instead of trusting the prior summary.

Add one aggregate `audit_events` row for each RPC action; existing row triggers continue recording row-level before/after changes. Update `adjust_inventory` to insert an `inventory.adjusted` audit with actor, SKU, old stock, delta, new stock, reason, and note.

- [ ] **Step 4: Make generated database types exact**

Run `pnpm db:reset && pnpm db:types`. Confirm `Database["public"]["Functions"]` exposes all eight catalog RPCs plus unchanged `adjust_inventory`.

- [ ] **Step 5: Run GREEN tests and database lint**

Run:

```powershell
pnpm db:test
pnpm db:lint
pnpm test -- tests/unit/admin-products-contract.test.ts tests/unit/supabase-runtime-tests.test.ts
pnpm typecheck
```

Expected: PASS with no advisor/lint error and no direct `stock_quantity` grant.

- [ ] **Step 6: Commit Task 2 only**

```powershell
$operationsMigration = (Get-ChildItem supabase/migrations -Filter '*_add_atomic_admin_operations.sql' -File).FullName
if (@($operationsMigration).Count -ne 1) { throw 'Expected exactly one add_atomic_admin_operations migration' }
git add -- $operationsMigration supabase/migrations/20260718010000_enforce_product_editor_boundaries.sql supabase/tests/009_product_editor_boundaries.test.sql supabase/tests/011_admin_atomic_operations.test.sql tests/unit/admin-products-contract.test.ts src/lib/supabase/database.types.ts
git commit -m "feat: make admin catalog operations atomic"
```

---

### Task 3: Define shared action, product, media, and inventory contracts

**Files:**

- Create: `src/lib/admin/action-state.ts`
- Create: `src/lib/admin/media.ts`
- Create: `src/lib/admin/media-config.server.ts`
- Create: `src/lib/admin/inventory.ts`
- Modify: `src/lib/admin/products.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Test: `tests/unit/admin-products.test.ts`
- Create: `tests/unit/admin-media.test.ts`
- Create: `tests/unit/admin-media-config.test.ts`
- Create: `tests/unit/admin-inventory.test.ts`

**Interfaces:**

- Produces `AdminActionResult<T>` discriminated union.
- Produces `beginMediaUploadSchema`, `finalizeMediaUploadSchema`, `replaceMediaSchema`, `associateMediaSchema`, `mediaBatchSchema`, and `MEDIA_BATCH_DEFAULT = 8`, `MEDIA_BATCH_HARD_MAX = 20`, `MEDIA_FILE_MAX_BYTES = 10_485_760`.
- Produces server-only `readMediaUploadConfig(source)` that reads `ADMIN_MEDIA_UPLOAD_BATCH_LIMIT`, defaults to 8, and rejects values outside `1..20`.
- Produces `inventoryAdjustmentSchema` allowing only `manual_adjustment`, `return`, and `damage`.
- Keeps product schemas but removes `effectiveAvailability()` and `duplicateProductDraft()` because generated database fields and RPCs own those behaviors.

- [ ] **Step 1: Write failing contract tests**

Add tests requiring:

```ts
expect(beginMediaUploadSchema.safeParse({
  originalFilename: "blade.svg",
  mimeType: "image/svg+xml",
  byteSize: 200,
  width: 10,
  height: 10,
  altText: "Blade",
}).success).toBe(false);

expect(mediaBatchSchema.safeParse(Array.from({ length: 21 }, validFile)).success).toBe(false);
expect(inventoryAdjustmentSchema.safeParse({ sku: "bx-01", delta: 0, reason: "manual_adjustment", note: "" }).success).toBe(false);
expect(readMediaUploadConfig({ ADMIN_MEDIA_UPLOAD_BATCH_LIMIT: "12" }).batchLimit).toBe(12);
```

Change product tests to assert rendered data consumes `stock_status` and `is_purchasable`; remove assertions that calculate status from stock in TypeScript.

- [ ] **Step 2: Run RED unit tests**

Run `pnpm test -- tests/unit/admin-products.test.ts tests/unit/admin-media.test.ts tests/unit/admin-media-config.test.ts tests/unit/admin-inventory.test.ts`.

Expected: FAIL because media/inventory contracts do not exist and product tests still import client-side derivation.

- [ ] **Step 3: Add pinned Sharp dependency**

Run:

```powershell
pnpm add --save-exact sharp@0.34.5
```

Sharp is a direct server dependency because finalization must decode uploaded bytes; relying on Next's transitive optional dependency is forbidden.

- [ ] **Step 4: Implement contracts**

Use this result shape in `action-state.ts`:

```ts
export type AdminActionResult<T> =
  | { readonly ok: true; readonly message: string; readonly data: T }
  | { readonly ok: false; readonly code: string; readonly message: string; readonly fieldErrors?: Readonly<Record<string, readonly string[]>> };
```

All schemas trim bounded text, coerce only expected numeric form values, reject unknown enum values, bound deltas to `-100_000..100_000`, require explicit `confirmReduction` for deltas at or below `-10`, and reject SVG by MIME and extension.

- [ ] **Step 5: Run GREEN unit suite**

Run:

```powershell
pnpm test -- tests/unit/admin-products.test.ts tests/unit/admin-media.test.ts tests/unit/admin-media-config.test.ts tests/unit/admin-inventory.test.ts
pnpm lint
pnpm typecheck
```

Expected: PASS; `rg "effectiveAvailability|duplicateProductDraft" src tests` returns no production use.

- [ ] **Step 6: Commit Task 3 only**

```powershell
git add -- src/lib/admin/action-state.ts src/lib/admin/products.ts src/lib/admin/media.ts src/lib/admin/media-config.server.ts src/lib/admin/inventory.ts tests/unit/admin-products.test.ts tests/unit/admin-media.test.ts tests/unit/admin-media-config.test.ts tests/unit/admin-inventory.test.ts package.json pnpm-lock.yaml
git commit -m "feat: define admin mutation contracts"
```

---

### Task 4: Harden real product repository and Server Actions

**Files:**

- Modify: `src/lib/admin/product-repository.ts`
- Modify: `src/app/admin/actions/products.ts`
- Modify: `src/app/admin/(protected)/prodotti/export/route.ts`
- Test: `tests/unit/admin-products-contract.test.ts`
- Create: `tests/unit/admin-product-repository.test.ts`

**Interfaces:**

- `listAdminProducts(client, query)` performs database filtering, count, ordering, and `.range()` pagination; it never loads the full catalog for browser-side filtering.
- `loadAdminProductEditor(client,id)` returns generated `stock_status` and `is_purchasable` unchanged.
- `loadProductDeletionImpact(client,id)` calls `product_deletion_impact` and returns typed counts.
- Product actions call declared RPCs for duplication, bulk mutations, coordinated details, ordering, primary changes, and hard delete.

- [ ] **Step 1: Write failing repository/action tests**

Use an injected fluent-client fake to prove list queries issue `.range(from,to)` and request `{ count: "exact" }`. Extend source-contract tests with:

```ts
expect(source).toContain('.rpc("duplicate_product_draft"');
expect(source).toContain('.rpc("bulk_update_products"');
expect(source).toContain('.rpc("delete_product_permanently"');
expect(source).not.toContain('.from("products").delete()');
expect(source).not.toMatch(/stock_quantity\s*:/);
```

Require every exported mutation to parse a dedicated schema before `createSupabaseServerClient()` and call `verifiedStaff` with exact allowed roles.

- [ ] **Step 2: Run RED product boundary tests**

Run `pnpm test -- tests/unit/admin-products-contract.test.ts tests/unit/admin-product-repository.test.ts`.

Expected: FAIL because current untracked actions use independent direct queries and hard delete directly.

- [ ] **Step 3: Implement server-side repository filtering**

Map `AdminProductSort` to real columns and ascending flags, apply `ilike`/`or`, exact publication/category filters, generated `stock_status`, and low-stock predicates. Request primary ready image rows only. Keep page size bounded at 50 and derive `pageCount` from exact database count; an empty table returns `total = 0`, `items = []`, and `pageCount = 1`.

- [ ] **Step 4: Replace unsafe action sequences**

Keep direct single-row CRUD only where one statement and an existing audit trigger are sufficient. Use RPCs for the operations named in Task 2. Parse child forms with discriminated Zod schemas; reject blank specification, feature, box-content, relation, and image values. Never catch Next.js redirect control-flow as a generic failure: return action state before redirect or call `redirect()` outside `try/catch`.

- [ ] **Step 5: Run GREEN product tests**

Run:

```powershell
pnpm test -- tests/unit/admin-products-contract.test.ts tests/unit/admin-product-repository.test.ts tests/unit/admin-products.test.ts
pnpm lint
pnpm typecheck
```

Expected: PASS and no mutation bypasses auth/role/schema checks.

- [ ] **Step 6: Commit Task 4 only**

```powershell
git add -- src/lib/admin/product-repository.ts src/app/admin/actions/products.ts src/app/admin/(protected)/prodotti/export/route.ts tests/unit/admin-products-contract.test.ts tests/unit/admin-product-repository.test.ts
git commit -m "feat: secure product admin mutations"
```

---

### Task 5: Finish product list/editor UI and deletion consequences

**Files:**

- Modify: `src/app/admin/(protected)/prodotti/page.tsx`
- Modify: `src/app/admin/(protected)/prodotti/nuovo/page.tsx`
- Modify: `src/app/admin/(protected)/prodotti/[id]/page.tsx`
- Modify: `src/components/admin/products/product-list-client.tsx`
- Modify: `src/components/admin/products/product-editor-form.tsx`
- Modify: `src/components/admin/products/products.module.css`
- Test: `tests/unit/admin-products-contract.test.ts`

**Interfaces:**

- Product list shows real publication, `stock_quantity`, `availability_override`, generated `stock_status`, and generated `is_purchasable`.
- Editor disables manager-only commerce fields for editors without hidden-field privilege escalation.
- Archive is the normal destructive action.
- Hard delete first renders dependency counts and requires exact product-name plus permanent-action confirmation.

- [ ] **Step 1: Add failing UI contract tests**

Require labels `Stock reale`, `Override`, `Stato effettivo`, and `Acquistabile`; require archive to be the visible default action; require deletion consequence labels for orders, bundles, relations, and media. Assert no `effectiveAvailability` import and no generic `Elimina` button without preflight summary.

- [ ] **Step 2: Run RED UI contract test**

Run `pnpm test -- tests/unit/admin-products-contract.test.ts`.

Expected: FAIL because current editor omits generated purchasability and performs immediate name-only hard delete.

- [ ] **Step 3: Implement UI using existing admin visual language**

Preserve graphite rail, light canvas, violet actions, lime status, visible focus, and mobile dock. Add accessible status text so color is never the only signal. Show editor capability notes beside disabled manager controls. Render zero-result product empty state with `Nuovo prodotto`; do not inject sample rows.

- [ ] **Step 4: Implement archive and hard-delete confirmation flow**

Archive remains in sticky actions. Put permanent deletion in a collapsed manager-only danger section. Load impact from the Server Component, list exact counts, disable delete when any blocking count is nonzero, and require both product name and checkbox `Confermo eliminazione permanente`.

- [ ] **Step 5: Run GREEN UI checks**

Run:

```powershell
pnpm test -- tests/unit/admin-products-contract.test.ts
pnpm lint
pnpm typecheck
pnpm build
```

Expected: PASS; product routes build without mock fallback.

- [ ] **Step 6: Commit Task 5 only**

```powershell
git add -- 'src/app/admin/(protected)/prodotti' src/components/admin/products tests/unit/admin-products-contract.test.ts
git commit -m "feat: complete product admin interface"
```

---

### Task 6: Implement isolated media reservation, finalization, replacement, and cleanup services

**Files:**

- Create: `src/lib/admin/media-repository.ts`
- Create: `src/lib/admin/media-service.ts`
- Create: `src/app/admin/actions/media.ts`
- Create: `tests/unit/admin-media-service.test.ts`
- Create: `tests/unit/admin-media-contract.test.ts`

**Interfaces:**

- `beginMediaUpload(input, deps) -> Promise<AdminActionResult<MediaUploadTicket>>`.
- `finalizeMediaUpload(input, deps) -> Promise<AdminActionResult<ReadyMediaAsset>>`.
- `replaceMediaAsset(input, deps) -> Promise<AdminActionResult<ReadyMediaAsset>>`.
- `deleteMediaAsset(input, deps) -> Promise<AdminActionResult<undefined>>`.
- `processMediaBatch<T>(files, worker, concurrency) -> Promise<readonly AdminActionResult<T>[]>` preserves input order and isolates failures.
- `MediaUploadTicket = { mediaAssetId:number; objectPath:string; token:string }`.
- Storage dependency exposes `createSignedUploadUrl`, `download`, and `remove`; tests use an in-memory fake, not an admin data mock.

- [ ] **Step 1: Write failing orchestration tests**

Test real orchestration behavior with injected fake Storage and repository boundaries:

```ts
it("keeps previous associations when replacement finalization fails", async () => {
  const newPath = "owner/2026-07-18/new.webp";
  storage.downloadError = new Error("corrupt");
  const result = await replaceMediaAsset(validReplacement, deps);
  expect(result.ok).toBe(false);
  expect(db.swappedAssociations).toBe(false);
  expect(storage.removedPaths).toEqual([newPath]);
  expect(db.oldAssetStatus).toBe("ready");
});

it("returns one result per file without rolling back successful siblings", async () => {
  const results = await processMediaBatch([validPng, invalidSvg, validWebp], worker, 3);
  expect(results.map((item) => item.ok)).toEqual([true, false, true]);
});
```

Also prove path generation ignores browser path, finalization decodes with Sharp, MIME/byte-size/dimensions must match, SVG fails, audit RPC follows ready transition, and delete is manager-only/unlinked.

- [ ] **Step 2: Run RED service tests**

Run `pnpm test -- tests/unit/admin-media-service.test.ts tests/unit/admin-media-contract.test.ts`.

Expected: FAIL because media service/actions do not exist.

- [ ] **Step 3: Implement begin lifecycle**

Generate object path as:

```ts
const objectPath = `${principal.userId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;
```

Insert a pending `media_assets` reservation with declared metadata and authenticated uploader, then call authenticated Storage `createSignedUploadUrl(objectPath, { upsert: false })`. If URL creation fails, call `fail_media_upload` and return a safe individual failure.

- [ ] **Step 4: Implement finalization and compensation**

Download the exact pending path with the authenticated session, reject blobs above 10 MiB, decode `Buffer.from(await blob.arrayBuffer())` through Sharp, compare `metadata.format`, `metadata.width`, `metadata.height`, Blob size/type, and reservation declaration. Call `finalize_media_upload` only after all checks. On failure, remove the new object when present, call `fail_media_upload`, and never expose raw Storage/SQL messages.

- [ ] **Step 5: Implement versioned replace and delete**

Replacement runs the same begin/finalize lifecycle for a new path, calls `swap_media_asset_associations` only after ready, and then attempts old-asset cleanup only when the RPC reports no remaining use. Delete calls `begin_media_delete`, removes through Storage API, then calls `complete_media_delete`; removal failure leaves a non-public failed/pending record for retry and writes audit.

- [ ] **Step 6: Run GREEN service tests**

Run:

```powershell
pnpm test -- tests/unit/admin-media.test.ts tests/unit/admin-media-service.test.ts tests/unit/admin-media-contract.test.ts
pnpm lint
pnpm typecheck
```

Expected: PASS; Client Components never receive a secret key or arbitrary writable path.

- [ ] **Step 7: Commit Task 6 only**

```powershell
git add -- src/lib/admin/media.ts src/lib/admin/media-repository.ts src/lib/admin/media-service.ts src/app/admin/actions/media.ts tests/unit/admin-media.test.ts tests/unit/admin-media-service.test.ts tests/unit/admin-media-contract.test.ts
git commit -m "feat: add verified media operations"
```

---

### Task 7: Build real media library and product-image controls

**Files:**

- Create: `src/app/admin/(protected)/media/page.tsx`
- Create: `src/components/admin/media/media-upload-client.tsx`
- Create: `src/components/admin/media/media-library.tsx`
- Create: `src/components/admin/media/media-card.tsx`
- Create: `src/components/admin/media/media.module.css`
- Modify: `src/components/admin/products/product-editor-form.tsx`
- Modify: `src/lib/admin/navigation.ts`
- Test: `tests/unit/admin-media-contract.test.ts`

**Interfaces:**

- `/admin/media` reads only real `media_assets` rows and server-generated signed previews.
- `MediaUploadClient` accepts click selection and drag/drop, maximum batch from server config, one required alt input per file, concurrency 3, and individual states `queued/uploading/finalizing/ready/failed`.
- Browser uploads bytes only with ticket `{ objectPath, token }` returned by begin Server Action; finalization always returns to a Server Action.
- Product editor association/reorder/primary controls call validated actions and database RPCs.

- [ ] **Step 1: Write failing UI contract tests**

Assert the media page imports `listAdminMedia`, upload component uses `uploadToSignedUrl`, and no component calls `.upload()`/`.update()`/`.remove()` with a browser-selected path. Require `multiple`, drag events, per-file alt input, partial result rendering, `pending/ready/failed` copy, and empty state.

- [ ] **Step 2: Run RED media UI test**

Run `pnpm test -- tests/unit/admin-media-contract.test.ts`.

Expected: FAIL because media page/components do not exist.

- [ ] **Step 3: Implement server page and signed previews**

Protect page with `requireAdminAccess`, parse bounded search/page query, read real rows ordered by `created_at desc`, and create five-minute signed preview URLs server-side. Ready and failed filters are explicit; default library lists ready assets. Zero rows render `Nessun media caricato` with upload instruction.

- [ ] **Step 4: Implement isolated multi-upload UI**

For each file: decode dimensions in browser only to create the declaration, require edited alt text, call begin action, upload to the exact signed path/token, then call finalize action. Browser dimensions are untrusted hints; server Sharp verification remains authoritative. Use `Promise.allSettled` through a three-worker queue and preserve successful file results when siblings fail.

- [ ] **Step 5: Implement association, ordering, primary, replace, and delete UI**

Product editor selects only ready media. Reorder submits the complete ordered image ID list. Primary action uses exact product/image IDs. Replace displays old preview until the new lifecycle and swap both succeed. Manager-only delete displays usage count and refuses linked assets.

- [ ] **Step 6: Run GREEN UI verification**

Run:

```powershell
pnpm test -- tests/unit/admin-media-contract.test.ts tests/unit/admin-products-contract.test.ts
pnpm lint
pnpm typecheck
pnpm build
```

Expected: PASS with accessible labels, focus states, status text, and no horizontal overflow in component-level checks.

- [ ] **Step 7: Commit Task 7 only**

```powershell
git add -- 'src/app/admin/(protected)/media' src/components/admin/media src/components/admin/products/product-editor-form.tsx src/lib/admin/navigation.ts tests/unit/admin-media-contract.test.ts
git commit -m "feat: add admin media library"
```

---

### Task 8: Build inventory page and manager-only adjustment action

**Files:**

- Create: `src/lib/admin/inventory-repository.ts`
- Create: `src/app/admin/actions/inventory.ts`
- Create: `src/app/admin/(protected)/inventario/page.tsx`
- Create: `src/components/admin/inventory/inventory-adjustment-form.tsx`
- Create: `src/components/admin/inventory/inventory.module.css`
- Create: `tests/unit/admin-inventory-contract.test.ts`
- Modify: `src/lib/admin/navigation.ts`

**Interfaces:**

- `listAdminInventory(client,query)` returns real product stock plus recent real movements.
- `adjustInventoryAction(previous,formData)` permits owner/admin only and calls exactly `adjust_inventory`.
- UI reads `stock_quantity`, `availability_override`, generated `stock_status`, and generated `is_purchasable` without deriving replacements.

- [ ] **Step 1: Write failing action/UI contract tests**

Require:

```ts
expect(source).toContain('.rpc("adjust_inventory"');
expect(source).toContain('verifiedStaff(client, ["owner", "admin"])');
expect(source).not.toMatch(/\.from\("products"\)\.update/);
expect(pageSource).toContain("is_purchasable");
```

Test Zod rejects zero, out-of-range deltas, non-manual reasons, excessive notes, and material reductions without confirmation.

- [ ] **Step 2: Run RED inventory tests**

Run `pnpm test -- tests/unit/admin-inventory.test.ts tests/unit/admin-inventory-contract.test.ts`.

Expected: FAIL because repository/action/page do not exist.

- [ ] **Step 3: Implement real reads and empty state**

Support bounded search, low-stock-only filter, optional `product` query deep link, deterministic pagination, and latest movements joined to product. Empty tables show product count `0`, no fabricated movement, and an action to create a product.

- [ ] **Step 4: Implement manager adjustment**

Parse the full form first, authenticate, authorize owner/admin, call:

```ts
client.rpc("adjust_inventory", {
  p_sku: input.sku,
  p_delta: input.delta,
  p_reason: input.reason,
  p_note: input.note || undefined,
});
```

Map `GD_INSUFFICIENT_STOCK`, `GD_INVALID_STOCK_DELTA`, `GD_INVALID_MANUAL_STOCK_REASON`, and `GD_PRODUCT_NOT_FOUND` to safe Italian copy. Return authoritative new stock and revalidate dashboard, product, and inventory paths/tags.

- [ ] **Step 5: Run GREEN inventory verification**

Run:

```powershell
pnpm test -- tests/unit/admin-inventory.test.ts tests/unit/admin-inventory-contract.test.ts tests/unit/admin-dashboard.test.ts
pnpm lint
pnpm typecheck
pnpm build
```

Expected: PASS; editor has read-only inventory display and no mutation control.

- [ ] **Step 6: Commit Task 8 only**

```powershell
git add -- src/lib/admin/inventory.ts src/lib/admin/inventory-repository.ts src/app/admin/actions/inventory.ts 'src/app/admin/(protected)/inventario' src/components/admin/inventory src/lib/admin/navigation.ts tests/unit/admin-inventory.test.ts tests/unit/admin-inventory-contract.test.ts
git commit -m "feat: add audited inventory controls"
```

---

### Task 9: Add ephemeral Supabase browser gate and verify Checkpoint 2

**Files:**

- Create: `playwright.admin.config.ts`
- Create: `tests/e2e/admin/global-setup.ts`
- Create: `tests/e2e/admin/admin-auth.spec.ts`
- Create: `tests/e2e/admin/admin-products.spec.ts`
- Create: `tests/e2e/admin/admin-media.spec.ts`
- Create: `tests/e2e/admin/admin-inventory.spec.ts`
- Create: `tests/e2e/admin/admin-responsive.spec.ts`
- Modify: `.github/workflows/supabase-database-ci.yml`
- Modify: `package.json`
- Test: `tests/unit/supabase-ci-workflow.test.ts`

**Interfaces:**

- Admin Playwright config is serial and has exact projects `admin-390`, `admin-768`, `admin-1440`.
- `global-setup.ts` creates temporary local owner/admin/editor/customer identities with the local-only service key, inserts staff profiles, and never prints credentials.
- CI exports local CLI status values to Next.js environment and runs browser tests against the same ephemeral stack used by pgTAP.

- [ ] **Step 1: Write failing CI and browser contracts**

Extend `tests/unit/supabase-ci-workflow.test.ts` to require an admin browser step after database reset/types and forbid `--linked`, `db push`, project refs, access tokens, and remote URLs. Add initial Playwright specs with the exact approved cases and viewport project names.

- [ ] **Step 2: Run RED contract test**

Run `pnpm test -- tests/unit/supabase-ci-workflow.test.ts`.

Expected: FAIL because workflow lacks the admin browser step/config.

- [ ] **Step 3: Reset to a genuinely empty application database and add local-only fixture bootstrap**

After pgTAP, database lint, and generated-type comparison finish against the normal seed, run `supabase db reset --local --no-seed` before admin Playwright. This creates a real empty catalog/media/inventory state from migrations only. Use `createClient<Database>(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } })` only in `tests/e2e/admin/global-setup.ts`. Create one category required by the product form plus deterministic test owner/admin/editor/customer identities with a run suffix, confirmed passwords, and staff rows; do not create products, media, movements, or dashboard facts. Track created IDs for teardown or rely on the job's unconditional `supabase stop --no-backup`; never import this helper from `src/`.

- [ ] **Step 4: Configure exact browser projects**

Set `fullyParallel: false`, `workers: 1`, shared base URL `http://127.0.0.1:3100`, and viewports:

```ts
projects: [
  { name: "admin-390", use: { viewport: { width: 390, height: 844 } } },
  { name: "admin-768", use: { viewport: { width: 768, height: 1024 } } },
  { name: "admin-1440", use: { viewport: { width: 1440, height: 900 } } },
]
```

- [ ] **Step 5: Implement required browser cases**

Cover: staff login; anonymous redirect; generic invalid login; no signup control; editor blocked from prices and inventory; draft creation; publication; atomic duplication; multi-upload partial success using valid PNG/WebP plus SVG failure; ready association and primary change; replacement failure preserving old preview/association; inventory adjustment and movement; logout; empty dashboard/product/media/inventory states; no horizontal overflow and usable navigation at 390, 768, 1440.

- [ ] **Step 6: Update CI without remote Supabase state**

After `supabase start`, seeded pgTAP/type verification, and the browser-only `supabase db reset --local --no-seed`, read `supabase status -o json` with `jq` and append local `API_URL`, `ANON_KEY`, and `SERVICE_ROLE_KEY` to `GITHUB_ENV` under `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY`. Fail if any key is missing and do not echo secret values. Run `pnpm exec playwright test --config playwright.admin.config.ts`. Keep `supabase stop --no-backup` under `if: always()`.

- [ ] **Step 7: Run full local/CI-equivalent verification**

Run:

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:reset
pnpm db:test
pnpm db:lint
pnpm db:types
git diff --exit-code -- src/lib/supabase/database.types.ts
```

Then run admin Playwright against the ephemeral stack with local environment values. Expected: every command passes, no unknown warning/error, and browser artifacts exist only for failures.

- [ ] **Step 8: Commit Task 9 only**

```powershell
git add -- playwright.admin.config.ts tests/e2e/admin .github/workflows/supabase-database-ci.yml package.json tests/unit/supabase-ci-workflow.test.ts
git commit -m "test: gate admin checkpoint 2 in Supabase CI"
```

- [ ] **Step 9: Push without changing PR readiness and wait for CI**

Push `codex/admin-supabase`, verify PR #2 remains draft, and wait for the Supabase Database CI run. If CI fails, inspect logs and make only the smallest task-scoped tested fix. Never connect a remote Supabase project.

- [ ] **Step 10: Stop at Checkpoint 2**

Report commit HEAD, PR draft state, migration/pgTAP evidence, application verification, exact browser cases, and remaining excluded work. Do not begin homepage, coupons, orders, remote provider rollout, or remote database work.

## Plan self-review checklist

- Every mandatory specification invariant maps to at least one task and one automated check.
- Media upload is reservation-first, signed-path, server-finalized, ready-only, isolated per file, and compensating on failure.
- Media replacement is versioned and keeps the previous association until atomic swap success.
- Multi-row product/image operations use PostgreSQL transactions.
- Archive is normal; hard delete repeats dependency checks under lock.
- Generated availability is read, never recreated in client/domain code.
- Audit covers product, child, media, Storage, and inventory mutation families.
- Browser coverage includes all eleven requested behaviors and three exact widths.
- No task links or mutates a remote Supabase project.
- Plan stops at Checkpoint 2 and requires review before execution.
