# Supabase Commerce Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy remote `public` schema with a secure relational GEAR//DROP backend, email/password authentication, request-scoped Supabase access, protected customer and staff data, and atomic guest/authenticated checkout while keeping order intake disabled by default.

**Architecture:** Next.js 16 owns UI, Server Actions, Route Handlers, session refresh, and staff/customer guards. Supabase owns Auth, relational data, RLS, and one transactional order RPC. `CommerceProvider` remains the catalog boundary; the Supabase adapter is request-scoped and the mock provider stays available offline.

**Tech Stack:** Next.js 16.2.10, React 19.2.7, TypeScript 5.9.3, Zod 4.4.3, Supabase Postgres 17, `@supabase/supabase-js` 2.110.7, `@supabase/ssr` 0.12.3, Supabase CLI 2.109.1, Vitest 4.1.10, pgTAP, Playwright 1.61.1, pnpm 11.

## Global Constraints

- Execute only in `C:\Users\feder\Downloads\GearDrop-admin-supabase` on branch `codex/admin-supabase`.
- `origin/main` is the base; the frontend squash commit is `bccb4a6` and its tree matches `origin/codex/liquid-glass-coherence`.
- Preserve `auth`, `storage`, `realtime`, `vault`, `extensions`, `supabase_migrations`, and every existing `auth.users` row.
- Remove only the explicitly inventoried obsolete application objects in `public` and the obsolete `auth.users.on_auth_user_created` trigger.
- Never create a module-global server or privileged Supabase client. Browser, request-scoped server, and server-only privileged clients remain separate.
- Protect server routes and data with `auth.getClaims()` or `auth.getUser()`; never authorize with `auth.getSession()`.
- Keep `customer_profiles` and `staff_profiles` separate. Open signup never creates staff.
- Never read authorization roles from user-editable `user_metadata`.
- Enable RLS on every table in exposed schemas and use explicit least-privilege grants.
- Catalog is public only for active categories, published active products, and published associated images.
- `site_settings.accept_orders` is `false` by default and order creation must fail without side effects while false.
- Seed every production `stock_quantity` as `0`.
- Without `availability_override`, zero stock resolves to `esaurito`; `preorder` and `incoming` require explicit overrides.
- `incoming` is never purchasable. `preorder` is purchasable only with positive reviewed allocation.
- The browser submits only SKU and quantity for cart lines; database prices and totals are always authoritative.
- Guest checkout may use the privileged server-only client only to call the hardened order RPC. Authenticated checkout uses the request-scoped client.
- Do not introduce Edge Functions in this phase.
- Do not store products, images, categories, stock, or order lines as JSONB. JSONB is limited to immutable address and audit snapshots.
- Pin every new package version and commit `pnpm-lock.yaml`.
- Follow strict red-green-refactor TDD for every application behavior and pgTAP/database behavior.
- Do not mutate the remote Supabase project before Checkpoint 4 receives explicit user approval.
- Do not set remote `site_settings.accept_orders = true` during implementation or deployment. Local and pre-production tests may toggle it only inside isolated fixtures that reset afterward.

## Migration filename rule

Supabase migration filenames are intentionally not pre-invented in this plan. At execution time, create each file with `pnpm exec supabase migration new <name>` and use the exact path printed by the CLI. This overrides the normal exact-path convention because the Supabase workflow requires CLI-generated timestamps.

---

## Phase 1 — Isolated local database foundation

### Task 1: Add pinned Supabase tooling and environment contracts

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `.env.example`
- Create: `src/lib/supabase/env.ts`
- Create: `tests/unit/supabase-env.test.ts`
- Create: `supabase/config.toml` through `supabase init`

**Interfaces:**

- Produces: `readPublicSupabaseEnv(source)`, `readSecretSupabaseEnv(source)`, and pinned CLI/package scripts used by every later task.

- [ ] **Step 1: Write the failing environment tests**

```ts
import { describe, expect, it } from "vitest";
import { readPublicSupabaseEnv, readSecretSupabaseEnv } from "@/lib/supabase/env";

describe("Supabase environment", () => {
  it("reads the public URL and publishable key", () => {
    expect(
      readPublicSupabaseEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      }),
    ).toEqual({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable_test",
    });
  });

  it("rejects a missing public key", () => {
    expect(() => readPublicSupabaseEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" })).toThrow(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  });

  it("keeps the secret key in the server-only contract", () => {
    expect(
      readSecretSupabaseEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SECRET_KEY: "sb_secret_test",
      }),
    ).toEqual({ url: "https://example.supabase.co", secretKey: "sb_secret_test" });
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- tests/unit/supabase-env.test.ts`

Expected: FAIL because `src/lib/supabase/env.ts` does not exist.

- [ ] **Step 3: Install exact versions and initialize Supabase locally**

Run:

```powershell
pnpm add @supabase/supabase-js@2.110.7 @supabase/ssr@0.12.3
pnpm add -D supabase@2.109.1 tsx@4.23.1
pnpm exec supabase --help
pnpm exec supabase init
```

Add scripts:

```json
{
  "db:start": "supabase start",
  "db:stop": "supabase stop",
  "db:reset": "supabase db reset --local",
  "db:test": "supabase test db --local supabase/tests",
  "db:types": "supabase gen types --local --schema public > src/lib/supabase/database.types.ts",
  "seed:supabase": "tsx scripts/generate-supabase-seed.ts",
  "bootstrap:owners": "node scripts/bootstrap-owners.mjs"
}
```

`.env.example` must contain only variable names and safe descriptions:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
COMMERCE_PROVIDER=mock
GEARDROP_OWNER_EMAILS=
```

- [ ] **Step 4: Implement strict environment readers**

```ts
type EnvSource = Readonly<Record<string, string | undefined>>;

function required(source: EnvSource, key: string): string {
  const value = source[key]?.trim();
  if (!value) throw new Error(`Variabile ambiente mancante: ${key}`);
  return value;
}

export function readPublicSupabaseEnv(source: EnvSource = process.env) {
  return {
    url: required(source, "NEXT_PUBLIC_SUPABASE_URL"),
    publishableKey: required(source, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  } as const;
}

export function readSecretSupabaseEnv(source: EnvSource = process.env) {
  return {
    url: required(source, "NEXT_PUBLIC_SUPABASE_URL"),
    secretKey: required(source, "SUPABASE_SECRET_KEY"),
  } as const;
}
```

- [ ] **Step 5: Verify GREEN and commit**

Run:

```powershell
pnpm test -- tests/unit/supabase-env.test.ts
pnpm lint
git add package.json pnpm-lock.yaml .env.example supabase/config.toml src/lib/supabase/env.ts tests/unit/supabase-env.test.ts
git commit -m "chore: add pinned Supabase tooling"
```

Expected: environment tests and lint PASS.

### Task 2: Create the explicit legacy reset migration

**Files:**

- Create via CLI: migration named `reset_legacy_public_schema`
- Create: `supabase/tests/001_legacy_reset.test.sql`

**Interfaces:**

- Consumes: the verified remote inventory.
- Produces: a local migration that deletes only 13 legacy tables, 6 legacy functions, and 2 legacy triggers while preserving Auth users and managed schemas.

- [ ] **Step 1: Re-run read-only inventory before writing SQL**

The expected tables are exactly:

```text
audit_logs
club_join_requests
clubs
match_results
news
player_profiles
points_ledger
standings
tournament_matches
tournament_players
tournament_rounds
tournament_snapshots
tournaments
```

The expected functions are exactly:

```text
guard_clubs_status_change()
handle_new_user()
is_admin()
is_club_leader()
is_judge_or_above()
owns_tournament(uuid)
```

The expected triggers are `auth.users.on_auth_user_created` and `public.clubs.trg_guard_clubs_status`.

If the inventory differs, stop at Checkpoint 1 and revise the explicit drop list; never replace it with `drop schema public cascade`.

- [ ] **Step 2: Create the migration with the CLI**

Run: `pnpm exec supabase migration new reset_legacy_public_schema`

Populate the printed migration path with explicit statements in dependency-safe order:

```sql
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists trg_guard_clubs_status on public.clubs;

drop table if exists public.audit_logs cascade;
drop table if exists public.club_join_requests cascade;
drop table if exists public.match_results cascade;
drop table if exists public.points_ledger cascade;
drop table if exists public.standings cascade;
drop table if exists public.tournament_snapshots cascade;
drop table if exists public.tournament_matches cascade;
drop table if exists public.tournament_rounds cascade;
drop table if exists public.tournament_players cascade;
drop table if exists public.tournaments cascade;
drop table if exists public.player_profiles cascade;
drop table if exists public.clubs cascade;
drop table if exists public.news cascade;

drop function if exists public.guard_clubs_status_change();
drop function if exists public.handle_new_user();
drop function if exists public.is_admin();
drop function if exists public.is_club_leader();
drop function if exists public.is_judge_or_above();
drop function if exists public.owns_tournament(uuid);
```

- [ ] **Step 3: Write the pgTAP reset test**

```sql
begin;
select plan(3);
select has_schema('auth', 'auth schema is preserved');
select has_table('auth', 'users', 'auth users table is preserved');
select is_empty(
  $$select tablename from pg_tables where schemaname = 'public' and tablename in (
    'audit_logs','club_join_requests','clubs','match_results','news','player_profiles',
    'points_ledger','standings','tournament_matches','tournament_players',
    'tournament_rounds','tournament_snapshots','tournaments'
  )$$,
  'legacy public tables are absent'
);
select * from finish();
rollback;
```

- [ ] **Step 4: Verify locally and commit**

Run:

```powershell
pnpm exec supabase start
pnpm db:reset
pnpm db:test
git add supabase
git commit -m "chore: define explicit legacy schema reset"
```

Expected: local reset succeeds and all 3 pgTAP assertions PASS.

### Task 3: Create the normalized commerce schema and safe availability model

**Files:**

- Create via CLI: migration named `create_commerce_schema`
- Create: `supabase/tests/002_schema.test.sql`

**Interfaces:**

- Produces: all relational tables from the approved specification, generated product status, `site_settings.accept_orders`, and launch checks.

- [ ] **Step 1: Write failing schema assertions**

```sql
begin;
select plan(12);
select has_table('public', 'categories');
select has_table('public', 'products');
select has_table('public', 'product_images');
select has_table('public', 'customer_profiles');
select has_table('public', 'staff_profiles');
select has_table('public', 'orders');
select has_table('public', 'order_items');
select has_table('public', 'site_settings');
select has_table('public', 'order_enablement_checks');
select col_default_is('public', 'site_settings', 'accept_orders', 'false');
select col_not_null('public', 'products', 'stock_quantity');
select col_not_null('public', 'products', 'stock_status');
select * from finish();
rollback;
```

- [ ] **Step 2: Verify RED**

Run: `pnpm db:test`

Expected: FAIL because commerce tables do not exist.

- [ ] **Step 3: Create the migration through the CLI**

Run: `pnpm exec supabase migration new create_commerce_schema`

The migration must create the complete table set from the specification. Use this exact availability core:

```sql
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.site_settings (
  singleton boolean primary key default true check (singleton),
  accept_orders boolean not null default false,
  max_quantity_per_line integer not null default 10 check (max_quantity_per_line between 1 and 100),
  currency text not null default 'EUR' check (currency = 'EUR'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.site_settings (singleton, accept_orders) values (true, false);

create table public.categories (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  tagline text not null,
  description text not null,
  active boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id bigint generated always as identity primary key,
  category_id bigint not null references public.categories(id),
  slug text not null unique,
  sku text not null unique,
  name text not null,
  tagline text not null,
  description text not null,
  price_cents integer not null check (price_cents >= 0),
  compare_at_price_cents integer check (compare_at_price_cents > price_cents),
  currency text not null default 'EUR' check (currency = 'EUR'),
  publication_status text not null default 'draft' check (publication_status in ('draft','published','archived')),
  active boolean not null default false,
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  availability_override text check (availability_override in ('preorder','incoming')),
  stock_status text generated always as (
    case
      when availability_override = 'preorder' then 'pre-ordine'
      when availability_override = 'incoming' then 'in-arrivo'
      when stock_quantity > 0 then 'disponibile'
      else 'esaurito'
    end
  ) stored,
  blade_type text check (blade_type in ('attacco','difesa','stamina','bilanciato')),
  rating numeric(2,1) not null default 0 check (rating between 0 and 5),
  review_count integer not null default 0 check (review_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Create the remaining normalized tables with this contract:

```sql
create table public.product_images (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.products(id) on delete cascade,
  src text not null,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  alt text not null,
  sort_order integer not null default 0,
  published boolean not null default false,
  unique (product_id, sort_order)
);

create table public.product_specs (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.products(id) on delete cascade,
  label text not null,
  value text not null,
  sort_order integer not null default 0,
  unique (product_id, sort_order)
);

create table public.product_features (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.products(id) on delete cascade,
  title text not null,
  description text not null,
  sort_order integer not null default 0,
  unique (product_id, sort_order)
);

create table public.product_box_contents (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.products(id) on delete cascade,
  content text not null,
  sort_order integer not null default 0,
  unique (product_id, sort_order)
);

create table public.product_tags (
  product_id bigint not null references public.products(id) on delete cascade,
  tag text not null check (tag in ('novita','offerta','limited','esclusiva')),
  primary key (product_id, tag)
);

create table public.product_relations (
  product_id bigint not null references public.products(id) on delete cascade,
  related_product_id bigint not null references public.products(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (product_id, related_product_id),
  unique (product_id, sort_order),
  check (product_id <> related_product_id)
);

create table public.bundles (
  id bigint generated always as identity primary key,
  slug text not null unique,
  eyebrow text not null,
  title_line_one text not null,
  title_line_two text not null,
  description text not null,
  price_cents integer not null check (price_cents >= 0),
  compare_at_price_cents integer not null check (compare_at_price_cents > price_cents),
  hero_product_id bigint not null references public.products(id),
  publication_status text not null default 'draft' check (publication_status in ('draft','published','archived')),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bundle_items (
  bundle_id bigint not null references public.bundles(id) on delete cascade,
  product_id bigint not null references public.products(id),
  quantity integer not null default 1 check (quantity > 0),
  sort_order integer not null default 0,
  primary key (bundle_id, product_id),
  unique (bundle_id, sort_order)
);

create table public.shipping_methods (
  code text primary key,
  label text not null,
  hint text not null,
  price_cents integer not null check (price_cents >= 0),
  free_shipping_threshold_cents integer check (free_shipping_threshold_cents >= 0),
  active boolean not null default false,
  sort_order integer not null default 0
);

create table public.coupons (
  id bigint generated always as identity primary key,
  code text not null unique check (code = upper(code)),
  discount_kind text not null check (discount_kind in ('fixed','percentage')),
  discount_value integer not null check (discount_value > 0),
  minimum_subtotal_cents integer check (minimum_subtotal_cents >= 0),
  maximum_redemptions integer check (maximum_redemptions > 0),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount_kind <> 'percentage' or discount_value between 1 and 10000),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (maximum_redemptions is null or redemption_count <= maximum_redemptions)
);

create table public.customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customer_addresses (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  first_name text not null,
  last_name text not null,
  address text not null,
  city text not null,
  postal_code text not null check (postal_code ~ '^[0-9]{5}$'),
  province text not null check (province ~ '^[A-Z]{2}$'),
  country_code text not null default 'IT' check (country_code = 'IT'),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','editor')),
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id bigint generated always as identity primary key,
  order_number text not null unique,
  idempotency_key uuid not null unique,
  customer_id uuid references auth.users(id) on delete set null,
  customer_email text not null,
  customer_phone text not null,
  status text not null default 'pending' check (status in ('pending','confirmed','processing','shipped','completed','cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','pending','paid','failed','refunded')),
  payment_method text not null default 'unconfigured' check (payment_method = 'unconfigured'),
  shipping_method_code text not null references public.shipping_methods(code),
  shipping_method_name text not null,
  subtotal_cents integer not null check (subtotal_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  shipping_cents integer not null check (shipping_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  currency text not null default 'EUR' check (currency = 'EUR'),
  coupon_id bigint references public.coupons(id) on delete set null,
  coupon_code_snapshot text,
  shipping_address_snapshot jsonb not null check (jsonb_typeof(shipping_address_snapshot) = 'object'),
  billing_address_snapshot jsonb not null check (jsonb_typeof(billing_address_snapshot) = 'object'),
  customer_notes text check (char_length(customer_notes) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount_cents <= subtotal_cents),
  check (total_cents = subtotal_cents - discount_cents + shipping_cents)
);

create table public.order_items (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders(id) on delete cascade,
  product_id bigint references public.products(id) on delete set null,
  sku_snapshot text not null,
  product_name_snapshot text not null,
  product_image_snapshot text,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity integer not null check (quantity > 0),
  line_subtotal_cents integer not null check (line_subtotal_cents >= 0),
  line_discount_cents integer not null default 0 check (line_discount_cents >= 0),
  line_total_cents integer not null check (line_total_cents >= 0),
  check (line_subtotal_cents = unit_price_cents * quantity),
  check (line_discount_cents <= line_subtotal_cents),
  check (line_total_cents = line_subtotal_cents - line_discount_cents)
);

create table public.coupon_redemptions (
  coupon_id bigint not null references public.coupons(id),
  order_id bigint not null unique references public.orders(id) on delete cascade,
  customer_id uuid references auth.users(id) on delete set null,
  customer_email_snapshot text not null,
  redeemed_at timestamptz not null default now(),
  primary key (coupon_id, order_id)
);

create table public.inventory_movements (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.products(id),
  quantity_delta integer not null check (quantity_delta <> 0),
  reason text not null check (reason in ('order_created','order_cancelled','manual_adjustment','initial_load')),
  order_id bigint references public.orders(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create table public.order_enablement_checks (
  check_key text primary key check (check_key in (
    'owners_bootstrapped','environment_configured','inventory_reviewed','availability_consistent',
    'preorders_allocated','shipping_reviewed','coupons_reviewed','rls_verified',
    'concurrency_verified','advisors_clean','smoke_orders_verified','cancellation_restocks','recovery_confirmed'
  )),
  passed boolean not null default false,
  evidence text,
  verified_by uuid references auth.users(id),
  verified_at timestamptz
);
```

Every FK column receives an index. Add these query indexes:

```sql
create index products_public_idx on public.products (category_id, id)
where publication_status = 'published' and active;
create index product_images_public_idx on public.product_images (product_id, sort_order)
where published;
create index orders_customer_created_idx on public.orders (customer_id, created_at desc);
create index orders_pending_idx on public.orders (created_at) where status = 'pending';
create index coupons_active_code_idx on public.coupons (code) where active;
```

- [ ] **Step 4: Add availability behavior tests**

Add pgTAP assertions that insert four products and prove:

```sql
select results_eq(
  $$select stock_status from public.products where sku = 'ZERO'$$,
  array['esaurito'::text],
  'zero stock is sold out by default'
);
select results_eq(
  $$select stock_status from public.products where sku = 'POSITIVE'$$,
  array['disponibile'::text],
  'positive stock is available by default'
);
select results_eq(
  $$select stock_status from public.products where sku = 'PREORDER'$$,
  array['pre-ordine'::text],
  'preorder requires explicit override'
);
select results_eq(
  $$select stock_status from public.products where sku = 'INCOMING'$$,
  array['in-arrivo'::text],
  'incoming requires explicit override'
);
```

- [ ] **Step 5: Verify GREEN and commit**

Run:

```powershell
pnpm db:reset
pnpm db:test
git add supabase
git commit -m "feat: add relational commerce schema"
```

Expected: schema and availability tests PASS.

### Task 4: Implement RLS, grants, staff helpers, and profile provisioning

**Files:**

- Create via CLI: migration named `secure_commerce_schema`
- Create: `supabase/tests/003_rls.test.sql`

**Interfaces:**

- Produces: public catalog policies, own-customer policies, owner/admin order access, editor exclusion, and new-customer profile provisioning.

- [ ] **Step 1: Write failing RLS tests for the authorization matrix**

Create deterministic UUID fixtures for Customer A, Customer B, Editor, Admin, and Owner. Tests must set request claims and role, then prove:

```sql
select results_eq(
  $$select order_number from public.orders order by order_number$$,
  array['GD-A'::text],
  'customer sees only own order'
);
select is_empty(
  $$select order_number from public.orders where order_number = 'GD-B'$$,
  'customer cannot enumerate another order'
);
select is_empty(
  $$select order_number from public.orders$$,
  'editor has no all-order access'
);
select results_eq(
  $$select order_number from public.orders order by order_number$$,
  array['GD-A'::text, 'GD-B'::text],
  'admin reads every order'
);
```

- [ ] **Step 2: Verify RED**

Run: `pnpm db:test`

Expected: FAIL because policies do not exist.

- [ ] **Step 3: Create the security migration through the CLI**

Run: `pnpm exec supabase migration new secure_commerce_schema`

The migration must:

1. enable RLS on every `public` table;
2. revoke all default table and sequence privileges from `PUBLIC`, `anon`, and `authenticated`;
3. grant only the table operations required by policies;
4. create `private.has_staff_role(text[])` with `security definer`, empty search path, `(select auth.uid())` validation, and `EXECUTE` granted only to `authenticated` for policy evaluation;
5. create a stable catalog visibility helper that returns only a publication boolean and grant `EXECUTE` only to `anon` and `authenticated` for policy evaluation;
6. add catalog policies for `anon` and `authenticated`;
7. add own-row policies for customers;
8. add owner/admin policies for orders and customer PII;
9. omit every all-order/customer-PII policy for editors;
10. add owner-only policies for staff and order enablement.

Keep the `private` schema outside the Data API exposed-schema list and do not grant general schema/table access. The helpers are referenced by policy OID and are not public RPC endpoints; their narrow execute grants exist only so RLS evaluation succeeds.

Use this ownership pattern everywhere:

```sql
create policy orders_customer_select
on public.orders
for select
to authenticated
using ((select auth.uid()) = customer_id);

create policy customer_profiles_update_own
on public.customer_profiles
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
```

Create the new-user trigger without assigning staff:

```sql
create or replace function private.handle_new_customer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.customer_profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$function$;

revoke all on function private.handle_new_customer() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_customer();

insert into public.customer_profiles (user_id)
select id from auth.users
on conflict (user_id) do nothing;
```

- [ ] **Step 4: Verify every exposed table has RLS**

Add this pgTAP-backed query assertion:

```sql
select is_empty(
  $$select relname
    from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
   where pg_namespace.nspname = 'public'
     and pg_class.relkind = 'r'
     and not pg_class.relrowsecurity$$,
  'every public table has RLS enabled'
);
```

- [ ] **Step 5: Verify GREEN and commit**

Run:

```powershell
pnpm db:reset
pnpm db:test
git add supabase
git commit -m "feat: enforce commerce row security"
```

Expected: all authorization matrix tests PASS.

## Checkpoint 1 — Local schema and security review

Stop and review before application integration.

Required evidence:

- `git status --short` is empty.
- `pnpm db:reset` succeeds.
- `pnpm db:test` passes.
- The legacy drop list still matches the read-only remote inventory.
- `site_settings.accept_orders` is false.
- Zero stock resolves to sold out without override.
- Editors cannot read all orders or customer PII.
- No remote mutation has occurred.

---

## Phase 2 — Seed, types, and request-scoped Supabase access

### Task 5: Generate a deterministic zero-stock catalog seed

**Files:**

- Modify: `src/lib/commerce/types.ts`
- Modify: `src/data/catalog.ts`
- Create: `scripts/generate-supabase-seed.ts`
- Create: `supabase/seed.sql`
- Create: `tests/unit/generate-supabase-seed.test.ts`

**Interfaces:**

- Adds `Product.sku` and `Product.purchasable`.
- Produces deterministic SQL with `sku = slug`, `stock_quantity = 0`, explicit legacy availability overrides, and `accept_orders = false`.

- [ ] **Step 1: Write the failing seed tests**

```ts
import { describe, expect, it } from "vitest";
import { buildSeedSql } from "../../scripts/generate-supabase-seed";
import { PRODUCTS } from "@/data/catalog";

describe("Supabase seed", () => {
  const sql = buildSeedSql();

  it("seeds every product with zero numeric stock", () => {
    expect((sql.match(/stock_quantity/g) ?? []).length).toBeGreaterThanOrEqual(PRODUCTS.length);
    expect(sql).not.toMatch(/stock_quantity[^;]*,[^;]*[1-9][0-9]*/);
  });

  it("keeps order intake disabled", () => {
    expect(sql).toContain("accept_orders = false");
  });

  it("uses each slug as the stable initial SKU", () => {
    for (const product of PRODUCTS) expect(sql).toContain(`'${product.slug}'`);
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- tests/unit/generate-supabase-seed.test.ts`

Expected: FAIL because the generator does not exist.

- [ ] **Step 3: Extend the domain model**

```ts
export type Product = {
  readonly sku: string;
  readonly slug: ProductSlug;
  readonly purchasable: boolean;
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  readonly price: Money;
  readonly compareAtPrice?: Money;
  readonly category: CategorySlug;
  readonly bladeType?: BladeType;
  readonly stock: StockStatus;
  readonly tags: readonly PromoTag[];
  readonly rating: number;
  readonly reviewCount: number;
  readonly images: readonly ProductImage[];
  readonly specs: readonly ProductSpec[];
  readonly features: readonly ProductFeature[];
  readonly boxContents: readonly string[];
  readonly relatedSlugs: readonly ProductSlug[];
};
```

For the mock catalog, set `sku` equal to `slug`; preserve the designed mock behavior with `purchasable = true` only for `disponibile` and `pre-ordine` fixtures.

- [ ] **Step 4: Implement deterministic escaped SQL generation**

The generator must use dedicated `sqlText`, `sqlInteger`, and `sqlNullable` helpers, stable sort order, multi-row inserts, and an explicit transaction. It must refuse duplicate slugs/SKUs before emitting SQL. It must never infer positive stock.

- [ ] **Step 5: Generate, reset, test, and commit**

Run:

```powershell
pnpm seed:supabase
pnpm db:reset
pnpm db:test
pnpm test -- tests/unit/generate-supabase-seed.test.ts
git add src/lib/commerce/types.ts src/data/catalog.ts scripts/generate-supabase-seed.ts supabase/seed.sql tests/unit/generate-supabase-seed.test.ts
git commit -m "feat: seed zero-stock commerce catalog"
```

Expected: seed is deterministic, all products have zero stock, and order intake remains false.

### Task 6: Add typed request-scoped Supabase client factories

**Files:**

- Create: `src/lib/supabase/database.types.ts`
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/admin.ts`
- Create: `src/lib/supabase/proxy.ts`
- Create: `src/proxy.ts`
- Create: `tests/unit/supabase-client-factories.test.ts`

**Interfaces:**

- Produces: `createBrowserSupabaseClient()`, async `createServerSupabaseClient()`, `createAdminSupabaseClient()`, and `updateSupabaseSession(request)`.

- [ ] **Step 1: Generate database types**

Run: `pnpm db:types`

Expected: `src/lib/supabase/database.types.ts` contains every public table and RPC.

- [ ] **Step 2: Write failing factory source-contract tests**

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Supabase client factories", () => {
  it("marks the privileged client server-only", () => {
    const source = readFileSync("src/lib/supabase/admin.ts", "utf8");
    expect(source).toContain('import "server-only"');
    expect(source).toContain("SUPABASE_SECRET_KEY");
  });

  it("does not export a shared server client instance", () => {
    const source = readFileSync("src/lib/supabase/server.ts", "utf8");
    expect(source).toContain("export async function createServerSupabaseClient");
    expect(source).not.toMatch(/export const supabase\s*=/);
  });

  it("protects the proxy with getClaims rather than getSession", () => {
    const source = readFileSync("src/lib/supabase/proxy.ts", "utf8");
    expect(source).toContain("auth.getClaims()");
    expect(source).not.toContain("auth.getSession()");
  });
});
```

- [ ] **Step 3: Verify RED**

Run: `pnpm test -- tests/unit/supabase-client-factories.test.ts`

Expected: FAIL because factories do not exist.

- [ ] **Step 4: Implement the three factories**

Browser:

```ts
"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { readPublicSupabaseEnv } from "./env";

export function createBrowserSupabaseClient() {
  const { url, publishableKey } = readPublicSupabaseEnv();
  return createBrowserClient<Database>(url, publishableKey);
}
```

Privileged:

```ts
import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { readSecretSupabaseEnv } from "./env";

export function createAdminSupabaseClient() {
  const { url, secretKey } = readSecretSupabaseEnv();
  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
```

Server and proxy must follow the current Supabase Next.js cookie examples, create a fresh client on every call/request, apply returned cache headers, and call `getClaims()` immediately after proxy client creation.

- [ ] **Step 5: Verify GREEN and commit**

Run:

```powershell
pnpm test -- tests/unit/supabase-client-factories.test.ts
pnpm typecheck
git add src/lib/supabase src/proxy.ts tests/unit/supabase-client-factories.test.ts
git commit -m "feat: add request-scoped Supabase clients"
```

### Task 7: Implement the Supabase CommerceProvider and server quote endpoint

**Files:**

- Create: `src/lib/commerce/supabase-provider.ts`
- Create: `src/lib/commerce/supabase-mappers.ts`
- Modify: `src/lib/commerce/provider.ts`
- Modify: all server pages currently importing `commerce`
- Create: `src/app/api/cart/quote/route.ts`
- Modify: `src/lib/use-cart-details.ts`
- Modify: `src/lib/store/cart.ts`
- Modify: `src/components/product/add-to-cart-button.tsx`
- Modify: `src/components/product/buy-panel.tsx`
- Modify: `src/components/product/sticky-buy-bar.tsx`
- Create: `tests/unit/supabase-mappers.test.ts`
- Create: `tests/unit/cart-availability.test.ts`

**Interfaces:**

- Produces: exported `RawProductRow`, `mapProductRow(row)`, `createSupabaseProvider(client): CommerceProvider`, async `getCommerceProvider()`, and `POST /api/cart/quote`.
- Changes cart lines to `{ sku: string; quantity: number }` and bumps persisted cart version.

- [ ] **Step 1: Write failing mapper and zero-stock CTA tests**

```ts
const fixture = (overrides: Partial<RawProductRow> = {}): RawProductRow => ({
  id: 1,
  sku: "fixture-product",
  slug: "wizard-arrow-4-80b",
  name: "Fixture",
  tagline: "Fixture",
  description: "Fixture",
  price_cents: 2499,
  compare_at_price_cents: null,
  currency: "EUR",
  publication_status: "published",
  active: true,
  stock_quantity: 1,
  availability_override: null,
  stock_status: "disponibile",
  blade_type: "attacco",
  rating: 4.5,
  review_count: 1,
  category: { slug: "beyblade-x", name: "Beyblade X", tagline: "Fixture", description: "Fixture", active: true },
  images: [{ src: "/products/wizard-arrow-4-80b-1.png", width: 213, height: 195, alt: "Fixture", sort_order: 0, published: true }],
  specs: [],
  features: [],
  box_contents: [],
  tags: [],
  relations: [],
  ...overrides,
});

it("maps zero stock to sold out and not purchasable", () => {
  const product = mapProductRow(fixture({ stock_quantity: 0, availability_override: null, stock_status: "esaurito" }));
  expect(product.stock).toBe("esaurito");
  expect(product.purchasable).toBe(false);
});

it("requires positive allocation for an explicit preorder", () => {
  const empty = mapProductRow(fixture({ stock_quantity: 0, availability_override: "preorder", stock_status: "pre-ordine" }));
  const allocated = mapProductRow(fixture({ stock_quantity: 5, availability_override: "preorder", stock_status: "pre-ordine" }));
  expect(empty.purchasable).toBe(false);
  expect(allocated.purchasable).toBe(true);
});

it("never makes incoming stock purchasable", () => {
  const product = mapProductRow(fixture({ stock_quantity: 5, availability_override: "incoming", stock_status: "in-arrivo" }));
  expect(product.purchasable).toBe(false);
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- tests/unit/supabase-mappers.test.ts tests/unit/cart-availability.test.ts`

- [ ] **Step 3: Implement request-scoped provider selection**

```ts
export type ProviderName = "mock" | "supabase";

export async function getCommerceProvider(): Promise<CommerceProvider> {
  const requested = (process.env["COMMERCE_PROVIDER"] ?? "mock") as ProviderName;
  if (requested === "mock") return createMockProvider();
  if (requested === "supabase") return createSupabaseProvider(await createServerSupabaseClient());
  throw new Error(`Provider commerce non supportato: ${requested}`);
}
```

Update every Server Component to obtain one provider per request and reuse it for parallel calls. No component imports Supabase.

- [ ] **Step 4: Implement the server quote boundary**

The route validates `{ lines: [{ sku, quantity }] }`, obtains the request-scoped provider, returns current product display data and non-authoritative totals, drops missing/unpublished lines, and marks non-purchasable lines. It never accepts prices from the browser.

The cart hook fetches this route after hydration. The UI passes `product.purchasable` to every add-to-cart CTA; stock label alone no longer determines purchasability.

- [ ] **Step 5: Verify GREEN and commit**

Run:

```powershell
pnpm test
pnpm typecheck
pnpm build
git add src tests
git commit -m "feat: connect catalog through Supabase provider"
```

Expected: provider behavior matches the mock contract and a zero-stock product cannot be added automatically.

## Checkpoint 2 — Catalog integration review

Required evidence:

- All unit tests PASS with `COMMERCE_PROVIDER=mock` and no Supabase environment.
- Supabase integration tests PASS against the local stack.
- No UI component imports `@supabase/supabase-js`, `@supabase/ssr`, or a Supabase client factory.
- Public catalog probes return only active/published rows with published images.
- Zero-stock, incoming, and zero-allocation preorder CTAs remain disabled.
- Orders remain disabled.

---

## Phase 3 — Authentication, profiles, owners, and admin safety shell

### Task 8: Implement email/password authentication with trusted server guards

**Files:**

- Create: `src/lib/auth/guards.ts`
- Create: `src/lib/auth/redirect.ts`
- Create: `src/app/auth/actions.ts`
- Create: `src/app/auth/confirm/route.ts`
- Create: `src/app/account/login/page.tsx`
- Create: `src/app/account/registrazione/page.tsx`
- Create: `src/app/account/password-dimenticata/page.tsx`
- Create: `src/app/account/password-reset/page.tsx`
- Create: `tests/unit/auth-redirect.test.ts`
- Create: `tests/e2e/auth.spec.ts`

**Interfaces:**

- Produces: `getOptionalClaims()`, `requireClaims()`, safe auth actions, and verified redirects.

- [ ] **Step 1: Write failing safe-redirect tests**

```ts
expect(safeRedirectPath("/account", "/")).toBe("/account");
expect(safeRedirectPath("https://evil.example", "/")).toBe("/");
expect(safeRedirectPath("//evil.example", "/")).toBe("/");
```

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- tests/unit/auth-redirect.test.ts`

- [ ] **Step 3: Implement guards and actions**

Every protected action starts with a fresh request-scoped client and either:

```ts
const { data, error } = await supabase.auth.getClaims();
if (error || !data?.claims?.sub) redirect("/account/login");
```

or:

```ts
const { data, error } = await supabase.auth.getUser();
if (error || !data.user) redirect("/account/login");
```

No server file calls `getSession()` for authorization. Registration accepts only email/password/customer fields; it cannot accept staff role data. Confirmation verifies the token hash, password recovery avoids account enumeration, and redirects are local-only.

- [ ] **Step 4: Add Playwright auth flows**

Cover registration validation, invalid login, confirmed login fixture, logout, password recovery response, and protected `/account` redirect.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
pnpm test
pnpm typecheck
pnpm test:e2e -- tests/e2e/auth.spec.ts
git add src tests
git commit -m "feat: add secure email password authentication"
```

### Task 9: Build customer account and isolated order history

**Files:**

- Modify: `src/app/account/page.tsx`
- Create: `src/app/account/actions.ts`
- Create: `src/app/account/ordini/page.tsx`
- Create: `src/app/account/ordini/[orderNumber]/page.tsx`
- Create: `src/lib/account/customer-service.ts`
- Create: `tests/e2e/account-orders.spec.ts`

**Interfaces:**

- Produces own-profile update and own-order read services, always using the request-scoped client and RLS.

- [ ] **Step 1: Write failing cross-customer E2E assertions**

Customer A can list and open Order A. Requesting Order B returns 404 without revealing whether it exists. Customer B sees only Order B.

- [ ] **Step 2: Verify RED**

Run: `pnpm test:e2e -- tests/e2e/account-orders.spec.ts`

- [ ] **Step 3: Implement account services and pages**

Use `requireClaims()`. Query orders without service role, omit PII not required by the page, and update `customer_profiles` with both `USING` and `WITH CHECK` RLS protection.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
pnpm test:e2e -- tests/e2e/account-orders.spec.ts
pnpm typecheck
git add src tests/e2e/account-orders.spec.ts
git commit -m "feat: add protected customer order history"
```

### Task 10: Add one-shot two-owner bootstrap and admin disabled-orders banner

**Files:**

- Create via CLI: migration named `bootstrap_initial_owners`
- Create: `scripts/bootstrap-owners.mjs`
- Create: `docs/operations/bootstrap-initial-owners.md`
- Create: `src/lib/admin/permissions.ts`
- Create: `src/lib/admin/site-settings.ts`
- Create: `src/app/admin/layout.tsx`
- Create: `src/app/admin/page.tsx`
- Create: `src/app/admin/actions.ts`
- Create: `src/components/admin/orders-disabled-banner.tsx`
- Create: `tests/unit/bootstrap-owners.test.ts`
- Create: `tests/e2e/admin-safety.spec.ts`

**Interfaces:**

- Produces service-role-only `bootstrap_initial_owners(text[])`, one-shot CLI procedure, staff guards, checklist actions, and persistent admin banner.

- [ ] **Step 1: Write failing bootstrap and banner tests**

Tests must prove that the bootstrap rejects one email, duplicate emails, unconfirmed users, a third email, and every second invocation. The E2E test must prove `/admin` redirects non-staff and shows an undismissable “Ordini disabilitati” banner for owner/admin/editor while `accept_orders=false`.

- [ ] **Step 2: Create the migration via CLI and implement the RPC**

Run: `pnpm exec supabase migration new bootstrap_initial_owners`

The function must be `security definer`, `search_path=''`, executable only by `service_role`, accept exactly two distinct normalized emails, require both `email_confirmed_at` values, require `not exists (select 1 from public.staff_profiles)`, and insert both owner rows in one statement. Any failure rolls back both inserts.

- [ ] **Step 3: Implement the one-shot script**

The script reads `GEARDROP_OWNER_EMAILS`, requires exactly two comma-separated distinct emails, creates a fresh privileged client, calls the RPC once, verifies exactly two active owner rows, prints only user IDs and normalized emails, and never prints a secret.

The operations document contains this exact sequence:

```powershell
$env:GEARDROP_OWNER_EMAILS='owner1@example.com,owner2@example.com'
pnpm bootstrap:owners
Remove-Item Env:GEARDROP_OWNER_EMAILS
```

It also states that both users must register and confirm first, the command is permanently one-shot, and failure requires investigation rather than bypassing the guard.

- [ ] **Step 4: Implement admin guards and banner**

`/admin/layout.tsx` uses `getClaims()` and a request-scoped staff query. It reads `site_settings.accept_orders`; while false, it always renders `OrdersDisabledBanner` above page content. The banner has `role="alert"`, no close button, and copy that states checkout and order intake are disabled until the launch checklist passes.

Only owners can update `order_enablement_checks` or call the enable action. Admins and editors can read checklist status. The enable action rechecks every required row and machine-verifiable stock invariants before updating `accept_orders`.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
pnpm db:reset
pnpm db:test
pnpm test -- tests/unit/bootstrap-owners.test.ts
pnpm test:e2e -- tests/e2e/admin-safety.spec.ts
git add supabase scripts docs/operations src tests package.json
git commit -m "feat: add owner bootstrap and admin safety gate"
```

## Checkpoint 3 — Authentication and staff safety review

Required evidence:

- Registration creates customers only.
- Server authorization source scan contains no `auth.getSession()`.
- Customer A cannot read Customer B data.
- Editor cannot read all orders or customer PII.
- Owner/admin can read all orders.
- Bootstrap creates exactly two owners once and cannot run again.
- Admin banner is visible and undismissable while orders are disabled.
- `site_settings.accept_orders` remains false.

---

## Phase 4 — Atomic checkout and order lifecycle

### Task 11: Create the transactional order RPC and database tests

**Files:**

- Create via CLI: migration named `create_order_rpc`
- Create: `supabase/tests/004_checkout.test.sql`
- Create: `tests/integration/checkout-concurrency.test.ts`
- Create: `vitest.integration.config.ts`

**Interfaces:**

- Produces: `public.create_order(p_lines jsonb, p_email text, p_phone text, p_shipping_address jsonb, p_billing_address jsonb, p_shipping_method text, p_coupon_code text, p_notes text, p_idempotency_key uuid)`.

- [ ] **Step 1: Write failing pgTAP behavior tests**

Cover disabled order intake, empty cart, duplicate SKU, zero/negative/fractional/excess quantity, missing SKU, draft product, inactive product, inactive category, unpublished image, sold out, incoming override, zero-allocation preorder, insufficient stock, invalid/expired/exhausted coupon, invalid shipping method, and tampered client totals being absent from the function signature.

The disabled-order assertion must snapshot counts before and after and prove no change to `orders`, `order_items`, `inventory_movements`, coupons, or product stock.

- [ ] **Step 2: Verify RED**

Run: `pnpm db:test`

- [ ] **Step 3: Create the migration via CLI**

Run: `pnpm exec supabase migration new create_order_rpc`

Implement one short `security definer` function with empty search path and explicit grants:

```sql
revoke all on function public.create_order(jsonb,text,text,jsonb,jsonb,text,text,text,uuid)
from public, anon;
grant execute on function public.create_order(jsonb,text,text,jsonb,jsonb,text,text,text,uuid)
to authenticated, service_role;
```

Inside the function, enforce this order:

1. lock/read the singleton `site_settings` row and fail `GD_ORDERS_DISABLED` when false;
2. validate JSON array shape and quantity bounds;
3. normalize lines into an in-memory relational set and reject duplicate SKUs;
4. resolve an idempotent prior order only when customer identity or normalized guest email matches;
5. lock product rows in ascending ID order with `FOR UPDATE`;
6. require published/active/category-active/published-image state;
7. require `stock_quantity >= requested quantity`;
8. reject `incoming`; allow `preorder` only with positive allocation;
9. lock and validate shipping/coupon rows;
10. compute all cents from database values;
11. insert order and immutable order-line snapshots set-wise;
12. decrement stock with a guarded update;
13. insert inventory movements and coupon redemption;
14. return order number and authoritative totals.

Raise stable `GD_*` messages and let every exception roll back the transaction.

- [ ] **Step 4: Write concurrency tests**

Using two independent local Supabase clients, submit the final unit concurrently and assert exactly one fulfillment succeeds. Repeat with a coupon having one remaining redemption. Retry the successful idempotency key and assert stock and coupon count do not change twice.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
pnpm db:reset
pnpm db:test
pnpm vitest run --config vitest.integration.config.ts
git add supabase tests/integration vitest.integration.config.ts
git commit -m "feat: create atomic order transaction"
```

### Task 12: Add server checkout boundary and domain error mapping

**Files:**

- Modify: `src/lib/checkout-schema.ts`
- Create: `src/lib/checkout/errors.ts`
- Create: `src/app/checkout/actions.ts`
- Create: `tests/unit/checkout-action-input.test.ts`
- Create: `tests/unit/checkout-errors.test.ts`

**Interfaces:**

- Produces: `placeOrder(input): Promise<PlaceOrderResult>` and safe Italian domain messages.

- [ ] **Step 1: Write failing input-contract tests**

```ts
it("accepts only SKU and quantity for line pricing", () => {
  const parsed = placeOrderSchema.parse({
    lines: [{ sku: "wizard-arrow-4-80b", quantity: 2 }],
    email: "cliente@example.com",
    phone: "+39 333 1234567",
    shippingAddress: validAddress,
    billingAddress: validAddress,
    shippingMethod: "standard",
    idempotencyKey: "018f0f7c-3b00-7000-8000-000000000001",
  });
  expect(parsed.lines[0]).toEqual({ sku: "wizard-arrow-4-80b", quantity: 2 });
  expect(parsed).not.toHaveProperty("total");
  expect(parsed.lines[0]).not.toHaveProperty("price");
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- tests/unit/checkout-action-input.test.ts tests/unit/checkout-errors.test.ts`

- [ ] **Step 3: Implement trusted client selection**

The action validates with Zod, calls `getClaims()`, and:

- uses the request-scoped client when `claims.sub` exists;
- uses a newly created privileged client only when no authenticated identity exists;
- never accepts or forwards a customer ID;
- invokes the same RPC;
- maps known `GD_*` codes to safe copy;
- revalidates catalog/account paths after success;
- returns only order number and authoritative cents.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
pnpm test -- tests/unit/checkout-action-input.test.ts tests/unit/checkout-errors.test.ts
pnpm typecheck
git add src/lib/checkout-schema.ts src/lib/checkout src/app/checkout/actions.ts tests/unit
git commit -m "feat: add trusted checkout server action"
```

### Task 13: Connect checkout UI without trusting browser totals

**Files:**

- Modify: `src/app/checkout/checkout-client.tsx`
- Modify: `src/app/checkout/page.tsx`
- Modify: `src/components/cart/cart-summary.tsx`
- Create: `tests/e2e/checkout-orders.spec.ts`

**Interfaces:**

- Consumes: `placeOrder` and cart quote.
- Produces: accurate disabled, pending-order, guest, authenticated, stock-failure, and idempotent retry UI states.

- [ ] **Step 1: Write failing E2E flows**

Cover:

- disabled checkout shows a clear non-purchasable state and never submits;
- guest order succeeds only after local fixture enables orders and stock;
- authenticated order appears in own history;
- stale/tampered displayed total is ignored;
- insufficient stock keeps cart and shows a safe error;
- double click produces one order;
- confirmation says the order was registered but does not claim an email was sent.

- [ ] **Step 2: Verify RED**

Run: `pnpm test:e2e -- tests/e2e/checkout-orders.spec.ts`

- [ ] **Step 3: Replace the placeholder order flow**

Remove `makeOrderReference`, the delay, and browser-created totals as authority. Generate one UUID idempotency key per checkout attempt, send only form/contact/address/shipping/coupon/notes plus SKU/quantity lines, display the returned order number and totals, and clear the cart only after success.

When `accept_orders=false`, the Server Component renders a disabled notice before the form. The browser cannot override it; the RPC remains the final guard.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
pnpm test:e2e -- tests/e2e/checkout-orders.spec.ts
pnpm test
pnpm typecheck
pnpm build
git add src tests/e2e/checkout-orders.spec.ts
git commit -m "feat: connect atomic guest and customer checkout"
```

### Task 14: Add owner/admin order management and atomic cancellation restock

**Files:**

- Create via CLI: migration named `cancel_order_rpc`
- Create: `supabase/tests/005_cancel_order.test.sql`
- Create: `src/app/admin/ordini/page.tsx`
- Create: `src/app/admin/ordini/[orderNumber]/page.tsx`
- Create: `src/app/admin/ordini/actions.ts`
- Create: `tests/e2e/admin-orders.spec.ts`

**Interfaces:**

- Produces: `public.cancel_order(p_order_number text)` and an owner/admin-only cancellation action that restores stock exactly once.

- [ ] **Step 1: Write failing database and E2E tests**

Database tests must prove owner/admin success, editor/customer/guest denial, rejection for shipped/completed orders, restoration of every line quantity, one positive `order_cancelled` inventory movement per line, and idempotent handling of an already-cancelled order.

E2E tests must prove owner/admin can list and inspect all orders, editor cannot open admin order routes, and cancellation updates the status and stock once.

- [ ] **Step 2: Verify RED**

Run:

```powershell
pnpm db:test
pnpm test:e2e -- tests/e2e/admin-orders.spec.ts
```

- [ ] **Step 3: Create the cancellation migration through the CLI**

Run: `pnpm exec supabase migration new cancel_order_rpc`

Implement `public.cancel_order(text)` as `security definer` with empty search path. It must require `(select private.has_staff_role(array['owner','admin']))`, lock the order row, return safely if already cancelled, accept only `pending`, `confirmed`, or `processing`, lock referenced products in ascending ID order, restore each order-line quantity set-wise, insert matching inventory movements, set status to `cancelled`, and write an audit event in one transaction.

Revoke from `PUBLIC`, `anon`, and ordinary customer execution paths; grant execute to `authenticated`, relying on the internal owner/admin check as the authorization decision.

- [ ] **Step 4: Implement the admin order pages and action**

Pages use `getClaims()` plus request-scoped RLS queries. The action accepts only an order number, calls the RPC through the request-scoped client, maps domain errors safely, and revalidates admin order paths. It never uses the privileged client.

- [ ] **Step 5: Verify GREEN and commit**

Run:

```powershell
pnpm db:reset
pnpm db:test
pnpm test:e2e -- tests/e2e/admin-orders.spec.ts
pnpm typecheck
git add supabase src/app/admin/ordini tests/e2e/admin-orders.spec.ts
git commit -m "feat: add atomic order cancellation"
```

## Checkpoint 4 — Full local release candidate and remote mutation gate

Stop. Do not touch the remote project until the user reviews this evidence and explicitly authorizes the destructive rollout.

Required evidence:

```powershell
git status --short
pnpm lint
pnpm typecheck
pnpm test
pnpm db:reset
pnpm db:test
pnpm vitest run --config vitest.integration.config.ts
pnpm build
pnpm test:e2e
```

Also provide:

- the exact CLI-generated migration filenames;
- a fresh read-only remote inventory diff;
- `supabase db push --linked --dry-run` output;
- generated TypeScript diff;
- RLS matrix results;
- concurrency results;
- screenshots of the admin disabled-orders banner;
- confirmation that `accept_orders=false` and all seeded stock is zero;
- security and performance advisor results for the local schema where available.

---

## Phase 5 — Controlled remote rollout, still disabled

### Task 15: Apply reviewed migrations to the connected project

**Files:**

- No new application files unless the dry-run reveals a documented migration correction.

**Interfaces:**

- Consumes: user approval at Checkpoint 4.
- Produces: remote schema matching tested migrations, with orders disabled.

- [ ] **Step 1: Confirm target and recovery readiness**

Confirm project ref `cvwigsymjlpulwgjkzix`, verify backup/PITR readiness, list migrations, re-run object inventory, and confirm the 13-table/6-function/2-trigger drop set has not drifted.

- [ ] **Step 2: Dry-run the linked push**

Run:

```powershell
pnpm exec supabase link --project-ref cvwigsymjlpulwgjkzix
pnpm exec supabase migration list --linked
pnpm exec supabase db push --linked --dry-run
```

If the dry-run includes any unreviewed migration, stop.

- [ ] **Step 3: Apply once**

Run: `pnpm exec supabase db push --linked`

Do not retry blindly. On failure, inspect the exact SQL error and migration state before any second attempt.

- [ ] **Step 4: Run remote verification**

Run linked pgTAP tests, generate remote types for comparison, query `site_settings`, verify every product stock is zero, and verify legacy tables are absent while Auth user count is unchanged.

Use Supabase advisors for both `security` and `performance`; resolve every high-severity issue introduced by these migrations before continuing.

- [ ] **Step 5: Commit only documented corrections**

If no corrections are needed, do not create an empty commit. If corrections are required, add a new CLI-generated forward migration; never edit an already-applied migration.

### Task 16: Bootstrap exactly two owners and verify the admin shell

**Files:**

- No code changes expected.

**Interfaces:**

- Consumes: two confirmed owner emails supplied at execution time.
- Produces: exactly two active owner rows and no other staff privilege.

- [ ] **Step 1: Verify both accounts are confirmed**

Use a privileged read-only operational check. Do not expose full Auth user lists in logs.

- [ ] **Step 2: Run the documented one-shot command**

Set `GEARDROP_OWNER_EMAILS` for the process, run `pnpm bootstrap:owners`, then remove the environment variable.

- [ ] **Step 3: Verify role isolation**

Confirm exactly two owners, zero automatic admin/editor rows, normal customer access for preserved Auth users, and rejection of a second bootstrap attempt.

- [ ] **Step 4: Verify the deployed admin banner**

Both owners must see the persistent “Ordini disabilitati” banner. A non-staff account must not enter `/admin`. `site_settings.accept_orders` must remain false.

### Task 17: Complete but do not activate the order-enablement checklist

**Files:**

- Create: `docs/operations/enable-orders-checklist.md`

**Interfaces:**

- Produces: auditable launch procedure. It does not enable orders.

- [ ] **Step 1: Record the mandatory checklist**

The document must mirror every approved check: owners, environment, reviewed stock, override consistency, preorder allocations, shipping, coupons, RLS isolation, concurrency, advisors, local/pre-production guest and authenticated smoke orders, cancellation/restock, and backup readiness.

- [ ] **Step 2: Populate machine-verifiable evidence while disabled**

Record test/advisor timestamps and verifier IDs in `order_enablement_checks`. Manual operational checks remain false until a human owner verifies them.

- [ ] **Step 3: Prove activation remains blocked**

Call the owner enable action before completing all rows and assert it refuses without changing `site_settings.accept_orders`.

- [ ] **Step 4: Final disabled-state verification**

Confirm:

```sql
select accept_orders from public.site_settings where singleton;
```

Expected: exactly one row with `false`.

Commit the checklist documentation:

```powershell
git add docs/operations/enable-orders-checklist.md
git commit -m "docs: add mandatory order enablement checklist"
```

## Final checkpoint — Ready for a separate activation decision

Implementation is complete only when code, migrations, tests, owner bootstrap, remote advisors, and the disabled admin banner are verified. Order intake remains disabled. Enabling orders is a separate owner-authorized operational decision after real stock is loaded and every checklist row is complete.

Final verification:

```powershell
git status --short
pnpm verify
pnpm db:test
pnpm vitest run --config vitest.integration.config.ts
pnpm test:e2e
git log --oneline origin/main..HEAD
```

Expected:

- clean worktree;
- all checks PASS;
- remote Auth user count preserved;
- exactly two bootstrapped owners;
- no staff privilege inherited by existing users;
- all initial stock remains zero until manually loaded;
- `site_settings.accept_orders = false`;
- admin banner visible;
- no remote order can be created while disabled.
