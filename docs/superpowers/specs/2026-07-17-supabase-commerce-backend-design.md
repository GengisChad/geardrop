# Supabase Commerce Backend Design

**Date:** 2026-07-17
**Status:** approved
**Project:** GEAR//DROP

## Approved invariants

1. `customer_profiles` and `staff_profiles` are separate tables.
2. Existing Supabase Auth users are preserved and receive no automatic staff privilege.
3. The first two owners are assigned by an explicit, documented, transactional one-shot procedure.
4. Every seeded product starts with real `stock_quantity = 0`.
5. `site_settings.accept_orders` starts as `false`.
6. A zero-stock product cannot become automatically available or purchasable.
7. `preorder` and `incoming` require an explicit `availability_override`.
8. Guest checkout remains supported but is blocked without side effects while `accept_orders = false`.
9. Order creation is server-side only and recalculates product prices, coupon, shipping, subtotal, discount, and total from database data.
10. An authenticated customer can read only their own orders.
11. Active owners and admins can read all orders.
12. Editors cannot read or manage sensitive order/customer data; an editor who is also a customer keeps only normal own-order access.
13. Every server Supabase client is created per request/operation and never stored in module scope.
14. Server authorization uses `getClaims()` or `getUser()` and never trusts `getSession()`.
15. Secret/service credentials exist only in `server-only` modules and are not a general RLS bypass.
16. RLS is enabled on every exposed table.
17. Anonymous catalog reads require an active category, a `published` and active product, and a published associated image.
18. The catalog seed is idempotent: reruns update content but never overwrite real stock, availability overrides, or order settings. First insertion uses zero stock.
19. After initial zero-stock insertion, every stock change goes through a transactional database function and writes `inventory_movements`; direct stock updates are revoked from application roles.
20. Coupon redemption, order insertion, and stock decrement use stable lock ordering and one transaction to prevent race conditions and overselling.
21. No remote reset, migration push, or Supabase mutation occurs before the explicit remote rollout gate.
22. No Edge Function is introduced in this phase; a future Stripe webhook is the only currently anticipated Edge Function use.
23. Committed migrations are additive and forward-only. The first migration aborts on a non-dedicated `public` schema and never deletes or resets existing application data.

## 1. Goal

Replace the current local-only commerce backend with a relational Supabase backend while preserving the existing `CommerceProvider` boundary and mock provider. Add email/password authentication, customer accounts, protected order history, guest checkout, atomic order creation, catalog and inventory management foundations, and role-separated staff authorization.

Payment processing is explicitly out of scope for this phase. New orders are created with `status = 'pending'` and `payment_status = 'unpaid'`. No card data is collected or stored.

## 2. Scope

### Included

- Reset the obsolete application objects currently in the remote `public` schema.
- Create a normalized commerce schema for catalog, inventory, coupons, customers, staff, orders, order lines, shipping methods, and audit events.
- Seed the database from the current local catalog, including categories, bundle, images, specifications, features, box contents, relationships, shipping rules, and current stock states.
- Integrate Supabase with Next.js using `@supabase/ssr`.
- Add email/password registration, email confirmation, login, logout, password recovery, and protected account pages.
- Allow both authenticated and guest checkout.
- Add a protected `/admin` shell with a persistent warning banner whenever order acceptance is disabled.
- Create orders only through a server-side action backed by one transactional PostgreSQL RPC.
- Keep all UI independent of Supabase queries through `CommerceProvider` and server-side application services.
- Retain the mock provider for unit tests and offline development.

### Excluded

- Stripe, PayPal, Klarna, or any other payment gateway.
- Payment webhooks and asynchronous fulfillment jobs.
- Transactional order email delivery. The UI must not claim an order email was sent until an email provider is added.
- A full visual catalog-management dashboard. This phase includes only the protected admin safety shell, launch checklist, disabled-orders banner, and owner/admin order inspection/cancellation needed for safe rollout.
- Synchronizing the browser cart or wishlist across devices.
- Deleting Supabase-managed schemas or existing `auth.users` records.

## 3. Dedicated-project and non-destructive migration boundary

GearDrop is installed only on a new dedicated Supabase project. IBNApp must never be linked, inspected, modified, reset, or reused for GearDrop.

All committed migrations are additive and forward-only. The first migration inspects `public` and aborts with `GD_DEDICATED_PROJECT_REQUIRED` when non-extension application tables already exist. It never drops schemas, tables, Auth users, Storage objects, or existing application data.

No Auth user receives staff privilege automatically. A user can authenticate as a normal customer, but staff capability requires an active row in `staff_profiles`. Exactly two initial owners are assigned later through the guarded one-shot procedure after both accounts are confirmed.

## 4. Application architecture

### 4.1 Supabase clients

Three factories are required. None may place a server client in module-global shared state.

1. `src/lib/supabase/client.ts`
   - creates the browser client with `createBrowserClient`;
   - uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`;
   - is used only for browser-side Auth operations that genuinely need it.

2. `src/lib/supabase/server.ts`
   - creates a new request-scoped `createServerClient` for Server Components, Server Actions, Route Handlers, and the Next.js proxy;
   - reads and writes the current request cookies;
   - uses the publishable key and therefore remains subject to RLS;
   - is never cached across requests.

3. `src/lib/supabase/admin.ts`
   - imports `server-only`;
   - creates a new privileged client from `SUPABASE_SECRET_KEY` for a single server-side operation;
   - disables session persistence and token refresh;
   - is never imported by Client Components and is never stored globally;
   - is used only for flows with no authenticated database context, specifically guest order creation and the documented one-shot initial-owner bootstrap.

The secret/service role is not a general replacement for RLS. Authenticated catalog, account, staff, and checkout operations use the request-scoped client.

Catalog access, checkout, and future staff CRUD remain in Next.js Server Components, Server Actions, or Route Handlers plus PostgreSQL. No Edge Function is introduced in this phase. A future Stripe webhook is the only currently anticipated Edge Function use; any other external or asynchronous integration requires a new approved design.

### 4.2 Session validation

The Next.js proxy refreshes Auth cookies using `auth.getClaims()`. Protected Server Components, Server Actions, and Route Handlers use `auth.getClaims()` or `auth.getUser()` before accessing protected data. Server authorization never relies on `auth.getSession()`.

### 4.3 Commerce adapter

`CommerceProvider` remains the only catalog interface consumed by pages and application services.

- Add `src/lib/commerce/supabase-provider.ts`.
- Convert provider selection into a request-scoped factory so a Supabase-backed provider never captures a cross-request client.
- Support `COMMERCE_PROVIDER=mock|supabase`; the selection variable is server-only.
- `createSupabaseProvider(client)` maps relational rows into the existing `Product`, `Category`, `Bundle`, `Facets`, and `CartTotals` domain types.
- No React component imports a Supabase client or performs a Supabase query.
- The existing mock provider remains the reference implementation for tests and offline work.

The browser cart continues to store only product identifiers and quantities. A server action returns a display quote by resolving those identifiers through `CommerceProvider`. That quote is informative only; the checkout RPC independently recalculates the authoritative totals.

## 5. Relational data model

All identifiers use lowercase snake_case. Internal high-write entities use `bigint generated always as identity` primary keys. `auth.users.id` references remain UUIDs. All timestamps use `timestamptz`; all monetary values use non-negative integer cents and currency `EUR`.

### 5.1 Catalog

#### `categories`

- `id bigint` primary key
- `slug text` unique, immutable application identifier
- `name`, `tagline`, `description text`
- `active boolean`
- `sort_order integer`
- `created_at`, `updated_at timestamptz`

#### `products`

- `id bigint` primary key
- `category_id bigint` foreign key to `categories`
- `slug text` unique
- `sku text` unique
- `name`, `tagline`, `description text`
- `price_cents integer`
- `compare_at_price_cents integer null`
- `currency text` constrained to `EUR`
- `publication_status text` constrained to `draft`, `published`, or `archived`
- `active boolean`
- `stock_quantity integer`
- `availability_override text null` constrained to `preorder` or `incoming`
- `stock_status text` generated from stock and override as `disponibile`, `in-arrivo`, `pre-ordine`, or `esaurito`
- `blade_type text null` constrained to `attacco`, `difesa`, `stamina`, or `bilanciato`
- `rating numeric(2,1)` and `review_count integer`
- `created_at`, `updated_at timestamptz`

Checks enforce non-negative prices, stock, and review counts; ratings remain between 0 and 5; compare-at prices, when present, exceed the current price.

Availability is deterministic: without an override, positive stock produces `disponibile` and zero stock produces `esaurito`. `pre-ordine` and `in-arrivo` can appear only when `availability_override` is explicitly set. An `incoming` product is never orderable. A `preorder` product is orderable only against a positive numeric allocation, so zero stock never becomes purchasable through an override.

#### Product child tables

- `product_images`: product FK, path/URL, intrinsic width and height, alt text, sort order, `published boolean`.
- `product_specs`: product FK, label, value, sort order.
- `product_features`: product FK, title, description, sort order.
- `product_box_contents`: product FK, content text, sort order.
- `product_tags`: product FK and a constrained promo tag; composite primary key.
- `product_relations`: product FK, related product FK, sort order; composite primary key and self-relation check.

#### Bundles

- `bundles`: slug, eyebrow, two title lines, description, price cents, compare-at price cents, hero product FK, publication status, active flag, timestamps.
- `bundle_items`: bundle FK, product FK, quantity, sort order; composite primary key.

A public bundle is visible only when the bundle is published and active and every referenced public product satisfies the catalog visibility rules.

### 5.2 Shipping and coupons

#### `site_settings`

A single-row relational configuration stores `accept_orders boolean not null default false`, the maximum quantity per line, the default currency, and timestamps. These values have stable meaning and therefore use typed columns rather than JSONB. The initial row always has `accept_orders = false`; order creation refuses every attempt until an owner explicitly completes the enablement checklist and changes it.

#### `order_enablement_checks`

One row per required launch check stores a constrained check key, pass/fail state, short textual evidence, verifier UUID, and verification timestamp. Only owners may update these rows. The owner-only order-enablement action requires every defined check to be passed and re-runs machine-verifiable checks, including stock consistency and the latest advisor/test evidence, before setting `site_settings.accept_orders = true`.

#### `shipping_methods`

- stable code primary key;
- display label and delivery hint;
- price cents;
- nullable free-shipping threshold cents;
- active flag and sort order.

#### `coupons`

- `id bigint` primary key and normalized unique code;
- discount kind `fixed` or `percentage`;
- discount value with constraints appropriate to its kind;
- optional minimum subtotal;
- optional global maximum redemptions;
- atomic `redemption_count`;
- start/end timestamps and active flag;
- timestamps.

#### `coupon_redemptions`

- coupon FK and order FK;
- nullable customer UUID;
- normalized customer email snapshot;
- redeemed timestamp;
- one redemption row per order.

Coupon eligibility, date window, minimum subtotal, and redemption limit are checked inside the order transaction. The coupon row is locked before its count is changed.

### 5.3 Customer and staff identities

#### `customer_profiles`

- `user_id uuid` primary key referencing `auth.users(id)` with cascade delete;
- first name, last name, and nullable phone;
- timestamps.

Email remains authoritative in Supabase Auth and is not used as an authorization field in `customer_profiles`.

#### `customer_addresses`

- `id bigint` primary key;
- `user_id uuid` FK to `auth.users`;
- normalized relational address fields, label, default flag, and timestamps.

Orders do not reference a mutable address row as their historical record. They store immutable JSONB address snapshots.

#### `staff_profiles`

- `user_id uuid` primary key referencing `auth.users(id)` with cascade delete;
- `role text` constrained to `owner`, `admin`, or `editor`;
- `active boolean`;
- `created_by uuid null` and timestamps.

Customer and staff profiles are deliberately separate. No authorization decision reads user-editable `user_metadata`. Staff authorization checks the database table on each protected operation through a narrowly scoped helper in a non-exposed schema.

### 5.4 Orders and inventory

#### `orders`

- `id bigint` primary key;
- non-sensitive public-facing `order_number text` unique;
- `idempotency_key uuid` unique;
- nullable `customer_id uuid` referencing `auth.users`;
- customer email and phone snapshots;
- `status text` initially `pending` and constrained to the supported lifecycle;
- `payment_status text` initially `unpaid`;
- `payment_method text` initially `unconfigured` for this phase;
- shipping method snapshot;
- subtotal, discount, shipping, and total cents;
- currency constrained to `EUR`;
- nullable coupon FK and coupon code snapshot;
- shipping and billing address snapshots as JSONB;
- nullable customer notes;
- created and updated timestamps.

Financial checks enforce `total = subtotal - discount + shipping`, non-negative values, and `discount <= subtotal`.

#### `order_items`

- `id bigint` primary key;
- order FK;
- nullable product FK using `on delete set null`;
- immutable SKU, product name, primary image, and unit price snapshots;
- positive quantity;
- line subtotal and discount cents;
- line total cents with consistency checks.

#### `inventory_movements`

- product FK;
- signed quantity delta;
- reason constrained to supported inventory events;
- nullable order FK;
- actor UUID when available;
- timestamp and optional note.

Creating a pending order immediately decrements `products.stock_quantity` and writes an inventory movement. This is an atomic stock update rather than an expiring reservation, so no background reservation-release worker is required in this phase. The owner/admin cancellation flow restores stock and records inventory movements in the same transaction that marks the order cancelled; editors cannot call it.

### 5.5 Audit

`audit_events` records actor UUID, action, entity type and ID, and JSONB `before_data`/`after_data`, plus timestamp. JSONB is acceptable here because audit payloads vary naturally. Public roles cannot insert arbitrary audit events. Database triggers or protected server operations create them, and only active owners/admins may read them.

## 6. Public catalog visibility

RLS is enabled on every table in the exposed `public` schema. Explicit grants are used because new Supabase projects may not expose SQL-created tables to the Data API automatically.

Anonymous and authenticated users can read a category only when `categories.active = true`.

They can read a product only when all of the following hold:

- `products.publication_status = 'published'`;
- `products.active = true`;
- the associated category is active.
- at least one associated product image has `published = true`.

They can read a product image only when:

- `product_images.published = true`;
- its product passes the public product rule;
- its product category is active.

Product specs, features, box contents, tags, relationships, bundles, and bundle items are public only through an associated publicly visible product or bundle. Draft, inactive, archived, orphaned, or unpublished catalog records never appear through the publishable key.

To express this multi-table rule consistently without circular RLS policies, one narrowly scoped stable helper in a non-exposed schema evaluates only catalog publication flags. Product, image, and child-table policies call that helper. It returns only a public-visibility boolean, cannot mutate data, uses a fixed empty search path, and exposes no customer, staff, order, coupon, or inventory values.

## 7. Authorization matrix

| Capability | Guest | Customer | Editor | Admin | Owner |
| --- | --- | --- | --- | --- | --- |
| Read public catalog | Yes | Yes | Yes | Yes | Yes |
| Read drafts/inactive catalog | No | No | Yes | Yes | Yes |
| Edit catalog content | No | No | Yes | Yes | Yes |
| Change inventory/coupons/shipping | No | No | No | Yes | Yes |
| Read own customer profile | No | Yes | Own customer row only | Own customer row only | Own customer row only |
| Update own customer profile/address | No | Yes | Yes as customer | Yes as customer | Yes as customer |
| Read own orders | No | Yes | Own customer orders only | All orders | All orders |
| Read other customers/order PII | No | No | No | Yes | Yes |
| Change order lifecycle | No | No | No | Yes | Yes |
| Manage staff roles | No | No | No | No | Yes |
| Read audit events | No | No | No | Yes | Yes |

An editor receives no policy on customer PII, all-orders views, order items belonging to other customers, coupon redemptions, or audit events. If an editor is also a customer, the normal owner predicate still permits only their own customer data and orders.

## 8. Transactional order creation

### 8.1 Server boundary

The checkout Client Component submits a Zod-validated payload to a Next.js Server Action. The payload contains:

- product SKU or stable product ID and positive integer quantity;
- contact and shipping fields;
- shipping method code;
- optional coupon code;
- optional notes;
- an opaque idempotency key.

It never contains an authoritative product name, price, discount, shipping price, subtotal, or total.

The Server Action:

1. validates shape and bounded lengths;
2. calls `getClaims()` to determine whether the request has an authenticated user;
3. uses the request-scoped client for an authenticated checkout;
4. uses the privileged server-only client only when no authenticated context exists and forces the order to be a guest order;
5. invokes the same PostgreSQL RPC;
6. maps known domain failures to safe Italian UI messages;
7. returns only the order number and authoritative totals needed for confirmation.

### 8.2 PostgreSQL RPC

`public.create_order` is a short `SECURITY DEFINER` function with `search_path = ''`. Execute is revoked from `PUBLIC` and `anon`; it is granted only to `authenticated` and `service_role`. The function is not callable by a browser publishable-key guest. Guest calls reach it only through the Next.js server-only privileged client.

Within one database transaction, the function:

1. rejects empty carts, duplicate SKUs, non-integer quantities, zero/negative quantities, and quantities above the configured per-line limit;
2. derives the authenticated customer from `auth.uid()`; service-role guest calls always create `customer_id = null`;
3. locks requested product rows in ascending product ID order with `FOR UPDATE` to prevent deadlocks;
4. reloads names, SKUs, images, prices, publication state, active state, category state, stock state, and stock quantities from the database;
5. rejects unpublished, inactive, inactive-category, unavailable, or insufficient-stock products;
6. reads the active shipping method and computes its price and free-shipping threshold;
7. normalizes and locks the coupon row, validates its window, subtotal threshold, and remaining global uses, and increments its redemption count atomically;
8. computes subtotal, discount, shipping, and total in integer cents;
9. creates the order using immutable contact, address, shipping, coupon, and financial snapshots;
10. inserts all order item snapshots in one set-based statement;
11. decrements stock with guarded updates and records inventory movements;
12. records the coupon redemption when applicable;
13. returns the existing order for a safe retry using the same idempotency key and the same authenticated customer or normalized guest email, rather than creating a duplicate.

Any failure rolls back products, coupon counts, order, items, and inventory movements together. There are no external network calls inside the transaction.

This design prevents overselling, partial orders, coupon overuse, negative quantities, inconsistent totals, duplicate double-click orders, and lock-order race conditions.

## 9. Authentication flows

- Registration: email and password through a Server Action; Supabase sends confirmation email.
- Confirmation: `/auth/confirm` verifies the token hash and redirects safely.
- Login: email and password through a Server Action.
- Logout: Server Action followed by redirect.
- Password recovery: request reset email, then update password from a protected recovery route.
- Account: protected with `getClaims()`/`getUser()`, shows editable customer profile and only the authenticated customer's orders.
- Proxy: refreshes cookies but does not globally redirect every anonymous route; only account/order/staff routes are protected.

Open signup creates customers, never staff. No signup field or user metadata can select a staff role.

The first two owners are assigned through a documented one-shot operational procedure. Both accounts must already exist and have confirmed email addresses. A service-role-only bootstrap RPC accepts exactly two distinct normalized emails, refuses to run if any `staff_profiles` row already exists, resolves both identities from `auth.users`, inserts both owner rows in one transaction, and becomes permanently ineffective after success. The companion server-only script verifies the result without printing secrets.

The protected `/admin` layout reads `site_settings.accept_orders`. While false, it renders a persistent high-visibility banner stating that checkout and order intake are disabled. The banner cannot be dismissed and appears to owners, admins, and editors on every admin route.

## 10. Error handling and privacy

Known database errors use stable domain codes such as `GD_EMPTY_CART`, `GD_INVALID_QUANTITY`, `GD_PRODUCT_UNAVAILABLE`, `GD_INSUFFICIENT_STOCK`, `GD_INVALID_COUPON`, and `GD_CHECKOUT_DISABLED`. The Server Action maps them to user-safe messages without exposing SQL, table names, coupon limits, or other customers' data.

Unknown errors return a generic checkout failure and remain in server logs. Authentication errors avoid revealing whether an email is registered. Account and order routes return not-found or unauthorized responses without exposing resource existence across users.

Guests receive an order number only in the immediate successful Server Action response. No anonymous `SELECT` policy exists on orders or order items, so order numbers cannot be used to enumerate or retrieve guest orders.

## 11. Indexes and database performance

- Index every foreign key used in joins or cascades.
- Add indexes for all ownership and RLS predicates, especially `orders.customer_id`, `customer_addresses.user_id`, and staff lookup columns.
- Use `(select auth.uid())` in RLS predicates so the function is evaluated once per statement.
- Add partial indexes for public products, public images, active coupons, and pending orders where the query predicates match.
- Add a composite order-history index on `(customer_id, created_at desc)`.
- Acquire checkout locks in stable product-ID order.
- Keep checkout transactions short and free of HTTP calls.
- Use set-based inserts for order items and inventory movements.

## 12. Security-definer controls

Security-definer code is limited to cases that genuinely require it:

- the transactional `create_order` RPC;
- a non-exposed staff-role lookup helper used by RLS;
- tightly scoped audit trigger helpers if required.

Every such function:

- sets `search_path = ''`;
- schema-qualifies every object;
- validates caller identity or the expected guest service context;
- has default `PUBLIC` execute revoked;
- grants execute only to the roles that require it;
- is covered by explicit tests and Supabase security advisors.

## 13. Source data and generated types

The current `src/data/catalog.ts` and `src/data/assets.ts` remain the reviewed seed source for the initial import. A deterministic seed script maps the existing domain data to relational rows. Product image paths continue to point at committed files under `public/`; Supabase Storage is not required in this phase.

The current source catalog contains availability labels but no real numeric inventory. To avoid inventing stock, the initial production seed sets every `stock_quantity` to `0` and keeps checkout disabled through `site_settings.accept_orders = false`. The owner must load real quantities through a reviewed operational SQL update before enabling checkout. Automated checkout tests use isolated fixture quantities and roll them back after verification.

The seed is repeatable and idempotent. On conflict it may update reviewed catalog copy and relationships, but it never overwrites `stock_quantity`, `availability_override`, `site_settings.accept_orders`, coupons, orders, or inventory history. After initial insertion, inventory is changed only by transactional functions that also append `inventory_movements`; application roles receive no direct product-stock update privilege.

Before `accept_orders` can be changed to true, an owner must complete and record this checklist:

- both initial owner accounts are confirmed and present in `staff_profiles`;
- production URL and publishable/secret environment variables are configured in the hosting platform;
- all intended products have reviewed numeric stock values;
- every product with zero stock resolves to `esaurito` unless an explicit `preorder` or `incoming` override is set;
- every preorder has a positive reviewed allocation and every incoming product remains non-orderable;
- shipping methods and free-shipping thresholds are reviewed;
- coupon rows are reviewed or disabled;
- public RLS probes, cross-customer isolation tests, editor-denial tests, and guest-order enumeration tests pass;
- concurrent last-unit and final-coupon tests pass;
- Supabase security and performance advisors have no unaddressed high-severity findings introduced by the migration;
- a real guest smoke order and a real authenticated smoke order succeed in the local or pre-production environment, remain `pending`/`unpaid`, and decrement stock exactly once;
- cancellation/restock recovery is verified;
- database backup or point-in-time recovery readiness is confirmed.

Order intake is enabled only through an owner-protected Server Action that rechecks this database-backed checklist. Direct client updates to `site_settings.accept_orders` are never allowed.

Database TypeScript types are generated from the resulting schema and committed under `src/lib/supabase/database.types.ts`. Supabase package versions are pinned and `pnpm-lock.yaml` remains committed.

## 14. Verification and acceptance criteria

### Database

- Old `public` application tables are absent; system schemas and Auth users remain.
- Every exposed table has RLS enabled and only intentional grants.
- Anonymous catalog queries return only active categories, published active products, and published images.
- Anonymous queries cannot read orders, order items, profiles, staff, coupons, redemptions, inventory movements, or audit events.
- Customer A cannot read or mutate Customer B's profile, addresses, or orders.
- Editors cannot read other customers' PII or manage orders.
- Admins and owners can read all orders; only owners can manage staff roles.
- `site_settings.accept_orders` starts false and the admin banner remains visible while it is false.
- Supabase security and performance advisors contain no unaddressed high-severity finding caused by this migration.

### Checkout

- Client-supplied prices and totals are ignored.
- Negative, zero, non-integer, excessive, duplicate, missing, inactive, unpublished, out-of-stock, and insufficient-stock lines fail safely.
- Concurrent attempts for the final unit result in exactly one successful order.
- Concurrent final coupon use results in exactly one redemption.
- A forced failure after order insertion leaves no order, item, coupon increment, or stock change.
- Retrying the same idempotency key returns the original order without consuming stock twice.
- Guest and authenticated checkouts both work; only authenticated orders appear in account history.
- With `accept_orders = false`, guest and authenticated order attempts fail before stock, coupons, orders, or audit data changes.

### Application

- No Supabase query exists in a React UI component.
- Supabase catalog pages use `supabase-provider.ts` through `CommerceProvider`.
- Mock-provider unit tests continue to pass without environment variables or network access.
- Auth route tests cover registration validation, login failure, confirmation, logout, and protected redirects.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and relevant Playwright flows pass.

## 15. Documentation basis

This design follows the current Supabase guidance for:

- request-scoped Next.js SSR clients and `getClaims()` protection: <https://supabase.com/docs/guides/auth/server-side/creating-a-client>
- choosing `@supabase/ssr` for cookie-based sessions: <https://supabase.com/docs/guides/auth/choosing-a-server-package>
- Row Level Security: <https://supabase.com/docs/guides/database/postgres/row-level-security>
- securing the Data API and explicit grants: <https://supabase.com/docs/guides/api/securing-your-api>
- database functions and function privileges: <https://supabase.com/docs/guides/database/functions>

Relevant 2026 platform changes are accounted for: new tables may not be automatically exposed to the Data API, modern publishable/secret keys are preferred, Node.js 20 is no longer supported by current Supabase JavaScript packages, and TypeScript 5.x remains supported by this project.
