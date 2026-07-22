# Admin Control Panel Design

**Date:** 2026-07-18
**Status:** approved design
**Project:** GEAR//DROP

## 1. Goal

Deliver a protected `/admin` control panel backed only by the real Supabase commerce schema. Staff must be able to inspect real operational data, manage products and product media, and adjust inventory without introducing an admin mock layer or switching the public storefront away from its mock commerce provider.

Work stops at Checkpoint 2 after products, media, inventory, and their verification are complete.

## 2. Non-negotiable boundaries

- Use the Supabase CI/local stack for migrations, temporary test identities, test data, Storage, and pgTAP execution.
- Do not connect to IBNApp.
- Do not modify any remote Supabase project and do not run a remote `db push`.
- Keep PR #2 in draft state.
- Do not implement homepage work, coupons, or order management.
- Do not create an admin mock repository, mock API, fixture dashboard, or fallback sample data.
- Show numeric zeroes and explicit empty states when the database contains no matching rows.
- Keep the public storefront on `COMMERCE_PROVIDER=mock` until a separately approved remote rollout.
- Every mutation enters through a Server Action that authenticates the current user, authorizes the current active staff role, validates untrusted input, performs an RLS-protected query or approved RPC, maps failures to safe Italian UI copy, and revalidates affected routes and cache tags.
- The privileged Supabase client is not used as a general admin bypass. Authenticated admin work uses the request-scoped session client and remains subject to RLS.

## 3. Delivery checkpoints

### Checkpoint 1: protected operational shell

Checkpoint 1 consists of:

- email/password admin login through a Server Action;
- protected `/admin` layout and logout;
- active `staff_profiles` lookup with `owner`, `admin`, and `editor` role separation;
- persistent order-intake warning sourced from `site_settings`;
- dashboard sourced from real product and inventory tables;
- zero metrics and an inventory-movement empty state for an empty database.

This checkpoint is already present on `codex/admin-supabase` and remains the foundation for Checkpoint 2.

### Checkpoint 2: catalog operations

Checkpoint 2 consists of:

1. product list and editor backed by the relational catalog schema;
2. product media library backed by Supabase Storage and `media_assets`;
3. inventory view and authenticated adjustments through `adjust_inventory()`;
4. full local/CI verification for TypeScript, application tests, migrations, RLS, Storage policies, and production build.

After Checkpoint 2 passes, work stops. Coupon, order, homepage, and remote rollout work remain out of scope.

## 4. Authorization model

The control panel reuses the approved database-backed staff model. No authorization decision reads user metadata.

| Capability | Editor | Admin | Owner |
| --- | --- | --- | --- |
| Open protected admin routes | Yes | Yes | Yes |
| Read products, product children, media, and inventory summaries | Yes | Yes | Yes |
| Edit product content, publication, tags, relations, and media links | Yes | Yes | Yes |
| Upload or replace product media | Yes | Yes | Yes |
| Edit price and commerce controls | No | Yes | Yes |
| Adjust inventory through `adjust_inventory()` | No | Yes | Yes |
| Permanently delete products or media | No | Yes | Yes |

RLS remains the final database enforcement layer. Server Actions repeat role checks to fail early with useful application behavior, but UI visibility and application checks never replace database policy.

## 5. Admin login invariants

The admin login is the only public entry point under `/admin`.

- There is no public staff registration flow and no signup button.
- Open signup can never create or promote a staff identity.
- Staff users are created or promoted only through an explicitly authorized operational procedure backed by `staff_profiles`.
- Login uses email and password through a Server Action.
- Every authentication or staff-authorization failure returns the same generic error and never reveals whether the email exists.

## 6. Server mutation boundary

Every admin Server Action follows one sequence:

1. parse every path, query, form, and file value with a dedicated Zod schema;
2. create a fresh request-scoped Supabase server client;
3. validate the authenticated identity with `getUser()` or `getClaims()` through the existing guards;
4. load the active staff profile and require the exact allowed roles;
5. execute direct RLS-protected CRUD for catalog and media metadata, or call the approved inventory RPC;
6. map known validation, uniqueness, permission, Storage, and inventory errors to safe Italian messages without exposing SQL or policy details;
7. revalidate affected admin routes, public product routes, and existing cache tags.

No Client Component receives a secret key. Client Components may submit forms and display returned action state, but they do not write directly to database tables or Storage.

## 7. Dashboard

The dashboard reads only real rows visible to the authenticated staff session. It reports:

- total, published, draft, and archived product counts;
- sold-out, low-stock, and preorder product counts derived from persisted product fields;
- the latest inventory movements joined to product name and SKU.

No revenue, conversion, order, trend, forecast, or comparison value is shown because those features are outside this checkpoint. Empty tables produce zero for every metric. No movement rows produce a directed empty state rather than fabricated activity.

## 8. Product management

### List

`/admin/prodotti` provides server-backed search, category, publication, availability, and low-stock filters; deterministic sorting; bounded pagination; CSV export; row selection; and validated bulk actions. The page reads the real `products` and `categories` tables. Bulk publication and category actions execute through transactional PostgreSQL functions so a partial batch cannot be committed.

### Editor

`/admin/prodotti/nuovo` and `/admin/prodotti/[id]` manage:

- identity: name, short name, slug, SKU, category;
- content: tagline, description, blade type, SEO fields, sort order;
- commerce fields for owners/admins: prices, stock controls, backorder and preorder settings;
- publication and active state;
- tags, related products, specifications, features, box contents, and product-image links.

Stock quantity is read-only in the product editor. Changes occur only in the inventory section through `adjust_inventory()`.

All child-resource actions validate identifiers, enum values, bounded text, sort order, and resource ownership. Product creation, duplication, publication, archiving, and bulk operations enforce the same role boundary as single-record editing.

Duplicating a product and its selected child records is one transactional PostgreSQL operation. A failure cannot leave a product without the intended tags, relations, specifications, features, box contents, or image associations. When specifications, features, and box contents are submitted as one coordinated save, that save is also one transaction.

### Availability source of truth

The database-generated columns are authoritative. Admin pages read and display all of:

- `stock_quantity` as real stock;
- `availability_override` as the explicit override;
- generated `stock_status` as effective availability;
- generated `is_purchasable` as purchase eligibility.

Client code does not reimplement this derivation. `allow_backorder` remains a separate commerce control and does not visually turn an exhausted product into an available product. Any checkout rule that changes this behavior requires a future approved design.

### Archiving and permanent deletion

Archiving is the normal product-removal action. Hard delete is an exceptional owner/admin action and is allowed only when a transactional preflight proves that:

- no `order_items` reference the product;
- no bundle or bundle item references the product;
- no remaining relation or dependency would be broken;
- the UI has shown a concrete consequence summary;
- the user has explicitly confirmed the product identity and permanent action.

Hard delete never removes linked Storage objects automatically. Shared media remains intact. Orphaned media is handled separately through the media library and its own authorization and usage checks.

## 9. Media and Storage

`/admin/media` is a real media library over the private `product-images` bucket and `media_assets` table.

### Asset lifecycle

The database defines `media_asset_status` with exactly three values:

- `pending`: metadata reservation exists, but uploaded bytes are not yet trusted;
- `ready`: Storage object and persisted metadata were verified and finalized;
- `failed`: upload or finalization failed and the reservation is retained only for cleanup or audit.

Only `ready` assets may be associated with `product_images`, marked published, returned by the public catalog, or treated as public product-image objects by Storage RLS. The migration that introduces the lifecycle must update `private.is_public_product_image_object(...)` and every catalog visibility helper or policy that can expose a product image so they require the linked media asset to be `ready`.

### Upload

The media library supports file selection and drag-and-drop for multiple images. A batch contains at most the server-only `ADMIN_MEDIA_UPLOAD_BATCH_LIMIT`, defaults to 8 files, and has a hard maximum of 20. Every file receives an isolated lifecycle and individual result; one failed file does not roll back successful siblings.

For each file, the upload flow is:

1. A begin-upload Server Action validates the file declaration, active staff role, MIME type, byte size, and required alt text.
2. The server generates a unique `object_path`; the browser cannot select or alter it.
3. The action inserts a `media_assets` reservation with status `pending` and the authenticated uploader.
4. The action creates a short-lived signed upload authorization scoped to that exact bucket and path.
5. The browser uploads bytes with `uploadToSignedUrl`; no secret key, arbitrary path permission, or base64 database payload is exposed.
6. A finalize-upload Server Action verifies the authenticated staff identity again, loads the matching pending reservation, inspects the Storage object, downloads at most the allowed 10 MiB, decodes the image, and verifies object path, MIME type, byte size, intrinsic dimensions, and persisted metadata.
7. The finalizer marks the reservation `ready`.
8. The finalizer records the completed Storage audit event.
9. If upload or finalization fails, the finalizer removes the object when present, then deletes the unused reservation or marks it `failed` when an auditable failure record is required, and returns a safe per-file error.

The Server Action always begins and finalizes the mutation. The byte transfer alone may occur in the browser through the path-specific temporary signed upload URL.

Every file validates:

- non-empty file and maximum size of 10 MiB;
- MIME type limited to PNG, JPEG, WebP, or AVIF;
- decoded image format and positive intrinsic width and height;
- required, bounded alt text;
- SVG rejection regardless of filename or claimed MIME type;
- no base64 image bytes stored in PostgreSQL.

### Read and preview

The library reads `media_assets` under RLS, supports bounded search and pagination, and generates short-lived signed preview URLs on the server. An empty bucket/table produces a media empty state. No placeholder media record is synthesized.

### Versioned replace, associate, and delete

- Replacing a file never overwrites its existing Storage path. It creates a new unique path and pending reservation, uploads and verifies the new object, marks the new asset `ready`, and then calls one transactional PostgreSQL function that atomically repoints the selected `product_images` associations. Only after that commit may the server delete the old object and record when it is no longer referenced anywhere.
- If any pre-swap step or the atomic association swap fails, every association continues pointing to the previous image. Failed new objects and reservations follow the normal compensation path.
- Associating media creates or updates a `product_images` row and supports alt text, publication state, primary image, and sort order. The database rejects any association to an asset not in `ready` state.
- Image reorder and primary-image changes are transactional PostgreSQL operations. Reorder uses a collision-free two-phase position update or equivalent single transaction so `unique(product_id, sort_order)` cannot fail midway. Primary change clears and sets the partial unique `is_primary` index within the same transaction.
- Editors may upload, replace, and associate media.
- Only owners/admins may permanently delete media. Deletion refuses or explicitly reports assets still linked to products, rather than silently breaking product images.
- Storage mutation completion is audited using the existing protected database capability.

## 10. Inventory

`/admin/inventario` reads real products and recent `inventory_movements`. It supports search, low-stock filtering, and selection of a product from a product-editor deep link.

An adjustment form requires:

- a valid product SKU;
- a non-zero bounded integer delta;
- an allowed manual inventory reason;
- a bounded optional note;
- explicit confirmation when the adjustment would materially reduce stock.

The Server Action permits owners/admins only and calls `public.adjust_inventory(p_sku, p_delta, p_reason, p_note)` with the request-scoped authenticated client. It never updates `products.stock_quantity` directly. The RPC owns row locking, non-negative-stock enforcement, generated availability refresh, movement creation, and the administrative audit event. The UI displays the authoritative returned stock value and reloads movement history.

`inventory_movements` is the immutable operational stock ledger. `audit_events` separately records who initiated the administrative adjustment and its before/after context.

## 11. Transactional operation requirements

The following operations must not be implemented as independent query sequences when an intermediate failure could persist partial state:

- product duplication with child resources;
- image reorder;
- primary-image change;
- versioned media replacement and association swap;
- bulk publication and category actions;
- coordinated replacement of specifications, features, and box contents submitted as one save.

Each uses a narrowly scoped PostgreSQL function or RPC with explicit role checks, fixed `search_path`, least-privilege grants, row locking where concurrency matters, and all-or-nothing transaction semantics. `SECURITY DEFINER` is used only when the operation genuinely requires privileges beyond caller RLS; it never replaces authentication or staff authorization.

## 12. Audit invariants

Every administrative mutation produces an `audit_events` record, including:

- product creation, edit, publication, archiving, duplication, bulk action, and permanent deletion;
- tag, relation, specification, feature, box-content, and image-association changes;
- media upload, finalization, failed cleanup, versioned replacement, association, reorder, primary change, and permanent deletion;
- inventory adjustment.

Existing database triggers remain the primary database defense and are extended to new lifecycle tables and transactional functions where coverage is missing. Server Actions do not replace trigger-based auditing and do not insert arbitrary audit rows directly. Inventory retains both the operational `inventory_movements` ledger and the administrative `audit_events` trail.

## 13. UI direction and accessibility

The existing admin shell remains the visual source of truth: graphite navigation rail, light operational canvas, violet interaction color, acid-lime status accents, compact Archivo headings, and tabular operational data. Products, media, and inventory extend this language instead of introducing a second dashboard style.

The unique admin signature is the persistent operational state rail combined with real-time catalog/inventory status. Decoration stays secondary to dense, legible controls.

Requirements:

- responsive desktop rail and mobile dock;
- usable layouts from narrow mobile through wide desktop;
- visible keyboard focus, semantic labels, error association, and logical tab order;
- no color-only status communication;
- reduced-motion compliance;
- action copy names the actual operation: save, publish, upload, replace, associate, adjust, or delete.

## 14. Error and empty-state behavior

- Authentication failure never reveals whether an email exists.
- Authorization failure redirects away from protected content or returns a safe forbidden action result.
- Validation errors preserve actionable field context where possible.
- Duplicate slug/SKU, media conflict, unsupported image, oversized file, upload finalization failure, linked-media deletion, blocked product deletion, and invalid inventory adjustment receive specific safe Italian messages.
- Unknown errors use a generic retry message and remain server-side.
- Empty products, media, and movement collections render a useful next action.
- Dashboard numeric cards always render real counts, including `0`.

## 15. Test strategy

### Application tests

Vitest covers:

- Zod schemas and normalization for product, media, and inventory inputs;
- role capability decisions;
- dashboard zero-state summaries;
- product list filters and faithful use of generated availability columns without client-side re-derivation;
- mutation-boundary contracts: Server Actions, request-scoped client, auth guard, role guard, validation, and correct RPC usage;
- media reservation/finalization, isolated batch results, versioned replacement compensation, and safe error mapping through focused service functions;
- transactional RPC contracts and audit coverage for every mutation family.

Tests follow red-green-refactor for new behavior.

### Supabase CI tests

The Supabase CLI stack resets the local database from committed migrations and seed rules, then runs pgTAP coverage for:

- anonymous, customer, editor, admin, and owner RLS boundaries;
- private bucket policies and signed-object access assumptions;
- pending/ready/failed media lifecycle, ready-only association/publication, uploader provenance, path-scoped upload authorization, and mutation audit functions;
- editor versus owner/admin delete permissions;
- atomic product duplication, bulk actions, child saves, image reorder, primary-image switch, and media association replacement;
- permanent product-deletion preflight against orders, bundles, relations, and other dependencies;
- `adjust_inventory()` authorization, locking behavior, non-negative stock, derived status, and movement creation;
- `audit_events` creation for product, child, media, Storage, and inventory mutation families;
- an empty-database path that does not depend on seed catalog rows.

Temporary auth users and test data exist only inside the CI/local stack and are removed by reset/teardown.

### Checkpoint verification

Checkpoint 2 requires all of the following to pass from the admin worktree:

- ESLint;
- Next.js type generation and TypeScript checking;
- Vitest suite;
- Supabase local reset;
- pgTAP database suite;
- Supabase database lint at error level;
- production Next.js build;
- focused admin browser checks against the local Supabase stack.

The browser suite explicitly covers:

- staff login and logout;
- anonymous redirect to admin login;
- editor denial for price and inventory mutations;
- draft product creation and publication;
- atomic product duplication;
- multiple upload with partial success;
- media association and primary-image change;
- versioned replace preserving the previous image when finalization or swap fails;
- inventory adjustment through `adjust_inventory()`;
- empty dashboard, product, media, and inventory states;
- responsive admin layouts at 390, 768, and 1440 CSS pixels.

No remote URL, remote project reference, `db push`, deployment, PR state change, or storefront provider rollout is part of verification.

## 16. Completion criteria

Checkpoint 2 is complete when:

- an authorized local CI staff account can sign in and use the protected admin shell;
- dashboard values come from real local Supabase rows and remain truthful when empty;
- product list/editor mutations persist to the real local schema under RLS;
- valid isolated media reservations, signed uploads, ready-only previews, associations, versioned replacements, and authorized deletions operate through real local Storage and metadata rows;
- inventory adjustments persist only through `adjust_inventory()` and create real movements;
- atomic multi-row mutations cannot leave partial catalog state and every mutation family produces its required audit trail;
- role boundaries hold in both application tests and pgTAP;
- the public storefront remains on the mock provider;
- the full checkpoint verification passes;
- work stops before homepage, coupons, orders, remote rollout, or PR publication.
