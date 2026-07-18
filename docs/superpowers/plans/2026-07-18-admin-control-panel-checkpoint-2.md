# Full Admin Control Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete real-Supabase `/admin` control panel for ordinary GEAR//DROP site and commerce operations, verify every module in the ephemeral Supabase CI stack, and continue through the Full Admin Checkpoint without remote rollout.

**Architecture:** Next.js Server Components read through request-scoped authenticated Supabase clients. Every application mutation begins or completes in an authenticated, authorized, Zod-validated Server Action; PostgreSQL RPCs own multi-row commerce atomicity, generated values remain authoritative, and Supabase Storage accepts bytes only through short-lived path-specific signed uploads backed by pending media reservations. Structured CMS repositories and registered frontend renderers replace editable hardcoded content incrementally; the production storefront remains on the mock `CommerceProvider` until a separately approved dedicated-project rollout.

**Tech Stack:** Next.js 16.2.10, React 19.2.7, TypeScript 5.9.3, Zod 4.4.3, Supabase Postgres 17, `@supabase/supabase-js` 2.110.7, `@supabase/ssr` 0.12.3, Supabase CLI 2.109.1, Sharp 0.34.5, Vitest 4.1.10, pgTAP, Playwright 1.61.1, pnpm 11.13.0.

## Global Constraints

- Execute only in `C:\Users\feder\Downloads\GearDrop-admin-supabase` on branch `codex/admin-supabase`.
- Treat `docs/superpowers/specs/2026-07-18-admin-control-panel-design.md` at commit `d5ca9265f891bbb2af72d45478ac9034085c9b22` as authoritative.
- Use only the ephemeral Supabase CLI/CI stack for schema runtime tests, Auth users, Storage objects, and temporary data.
- Never link, inspect, or mutate IBNApp or another remote Supabase project.
- Never run remote `db push`, use remote credentials, or change a remote Supabase project.
- Keep PR #2 draft through the Full Admin Checkpoint and independent review.
- Keep public storefront selection on `COMMERCE_PROVIDER=mock`; do not roll out the Supabase provider remotely.
- Implement homepage, pages, navigation, footer, promotions, coupons, orders, shipping, settings, team, audit, dashboard, dynamic storefront adapters, and content migration in the later phases of this plan.
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
- Task 9 is the Phase A verification gate, not a stopping point. Continue through every later phase without requesting intermediate approval unless a stated hard blocker is reached.
- Stop only for missing indispensable credentials, a destructive remote operation, or a commercial decision that cannot be safely deduced.
- Keep payments on a mock adapter until real Stripe configuration is separately approved; never add secrets.
- Do not expose raw SQL, secret/service keys, arbitrary HTML, JavaScript, code editors, or unsanitized content in the admin.
- All editable content uses typed relational fields or allowlisted Markdown sanitized on render; no raw JSON is the primary editor UI.
- Ordinary admin operations must not require file edits, manual scripts, or Codex after rollout.

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

## Phase A — Products, media, and inventory

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

### Task 9: Add ephemeral Supabase browser gate and verify Phase A

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
git commit -m "test: gate admin phase a in Supabase CI"
```

- [ ] **Step 9: Push without changing PR readiness and wait for CI**

Push `codex/admin-supabase`, verify PR #2 remains draft, and wait for the Supabase Database CI run. If CI fails, inspect logs and make only the smallest task-scoped tested fix. Never connect a remote Supabase project.

- [ ] **Step 10: Record Phase A gate and continue**

Record commit HEAD, PR draft state, migration/pgTAP evidence, application verification, and exact browser cases in the PR body. Keep the public provider mock, then continue with Phase B.

---

## Phase B — Categories and bundles

### Task 10: Extend category and bundle schema with atomic publication

**Files:**

- Create: migration from `pnpm exec supabase migration new extend_categories_and_bundles`
- Create: `supabase/tests/012_categories_bundles.test.sql`
- Modify after generation: `src/lib/supabase/database.types.ts`
- Test: `tests/unit/categories-bundles-migration.test.ts`

**Interfaces:**

- Categories gain ready media association, SEO title/description, and preview-safe publication fields.
- Bundles gain ready media association, `availability_override`, `sort_order`, `starts_at`, and `ends_at`.
- Produces `save_bundle_with_items(p_bundle jsonb, p_items jsonb) returns bigint` and `reorder_categories(p_category_ids bigint[]) returns void`.

- [ ] Write pgTAP tests proving slug uniqueness, ready-only images, date ordering, non-negative prices/quantities, active/public visibility, editor versus manager commerce permissions, atomic item replacement, audit, and collision-free category reorder.
- [ ] Run `pnpm exec supabase test db --local supabase/tests/012_categories_bundles.test.sql`; expect RED because fields/RPCs do not exist.
- [ ] Create migration through CLI; add typed columns, indexes, grants, RLS, audit triggers, fixed-search-path RPCs, and exact `REVOKE`/`GRANT` statements.
- [ ] Run `pnpm db:reset`, `pnpm db:test`, `pnpm db:lint`, `pnpm db:types`, and `pnpm typecheck`; expect GREEN.
- [ ] Commit only migration, pgTAP, generated types, and source-contract test as `feat: add managed categories and bundles`.

### Task 11: Build category and bundle admin routes

**Files:**

- Create: `src/lib/admin/categories.ts`
- Create: `src/lib/admin/category-repository.ts`
- Create: `src/lib/admin/bundles.ts`
- Create: `src/lib/admin/bundle-repository.ts`
- Create: `src/app/admin/actions/categories.ts`
- Create: `src/app/admin/actions/bundles.ts`
- Create: `src/app/admin/(protected)/categorie/page.tsx`
- Create: `src/app/admin/(protected)/categorie/nuova/page.tsx`
- Create: `src/app/admin/(protected)/categorie/[id]/page.tsx`
- Create: `src/app/admin/(protected)/bundle/page.tsx`
- Create: `src/app/admin/(protected)/bundle/nuovo/page.tsx`
- Create: `src/app/admin/(protected)/bundle/[id]/page.tsx`
- Create: `src/components/admin/categories/**`
- Create: `src/components/admin/bundles/**`
- Test: `tests/unit/admin-categories-bundles.test.ts`

**Interfaces:**

- All six routes read real rows and use validated Server Actions.
- Category editor covers name, slug, tagline, description, ready image, active state, order, SEO, associated products, and preview.
- Bundle editor covers title/text, slug, ready image, product quantities, prices, availability, publication, order, dates, and preview.

- [ ] Write failing Zod/repository/action contract tests for required fields, invalid dates/prices, role boundaries, ready media, atomic items, and no Client Component Supabase writes.
- [ ] Run `pnpm test -- tests/unit/admin-categories-bundles.test.ts`; expect RED because modules/routes are absent.
- [ ] Implement repositories, schemas, actions, list/editor forms, drag reorder, previews, loading, empty/error states, and cache invalidation for categories/bundles/products/homepage.
- [ ] Run focused unit tests, `pnpm lint`, `pnpm typecheck`, and `pnpm build`; expect GREEN.
- [ ] Commit module as `feat: add category and bundle administration`, push, update PR body, continue.

---

## Phase C — Structured homepage CMS, pages, navigation, and footer

### Task 12: Add structured CMS schema and public visibility rules

**Files:**

- Create: migration from `pnpm exec supabase migration new add_structured_content_cms`
- Create: `supabase/tests/013_content_cms.test.sql`
- Modify after generation: `src/lib/supabase/database.types.ts`
- Test: `tests/unit/content-cms-migration.test.ts`

**Interfaces:**

- Produces enum `homepage_section_type` allowlisting `hero`, `announcement`, `featured_products`, `latest_drops`, `categories`, `competitive_products`, `bestsellers`, `new_arrivals`, `offers`, `bundle`, `club`, `status_legend`, `trust`, `newsletter`, `promo_banner`, `rich_text`, and `cta`.
- Produces relational `homepage_sections`, `homepage_section_products`, `homepage_section_categories`, `homepage_section_bundles`, `content_pages`, `navigation_menus`, `navigation_items`, `footer_columns`, `footer_items`, and `social_links`.
- Produces transactional `reorder_homepage_sections(bigint[])`, `publish_homepage_section(bigint)`, and `save_navigation_tree(jsonb)`.

- [ ] Write failing pgTAP tests for allowed types, draft/published/date visibility, ready media, relational targets, unique positions, menu cycles, safe page formats, RLS, and audit.
- [ ] Run focused pgTAP; expect RED.
- [ ] Create migration through CLI using common typed columns for title/subtitle/eyebrow/description/desktop-media/mobile-media/CTA/link/dates/status/order; use relational target tables instead of arbitrary payload JSON.
- [ ] Store pages as sanitized-render Markdown source plus typed SEO fields; prohibit script/HTML execution through validation contract.
- [ ] Run DB reset/test/lint/types/typecheck; expect GREEN; commit `feat: add structured content cms`.

### Task 13: Add CMS repositories, schemas, sanitization, and Server Actions

**Files:**

- Create: `src/lib/content/types.ts`
- Create: `src/lib/content/markdown.ts`
- Create: `src/lib/content/repository.ts`
- Create: `src/lib/admin/content.ts`
- Create: `src/app/admin/actions/content.ts`
- Create: `tests/unit/content-markdown.test.ts`
- Create: `tests/unit/content-repository.test.ts`
- Create: `tests/unit/admin-content-actions.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- `renderSafeMarkdown(source:string) -> string` allows headings, paragraphs, lists, emphasis, and safe links; strips raw HTML, scripts, event attributes, unsafe protocols, iframes, and styles.
- `listHomepageSections({ includeDrafts })`, `getContentPage(slug,{ includeDrafts })`, `getNavigation(menuKey)`, and `getFooter()` return typed domain models.
- Server Actions validate discriminated section schemas by `sectionType` and never accept executable code or raw HTML.

- [ ] Write RED tests using `<script>`, `javascript:` links, event handlers, invalid section targets, unsafe URLs, and unauthorized draft reads.
- [ ] Pin and install only required Markdown/sanitization packages with exact versions and committed lockfile.
- [ ] Implement typed mappers, sanitization, repositories, action error mapping, auth/role checks, audit-backed mutations, and cache tags `homepage`, `pages`, `navigation`, `footer`.
- [ ] Run unit/lint/typecheck/build; expect GREEN; commit `feat: add structured content services`.

### Task 14: Build homepage editor, drag ordering, and protected preview

**Files:**

- Create: `src/app/admin/(protected)/homepage/page.tsx`
- Create: `src/app/admin/(protected)/homepage/anteprima/page.tsx`
- Create: `src/components/admin/homepage/homepage-editor.tsx`
- Create: `src/components/admin/homepage/section-editor.tsx`
- Create: `src/components/admin/homepage/section-sortable-list.tsx`
- Create: `src/components/admin/homepage/homepage.module.css`
- Create: `tests/unit/admin-homepage-contract.test.ts`

**Interfaces:**

- Editor creates, edits, enables, schedules, drafts, publishes, reorders, and previews allowlisted section types.
- Preview renders draft state for authorized staff only and shares registered storefront renderers.

- [ ] Write failing UI/action contract tests for all section types, ready desktop/mobile media, CTA/link validation, drag reorder RPC, unsaved indicator, and protected draft preview.
- [ ] Run test; expect RED.
- [ ] Implement Italian editor, searchable resource pickers, 44px targets, keyboard reorder alternative, explicit save/publish, safe autosave only for order, loading/skeleton/empty/error/toast states.
- [ ] Run unit/lint/typecheck/build; expect GREEN; commit `feat: add homepage content editor`.

### Task 15: Build pages, navigation, footer admin and registered storefront renderers

**Files:**

- Create: `src/app/admin/(protected)/pagine/page.tsx`
- Create: `src/app/admin/(protected)/pagine/[slug]/page.tsx`
- Create: `src/app/admin/(protected)/navigazione/page.tsx`
- Create: `src/app/admin/(protected)/footer/page.tsx`
- Create: `src/components/admin/content/**`
- Create: `src/components/content/homepage-section-renderer.tsx`
- Create: `src/components/content/safe-markdown.tsx`
- Create: `tests/unit/admin-pages-navigation.test.ts`
- Create: `tests/unit/homepage-renderer.test.tsx`
- Modify: existing storefront page/header/mobile-menu/footer/content-page components to consume repository results behind provider selection.

**Interfaces:**

- Manages existing informational slugs: `chi-siamo`, assistance pages, FAQ, shipping, returns, privacy, cookies, terms.
- Manages desktop/mobile menus, footer columns/items, social links, order, and visibility.
- Renderer is a closed registry keyed by `homepage_section_type`; unknown types fail safely and never execute stored code.

- [ ] Write RED tests for route/schema coverage, sanitized Markdown, tree order, visibility, renderer registry, and mock-provider preservation.
- [ ] Implement admin lists/editors/preview and registered storefront renderers; use repository/provider boundaries, not scattered Supabase calls.
- [ ] Verify public mock mode remains byte-for-byte behaviorally compatible in existing tests; run unit/lint/typecheck/build.
- [ ] Commit `feat: add managed pages navigation and footer`, push, update PR body.

---

## Phase D — Promotions and coupons

### Task 16: Add promotion, coupon, and authoritative pricing schema

**Files:**

- Create: migration from `pnpm exec supabase migration new add_promotions_and_coupon_rules`
- Create: `supabase/tests/014_promotions_coupons.test.sql`
- Modify after generation: `src/lib/supabase/database.types.ts`
- Test: `tests/unit/promotions-coupons-migration.test.ts`

**Interfaces:**

- Produces `promotions`, product/category/bundle target tables, priority/stacking/date/quantity/minimum rules, and typed discount kinds.
- Extends coupons with free shipping, targets, maximum discount, per-customer limit, first-purchase flag, and immediate disable.
- Produces authoritative `calculate_cart_pricing(p_lines jsonb, p_coupon_code text, p_customer_id uuid, p_shipping_code text) returns jsonb`.

- [ ] Write pgTAP RED coverage for case-insensitive coupon uniqueness, limits, windows, priority, stacking, targets, first purchase, free shipping, max discount, disabled rules, integer-cent totals, and audit/RLS.
- [ ] Implement schema/RPC with server-derived products/prices/targets/shipping and stable errors; client-supplied totals are ignored.
- [ ] Run reset/test/lint/types/typecheck; expect GREEN; commit `feat: add promotions and coupon pricing`.

### Task 17: Build promotion and coupon admin routes

**Files:**

- Create: `src/lib/admin/promotions.ts`
- Create: `src/lib/admin/promotion-repository.ts`
- Create: `src/lib/admin/coupons.ts`
- Create: `src/lib/admin/coupon-repository.ts`
- Create: `src/app/admin/actions/promotions.ts`
- Create: `src/app/admin/actions/coupons.ts`
- Create: `src/app/admin/(protected)/promozioni/page.tsx`
- Create: `src/app/admin/(protected)/promozioni/nuova/page.tsx`
- Create: `src/app/admin/(protected)/promozioni/[id]/page.tsx`
- Create: `src/app/admin/(protected)/coupon/page.tsx`
- Create: `src/app/admin/(protected)/coupon/nuovo/page.tsx`
- Create: `src/app/admin/(protected)/coupon/[id]/page.tsx`
- Create: `src/components/admin/promotions/**`
- Create: `src/components/admin/coupons/**`
- Test: `tests/unit/admin-promotions-coupons.test.ts`

**Interfaces:**

- All routes use real rows, validated Server Actions, target pickers, affected-product preview, duplication, usage counts, and immediate disable.

- [ ] Write RED schema/action/UI tests for every requested rule and role boundary.
- [ ] Implement repositories, forms, previews using authoritative pricing RPC, filters, dates, limits, toasts, and cache revalidation.
- [ ] Run unit/lint/typecheck/build; commit `feat: add promotion and coupon administration`, push, update PR.

---

## Phase E — Orders and payment boundary

### Task 18: Add atomic order creation and lifecycle RPCs

**Files:**

- Create: migration from `pnpm exec supabase migration new add_order_lifecycle_operations`
- Create: `supabase/tests/015_orders_lifecycle.test.sql`
- Modify after generation: `src/lib/supabase/database.types.ts`
- Test: `tests/unit/orders-migration.test.ts`

**Interfaces:**

- Produces `order_notes`, `order_status_events`, tracking fields, refund-preparation fields, and immutable snapshots.
- Produces `create_order(...)`, `transition_order_status(...)`, `cancel_order_and_restore_stock(...)`, `set_order_tracking(...)`, `add_order_note(...)`, and `prepare_order_refund(...)`.

- [ ] Write RED pgTAP tests for product reread, pricing/coupon/shipping recalculation, stock locks, idempotency, snapshots, invalid transitions, cancellation stock restoration, notes/tracking/refund permissions, audit, and rollback.
- [ ] Implement fixed-search-path least-privilege RPCs; order creation and cancellation are fully transactional and never alter historical lines after product edits.
- [ ] Run reset/test/lint/types/typecheck; commit `feat: add transactional order lifecycle`.

### Task 19: Build order admin, exports, and disabled Stripe adapter

**Files:**

- Create: `src/lib/payments/types.ts`
- Create: `src/lib/payments/mock-adapter.ts`
- Create: `src/lib/payments/stripe-adapter.ts`
- Create: `src/lib/payments/provider.ts`
- Create: `src/lib/admin/orders.ts`
- Create: `src/lib/admin/order-repository.ts`
- Create: `src/app/admin/actions/orders.ts`
- Create: `src/app/admin/(protected)/ordini/page.tsx`
- Create: `src/app/admin/(protected)/ordini/[id]/page.tsx`
- Create: `src/app/admin/(protected)/ordini/export/route.ts`
- Create: `src/components/admin/orders/**`
- Test: `tests/unit/admin-orders.test.ts`
- Test: `tests/unit/payment-adapter.test.ts`

**Interfaces:**

- List supports number/email/date/status/payment/shipping/coupon filters, pagination, and CSV.
- Detail shows immutable customer/address/line/price/discount/shipping/total snapshots, notes, tracking, and action history.
- `StripePaymentAdapter` compiles but returns `PAYMENTS_NOT_CONFIGURED` without environment secrets; mock remains selected.

- [ ] Write RED tests for filters, PII roles, transition actions, safe CSV, immutable snapshots, refund preparation, and adapter selection.
- [ ] Implement Italian list/detail/actions/exports; no raw SQL/errors/JSON UI; no Stripe secret or network call.
- [ ] Run unit/lint/typecheck/build; commit `feat: add order operations console`, push, update PR.

---

## Phase F — Shipping and store settings

### Task 20: Add typed shipping and store configuration schema

**Files:**

- Create: migration from `pnpm exec supabase migration new add_store_configuration`
- Create: `supabase/tests/016_store_settings.test.sql`
- Modify after generation: `src/lib/supabase/database.types.ts`
- Test: `tests/unit/store-settings-migration.test.ts`

**Interfaces:**

- Extends shipping methods with enabled areas and typed estimates.
- Adds typed store identity/contact/legal/maintenance/upload/default-SEO/social settings; no primary JSON editor.
- Produces owner-only `set_order_acceptance(p_enabled boolean, p_confirmation text) returns void` that rechecks launch checklist.

- [ ] Write RED pgTAP tests for costs/thresholds/areas/order, singleton settings, limits, URL/email validation, manager/owner boundaries, checklist, audit, and public-safe reads.
- [ ] Implement migration/RLS/RPC, run full DB verification/types, commit `feat: add typed store configuration`.

### Task 21: Build shipping and settings admin routes

**Files:**

- Create: `src/lib/admin/settings.ts`
- Create: `src/lib/admin/settings-repository.ts`
- Create: `src/app/admin/actions/settings.ts`
- Create: `src/app/admin/(protected)/spedizioni/page.tsx`
- Create: `src/app/admin/(protected)/impostazioni/page.tsx`
- Create: `src/app/admin/(protected)/impostazioni/negozio/page.tsx`
- Create: `src/app/admin/(protected)/impostazioni/seo/page.tsx`
- Create: `src/app/admin/(protected)/impostazioni/contatti/page.tsx`
- Create: `src/app/admin/(protected)/impostazioni/social/page.tsx`
- Create: `src/components/admin/settings/**`
- Test: `tests/unit/admin-settings.test.ts`

**Interfaces:**

- Manages all requested shipping/store/SEO/contact/social fields with typed forms.
- Order activation is owner-only, shows live checklist, and requires exact confirmation.

- [ ] Write RED schemas/action/UI tests; implement routes and safe preview; revalidate settings/shipping/storefront tags.
- [ ] Run unit/lint/typecheck/build; commit `feat: add shipping and store settings`, push, update PR.

---

## Phase G — Team, roles, and audit

### Task 22: Harden staff lifecycle and audit request context

**Files:**

- Create: migration from `pnpm exec supabase migration new add_staff_lifecycle_and_audit_context`
- Create: `supabase/tests/017_staff_audit.test.sql`
- Modify after generation: `src/lib/supabase/database.types.ts`
- Test: `tests/unit/staff-audit-migration.test.ts`

**Interfaces:**

- Adds invite/status/last-login fields and sanitized request context to audit events.
- Produces owner-only `change_staff_role`, `set_staff_active`, and `revoke_staff_access` with last-owner and self-promotion guards.

- [ ] Write RED pgTAP for admin-versus-owner, editor denial, last owner, self-promotion, revoke/reactivate, no public staff signup, audit before/after/context, and PII-safe reads.
- [ ] Implement migration and RPCs; run DB verification/types; commit `feat: secure staff lifecycle and audit`.

### Task 23: Build team and activity routes

**Files:**

- Create: `src/lib/admin/team.ts`
- Create: `src/lib/admin/team-repository.ts`
- Create: `src/lib/admin/audit-repository.ts`
- Create: `src/app/admin/actions/team.ts`
- Create: `src/app/admin/(protected)/team/page.tsx`
- Create: `src/app/admin/(protected)/team/[id]/page.tsx`
- Create: `src/app/admin/(protected)/attivita/page.tsx`
- Create: `src/components/admin/team/**`
- Create: `src/components/admin/audit/**`
- Test: `tests/unit/admin-team-audit.test.ts`

**Interfaces:**

- Owner invites through a narrowly scoped server-only Auth Admin call only after request-session owner authorization; service key never reaches browser.
- Activity shows operator/date/action/entity/before/after/request context with filters and safe formatting, not raw JSON as primary UI.

- [ ] Write RED action/repository/UI tests for every role guard and generic invite errors.
- [ ] Implement team list/detail/invite/role/status/revoke and audit list/detail; show IDs only where operationally useful.
- [ ] Run unit/lint/typecheck/build; commit `feat: add team and audit administration`, push, update PR.

---

## Phase H — Complete real-data dashboard

### Task 24: Add dashboard aggregates and operational UI

**Files:**

- Create: migration from `pnpm exec supabase migration new add_admin_dashboard_metrics`
- Create: `supabase/tests/018_dashboard_metrics.test.sql`
- Modify: `src/lib/admin/dashboard.ts`
- Modify: `src/app/admin/(protected)/page.tsx`
- Modify: `src/components/admin/admin.module.css`
- Modify after generation: `src/lib/supabase/database.types.ts`
- Test: `tests/unit/admin-dashboard.test.ts`

**Interfaces:**

- Produces RLS-safe manager aggregate function for order count, revenue cents, average order value cents, product states, active coupons/promotions, latest orders, stock movements, and staff activity.
- Editors never receive order/revenue/customer metrics; owner/admin do.

- [ ] Write RED pgTAP/unit tests for exact aggregates, role redaction, zero-order values, empty lists, and no invented percentages/comparisons.
- [ ] Implement aggregate repository and dashboard cards/lists using integer cents and real rows only.
- [ ] Run DB/unit/lint/typecheck/build; commit `feat: complete real data admin dashboard`, push, update PR.

---

## Phase I — Dynamic storefront and protected preview

### Task 25: Complete Supabase storefront repositories, provider, cache, and preview

**Files:**

- Modify: `src/lib/commerce/supabase-provider.ts`
- Modify: `src/lib/commerce/provider.ts`
- Create: `src/lib/storefront/content-repository.ts`
- Create: `src/lib/storefront/settings-repository.ts`
- Create: `src/lib/storefront/cache.ts`
- Create: `src/app/api/preview/route.ts`
- Modify: storefront pages/layout and registered content renderers.
- Test: `tests/unit/supabase-provider.test.ts`
- Create: `tests/unit/storefront-content.test.ts`
- Create: `tests/unit/storefront-cache.test.ts`

**Interfaces:**

- Request-scoped provider reads products/categories/ready images/bundles/generated availability/promotions and authoritative totals.
- Content repositories read homepage/sections/navigation/footer/pages/settings.
- `COMMERCE_PROVIDER=mock` remains default and production-safe; Supabase mode is opt-in only.
- Draft preview requires authenticated staff cookie/token and never alters public publication state.

- [ ] Write RED mapping/cache/preview tests, including no module-global client and safe fallback errors.
- [ ] Implement repository/provider boundaries, tags and `revalidateTag`/`revalidatePath`; remove hardcoded reads only where database models and seed exist.
- [ ] Verify existing public tests in mock mode plus Supabase-mode integration against CI stack.
- [ ] Commit `feat: complete dynamic storefront adapters`, push, update PR.

---

## Phase J — Idempotent migration of existing content

### Task 26: Seed existing storefront content without inventing commerce data

**Files:**

- Modify: `scripts/generate-supabase-seed.ts`
- Modify: `supabase/seed.sql`
- Create: `src/data/content-seed.ts`
- Modify: existing reviewed data modules only to export structured seed sources.
- Create: `tests/unit/full-content-seed.test.ts`
- Create: `supabase/tests/019_full_seed.test.sql`
- Modify: `docs/reference-audit.md`

**Interfaces:**

- Idempotently seeds current products/categories/images/bundle/homepage sections/navigation/footer/informational pages/settings.
- Reruns update reviewed content but never overwrite real stock, orders, redemption counts, audit, staff, or runtime settings.
- Initial stock remains `0`; `accept_orders` remains `false`; no revenue, coupon usage, promotions, or customers are invented.

- [ ] Write RED unit/pgTAP tests for natural-key idempotency, double seed, exact content counts, zero stock, disabled orders, no invented commerce facts, and current-site copy/assets.
- [ ] Implement structured seed generator and generated SQL; run seed twice and full DB suite.
- [ ] Run mock-versus-seeded Supabase visual/content parity tests for current public routes.
- [ ] Commit `feat: seed complete storefront content`, push, update PR.

---

## Phase K — Full verification, CI, independent review, and handoff

### Task 27: Expand unit, pgTAP, browser, and CI coverage to every module

**Files:**

- Create/modify: focused `tests/unit/**` suites for schemas, roles, repositories, mappers, Server Actions, promotions, coupons, totals, settings, content, cache, media, inventory, and orders.
- Create/modify: `supabase/tests/020_full_admin_security.test.sql` plus earlier module suites.
- Create/modify: `tests/e2e/admin/**` for every route/module.
- Modify: `playwright.admin.config.ts`
- Modify: `.github/workflows/supabase-database-ci.yml`
- Modify: `package.json`
- Test: `tests/unit/supabase-ci-workflow.test.ts`

**Interfaces:**

- CI order: Supabase start, migrations, seed twice, pgTAP, DB lint, generated-type diff, unit, admin browser, public browser, lint, typecheck, build, unconditional stop.
- Browser projects remain exact 390, 768, and 1440 widths with serial DB mutations.

- [ ] Add RED coverage for login/logout/roles; every CRUD module; homepage drag/drop/preview; promo/coupon pricing; order lifecycle; settings; team; audit; empty states; responsive; keyboard focus; 44px touch targets; no horizontal overflow.
- [ ] Update workflow with no remote secrets, project refs, linked commands, or IBNApp dependencies.
- [ ] Run full local/CI-equivalent verification and push small fixes until GitHub Actions is green.
- [ ] Commit final test gate as `test: verify full admin checkpoint`, keep PR draft.

### Task 28: Perform independent review and prepare Full Admin Checkpoint handoff

**Files:**

- Create: `docs/operations/full-admin-setup.md`
- Create: `docs/operations/vercel-rollout.md`
- Create: `docs/operations/full-admin-rollout-checklist.md`
- Modify: PR #2 body only after repository verification.

**Interfaces:**

- Handoff lists commits, admin routes, tables, migrations, RPCs, policies, tests, CI, functional operations, Stripe-dependent operations, dedicated GearDrop Supabase setup, Vercel setup, and rollout checklist.

- [ ] Invoke independent code review after all tests pass; address every blocking/high finding with RED regression tests and logical commits.
- [ ] Re-run migrations from empty DB, double seed, pgTAP, DB lint, generated-type diff, unit, E2E, lint, typecheck, and build from current HEAD.
- [ ] Verify admin contains no mocks/fake metrics/raw SQL/secret keys/arbitrary HTML or broken controls; verify public mock default prevents accidental rollout.
- [ ] Write setup and rollout docs without real secrets or remote mutations.
- [ ] Update PR #2 body with completed modules, routes, migrations, tests, limitations, Stripe status, and required setup; keep draft and do not merge.
- [ ] Report Full Admin Checkpoint evidence and stop before remote project creation, Vercel rollout, provider switch, Stripe activation, or merge.

## Full plan self-review checklist

- Phase A preserves all previously approved product/media/inventory invariants.
- Phase B covers categories and bundles with ready media, SEO, order, publication, dates, preview, and atomic items.
- Phase C covers structured homepage sections, pages, navigation, footer, safe Markdown, drag ordering, draft, publication, and protected preview without code/HTML editors.
- Phase D covers automatic promotions and coupons with authoritative server pricing.
- Phase E covers immutable orders, transactional creation/transitions/cancellation/stock restoration, notes, tracking, export, and disabled Stripe boundary.
- Phase F covers shipping and typed store/SEO/contact/social settings with owner checklist for order activation.
- Phase G covers team lifecycle, last-owner/self-promotion guards, and searchable audit.
- Phase H displays real aggregates and zero/empty states without invented comparisons.
- Phase I completes provider/repository/cache/preview boundaries while mock remains default.
- Phase J migrates current reviewed content idempotently with zero stock and disabled orders.
- Phase K verifies every module at 390/768/1440, performs independent review, documents dedicated-project/Vercel rollout, keeps PR draft, and never merges or mutates remote Supabase.

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
- Task 9 records Phase A but does not stop execution.
- Plan continues through Task 28 and stops only at the Full Admin Checkpoint before remote rollout or merge.
