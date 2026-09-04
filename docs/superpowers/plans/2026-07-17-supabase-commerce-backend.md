# GEAR//DROP Supabase Commerce Backend Implementation Plan

> **For agentic workers:** implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The authoritative requirements live in
> `docs/superpowers/specs/2026-07-17-supabase-commerce-backend-design.md`; this plan sequences the work and records acceptance checks. Do not re-derive the spec here.

**Goal:** Replace the local-only commerce backend with a relational Supabase backend behind the existing `CommerceProvider` boundary — email/password auth, customer accounts, protected order history, guest + authenticated checkout, one transactional `create_order` RPC, catalog/inventory foundations, and role-separated staff authorization. Payments remain out of scope; orders are created `pending` / `unpaid`.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.9, `@supabase/ssr` + `@supabase/supabase-js`, PostgreSQL (Supabase project `cvwigsymjlpulwgjkzix`), Vitest 4, Playwright 1.61.

## Operator prerequisites (human, not agent)

These steps require credentials and irreversible action on live infrastructure. The agent produces the SQL/code; the **operator** runs them.

- [ ] Run `supabase/inventory.sql` against the project and review what exists in `public`.
- [ ] Apply migrations in order (`supabase db push`, or paste each file into the SQL editor). `0000_reset_public.sql` is **destructive** — review the generated drop list first.
- [ ] Set env vars locally and in Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `COMMERCE_PROVIDER`.
- [ ] After the intended owner registers + confirms email, insert their first `staff_profiles` row (`role = 'owner'`) manually.
- [ ] Load real `stock_quantity` values and flip `store_settings.checkout_enabled = true` only when ready to sell.

## Global constraints

- No React component imports a Supabase client or runs a Supabase query. All access goes through `CommerceProvider` (catalog) or server actions (mutations).
- Server clients are request-scoped; never module-global. The secret key client is `server-only` and used solely for guest order creation.
- Authorization reads database tables (`staff_profiles`), never `user_metadata`. Server auth uses `getClaims()` / `getUser()`, never `getSession()`.
- The checkout RPC recomputes all authoritative money; client-supplied prices/totals are ignored.
- The mock provider stays the reference implementation and passes unit tests with no env vars and no network.

---

### Task 1: SQL migrations

**Files:** `supabase/inventory.sql`, `supabase/migrations/0000_reset_public.sql`, `0001_schema.sql`, `0002_rls.sql`, `0003_functions.sql`, `0004_seed.sql`, `supabase/README.md`.

- [x] `0001_schema.sql`: extensions; `categories`, `products` + child tables (`product_images/specs/features/box_contents/tags/relations`), `bundles`/`bundle_items`, `store_settings`, `shipping_methods`, `coupons`/`coupon_redemptions`, `customer_profiles`/`customer_addresses`, `staff_profiles`, `orders`/`order_items`, `inventory_movements`, `audit_events`. All money = non-negative integer cents, currency `EUR`; check constraints per §5; FK + RLS-predicate indexes per §11; `updated_at` triggers.
- [x] `0002_rls.sql`: `private` schema + `private.is_public_product(bigint)` helper (`security definer`, `search_path=''`, stable); enable RLS on every `public` table; catalog read policies via the helper; ownership policies for customer/staff/orders per the §7 matrix; explicit grants; `(select auth.uid())` in predicates.
- [x] `0003_functions.sql`: `public.create_order(payload jsonb)` — `security definer`, `search_path=''`, execute revoked from `public`/`anon`, granted to `authenticated` + `service_role`; the 13-step transaction of §8.2 (lock in product-id order, reload authoritative data, validate stock/coupon/shipping, set-based inserts, stock decrement + inventory movements, idempotent retry). Audit trigger helpers as needed.
- [x] `0004_seed.sql`: categories, products, images, specs, features, box contents, tags, relations, bundle + items, shipping methods, single `store_settings` row from `src/data/catalog.ts` + `src/data/assets.ts`. Production-safe: every `stock_quantity = 0`, `checkout_enabled = false`, `publication_status = 'published'`, `active = true`.
- [x] `0000_reset_public.sql`: idempotent drops of the objects this project owns, guarded; documented note that reviewing/dropping the operator's *other* obsolete objects is manual after `inventory.sql`. Never touches `auth`, `storage`, `realtime`, `vault`, `extensions`, `supabase_migrations`.

**Acceptance:** files parse as valid PostgreSQL; seed row counts match the local catalog (4 categories, 8 products, 1 bundle); no `stock_quantity > 0` in seed.

### Task 2: Supabase clients + middleware + generated types

**Files:** `package.json` (pin deps), `.env.example`, `src/lib/supabase/{client,server,admin}.ts`, `src/lib/supabase/database.types.ts`, `src/proxy.ts` (or `middleware.ts`), `src/lib/supabase/middleware.ts`.

- [x] Pin `@supabase/ssr` and `@supabase/supabase-js`; keep `pnpm-lock.yaml` committed.
- [x] `client.ts` → `createBrowserClient` (publishable key); `server.ts` → request-scoped `createServerClient` reading/writing request cookies (publishable key, RLS-bound); `admin.ts` → `import "server-only"`, secret key, no session persistence, no auto-refresh.
- [x] Middleware refreshes cookies via `auth.getClaims()`; protects only `/account`, order and staff routes — not every anonymous route.
- [x] `database.types.ts` authored to match the migration schema (regenerate with `supabase gen types` once the DB exists).

**Acceptance:** `pnpm typecheck` passes; no client component imports these; `admin.ts` fails to import client-side (`server-only`).

### Task 3: Supabase commerce provider + request-scoped selection

**Files:** `src/lib/commerce/supabase-provider.ts`, `src/lib/commerce/provider.ts`, `tests/unit/*`.

- [x] `createSupabaseProvider(client)` satisfies `CommerceProvider`, mapping relational rows to `Product`/`Category`/`Bundle`/`Facets`/`CartTotals` (money → `{amount, currency}` cents; stock label; images/specs/features/box/related).
- [x] Convert `provider.ts` to a request-scoped factory `getCommerceProvider()` supporting `COMMERCE_PROVIDER=mock|supabase` (server-only var); the Supabase branch builds a provider from the request-scoped client and never captures it across requests. Keep a mock default.
- [x] Update callers that import the `commerce` singleton to the factory.

**Acceptance:** mock unit tests still pass offline; `getCommerceProvider()` returns a fresh provider per call; no cross-request client capture.

### Task 4: Auth flows + account

**Files:** `src/app/auth/{login,registrati,recupera,confirm}/…`, server actions, `src/app/account/page.tsx`.

- [x] Register / login / logout / password-recovery server actions (Zod-validated); `/auth/confirm` verifies token hash and redirects safely; errors never reveal whether an email is registered.
- [x] Account page protected with `getClaims()`/`getUser()`; shows editable `customer_profiles` and only the authenticated customer's orders. Open signup creates customers only — never staff.

**Acceptance:** auth-route tests cover registration validation, login failure, confirmation, logout, protected redirect.

### Task 5: Transactional checkout

**Files:** `src/app/checkout/actions.ts`, `src/app/checkout/checkout-client.tsx`, `src/lib/checkout-schema.ts`.

- [x] Server action: Zod payload of `{sku|productId, quantity}[]` + contact/shipping + shipping method code + optional coupon/notes + idempotency key; **no** client name/price/total. `getClaims()` → request-scoped client for authenticated, server-only admin client forcing guest order otherwise; both call `create_order`; map `GD_*` codes to Italian messages; return only order number + authoritative totals.
- [x] Replace the client-side `makeOrderReference()` placeholder with the real server-action result; UI must not claim an email was sent (no email provider yet).

**Acceptance:** client prices ignored; invalid/oversell/duplicate/out-of-stock lines fail safely; idempotency-key retry returns the original order; guest + authenticated both work; only authenticated orders appear in account history.

### Task 6: Staff back-office (added 2026-07-20, on request)

The original spec deferred the staff UI (§2, "Excluded"). It is now in scope; the authorization model it
builds on is unchanged.

**Files:** `supabase/migrations/0005_admin.sql`, `src/app/admin/**`, `src/components/admin/admin-form.tsx`,
`src/lib/orders.ts`, `src/lib/supabase/errors.ts`.

- [x] `0005_admin.sql`: `admin_set_order_status` (lifecycle + the stock movement each transition implies,
      in one transaction), `admin_adjust_stock`, `owner_upsert_staff` / `owner_list_staff` (they need
      `auth.users`, which the Data API does not expose). All `security definer`, `search_path = ''`,
      execute revoked from `public`/`anon`, role re-checked inside.
- [x] `/admin` gated by `getStaffSession()`: signed-out → login (proxy), signed-in customer → 404, never a
      403 that would confirm the section exists. `force-dynamic` so no answer is prerendered.
- [x] Sections by role: panoramica + catalogo (editor), ordini + coupon + spedizioni/vendite (admin),
      permessi (owner). Nav hides what the role cannot use; every page and action re-checks anyway.
- [x] Every mutation is a Server Action that re-checks the role and maps `GD_*` codes to Italian.

**Acceptance:** an editor sees no order or customer PII; only an owner opens `/admin/staff`; cancelling an
order returns its units and reopening one fails when they are gone; `checkout_enabled` toggled from the UI
stops `create_order` immediately.

### Task 7: Verification

- [x] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` exit 0; mock tests need no env/network
      (76 unit tests, including the provider factory and the error mapping).
- [ ] Playwright checkout flow uses isolated fixture quantities and rolls them back. **Not done:** the
      order test now skips unless `NEXT_PUBLIC_SUPABASE_URL` is set, and a mock-mode test asserts the UI
      refuses instead of faking a confirmation. The fixture-based flow needs the live project.
- [ ] Supabase security + performance advisors: no unaddressed high-severity finding from this migration.
      **Operator-run against the live DB; not yet executed** — no migration has been applied yet.

## Out of scope

Stripe/PayPal/Klarna and any gateway, payment webhooks, async fulfillment, transactional order email,
cross-device cart/wishlist sync, deleting Supabase-managed schemas or `auth.users`.
