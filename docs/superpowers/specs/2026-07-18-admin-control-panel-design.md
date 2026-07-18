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

## 5. Server mutation boundary

Every admin Server Action follows one sequence:

1. parse every path, query, form, and file value with a dedicated Zod schema;
2. create a fresh request-scoped Supabase server client;
3. validate the authenticated identity with `getUser()` or `getClaims()` through the existing guards;
4. load the active staff profile and require the exact allowed roles;
5. execute direct RLS-protected CRUD for catalog and media metadata, or call the approved inventory RPC;
6. map known validation, uniqueness, permission, Storage, and inventory errors to safe Italian messages without exposing SQL or policy details;
7. revalidate affected admin routes, public product routes, and existing cache tags.

No Client Component receives a secret key. Client Components may submit forms and display returned action state, but they do not write directly to database tables or Storage.

## 6. Dashboard

The dashboard reads only real rows visible to the authenticated staff session. It reports:

- total, published, draft, and archived product counts;
- sold-out, low-stock, and preorder product counts derived from persisted product fields;
- the latest inventory movements joined to product name and SKU.

No revenue, conversion, order, trend, forecast, or comparison value is shown because those features are outside this checkpoint. Empty tables produce zero for every metric. No movement rows produce a directed empty state rather than fabricated activity.

## 7. Product management

### List

`/admin/prodotti` provides server-backed search, category, publication, availability, and low-stock filters; deterministic sorting; bounded pagination; CSV export; row selection; and validated bulk actions. The page reads the real `products` and `categories` tables.

### Editor

`/admin/prodotti/nuovo` and `/admin/prodotti/[id]` manage:

- identity: name, short name, slug, SKU, category;
- content: tagline, description, blade type, SEO fields, sort order;
- commerce fields for owners/admins: prices, stock controls, backorder and preorder settings;
- publication and active state;
- tags, related products, specifications, features, box contents, and product-image links.

Stock quantity is read-only in the product editor. Changes occur only in the inventory section through `adjust_inventory()`.

All child-resource actions validate identifiers, enum values, bounded text, sort order, and resource ownership. Product creation, duplication, publication, deletion, and bulk operations enforce the same role boundary as single-record editing.

## 8. Media and Storage

`/admin/media` is a real media library over the private `product-images` bucket and `media_assets` table.

### Upload

The upload Server Action accepts one bounded image at a time. It validates:

- non-empty file and maximum size of 10 MiB;
- MIME type limited to PNG, JPEG, WebP, or AVIF;
- decoded image format and positive intrinsic width and height;
- required, bounded alt text;
- normalized object path generated by the application rather than trusted from the browser.

The action uploads through the authenticated Storage client, then inserts the matching `media_assets` row with the authenticated uploader. If metadata insertion fails, it removes the newly uploaded object as compensation and returns a safe failure.

### Read and preview

The library reads `media_assets` under RLS, supports bounded search and pagination, and generates short-lived signed preview URLs on the server. An empty bucket/table produces a media empty state. No placeholder media record is synthesized.

### Replace, associate, and delete

- Replacing a file validates the new image, updates the Storage object, updates immutable-safe metadata fields, and records the completed Storage mutation through the approved database function.
- Associating media creates or updates a `product_images` row and supports alt text, publication state, primary image, and sort order.
- Editors may upload, replace, and associate media.
- Only owners/admins may permanently delete media. Deletion refuses or explicitly reports assets still linked to products, rather than silently breaking product images.
- Storage mutation completion is audited using the existing protected database capability.

## 9. Inventory

`/admin/inventario` reads real products and recent `inventory_movements`. It supports search, low-stock filtering, and selection of a product from a product-editor deep link.

An adjustment form requires:

- a valid product SKU;
- a non-zero bounded integer delta;
- an allowed manual inventory reason;
- a bounded optional note;
- explicit confirmation when the adjustment would materially reduce stock.

The Server Action permits owners/admins only and calls `public.adjust_inventory(p_sku, p_delta, p_reason, p_note)` with the request-scoped authenticated client. It never updates `products.stock_quantity` directly. The RPC owns row locking, non-negative-stock enforcement, derived status updates, and movement creation. The UI displays the authoritative returned stock value and reloads movement history.

## 10. UI direction and accessibility

The existing admin shell remains the visual source of truth: graphite navigation rail, light operational canvas, violet interaction color, acid-lime status accents, compact Archivo headings, and tabular operational data. Products, media, and inventory extend this language instead of introducing a second dashboard style.

The unique admin signature is the persistent operational state rail combined with real-time catalog/inventory status. Decoration stays secondary to dense, legible controls.

Requirements:

- responsive desktop rail and mobile dock;
- usable layouts from narrow mobile through wide desktop;
- visible keyboard focus, semantic labels, error association, and logical tab order;
- no color-only status communication;
- reduced-motion compliance;
- action copy names the actual operation: save, publish, upload, replace, associate, adjust, or delete.

## 11. Error and empty-state behavior

- Authentication failure never reveals whether an email exists.
- Authorization failure redirects away from protected content or returns a safe forbidden action result.
- Validation errors preserve actionable field context where possible.
- Duplicate slug/SKU, media conflict, unsupported image, oversized file, linked-media deletion, and invalid inventory adjustment receive specific safe Italian messages.
- Unknown errors use a generic retry message and remain server-side.
- Empty products, media, and movement collections render a useful next action.
- Dashboard numeric cards always render real counts, including `0`.

## 12. Test strategy

### Application tests

Vitest covers:

- Zod schemas and normalization for product, media, and inventory inputs;
- role capability decisions;
- dashboard zero-state summaries;
- product list filters and availability derivation;
- mutation-boundary contracts: Server Actions, request-scoped client, auth guard, role guard, validation, and correct RPC usage;
- media compensation and safe error mapping through focused service functions.

Tests follow red-green-refactor for new behavior.

### Supabase CI tests

The Supabase CLI stack resets the local database from committed migrations and seed rules, then runs pgTAP coverage for:

- anonymous, customer, editor, admin, and owner RLS boundaries;
- private bucket policies and signed-object access assumptions;
- media uploader provenance and mutation audit functions;
- editor versus owner/admin delete permissions;
- `adjust_inventory()` authorization, locking behavior, non-negative stock, derived status, and movement creation;
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
- focused admin browser checks against the local Supabase stack, including empty states and authorized mutations.

No remote URL, remote project reference, `db push`, deployment, PR state change, or storefront provider rollout is part of verification.

## 13. Completion criteria

Checkpoint 2 is complete when:

- an authorized local CI staff account can sign in and use the protected admin shell;
- dashboard values come from real local Supabase rows and remain truthful when empty;
- product list/editor mutations persist to the real local schema under RLS;
- valid media uploads, previews, associations, replacements, and authorized deletions operate through real local Storage and metadata rows;
- inventory adjustments persist only through `adjust_inventory()` and create real movements;
- role boundaries hold in both application tests and pgTAP;
- the public storefront remains on the mock provider;
- the full checkpoint verification passes;
- work stops before homepage, coupons, orders, remote rollout, or PR publication.
