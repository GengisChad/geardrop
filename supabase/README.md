# Supabase — GEAR//DROP

Relational commerce backend: catalog, inventory, coupons, customers, staff, orders, audit.
The architecture is specified in
[`docs/superpowers/specs/2026-07-17-supabase-commerce-backend-design.md`](../docs/superpowers/specs/2026-07-17-supabase-commerce-backend-design.md);
this file is the operator runbook.

## Files

| File | What it does |
| --- | --- |
| `inventory.sql` | Read-only. Lists what currently exists in `public` so the reset can be reviewed before it runs. |
| `migrations/0000_reset_public.sql` | **Destructive.** Drops the objects this repository owns, plus the `private` schema. Never touches `auth`, `storage`, `realtime`, `vault`, `extensions`, `supabase_migrations`. |
| `migrations/0001_schema.sql` | Tables, constraints, `updated_at` triggers, indexes. |
| `migrations/0002_rls.sql` | `private` helper functions, RLS on every exposed table, Data API grants. |
| `migrations/0003_functions.sql` | Transactional `create_order` RPC and its `order_summary` helper. |
| `migrations/0004_seed.sql` | Catalog seed from `src/data/catalog.ts`. Production-safe: all stock `0`, checkout disabled. |
| `migrations/0005_admin.sql` | Staff RPCs: order lifecycle with stock movement, stock adjustment, staff-role management. |

## First run

1. **Inventory.** Run `inventory.sql` in the SQL editor and read the output. If the project
   contains objects from an earlier iteration that `0000_reset_public.sql` does not name,
   decide what to do with them and append explicit `drop` statements under the marker at
   the end of that file. Nothing is dropped implicitly.
2. **Apply migrations in order** — `0000` → `0005` — with `supabase db push`, or by pasting
   each file into the SQL editor in that order. `0000` is destructive; the rest are not.
3. **Set the environment variables** (see `.env.example`) locally and in Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY` — server only, never exposed to the browser
   - `COMMERCE_PROVIDER=supabase` (leave unset or `mock` to run fully offline)
4. **Create the first owner.** Open signup only ever creates customers. After the intended
   owner registers *and confirms their email*, run once:

   ```sql
   insert into public.staff_profiles (user_id, role, active)
   select id, 'owner', true from auth.users where lower(email) = lower('owner@example.com');
   ```

   Every later staff row can be managed from `/admin/staff` by that owner.
5. **Load real stock** and open the store when you actually intend to sell:

   ```sql
   update public.products set stock_quantity = 12 where sku = 'GD-BX-COBALT';
   update public.store_settings set checkout_enabled = true where id = 1;
   ```

   Until `checkout_enabled` is true, `create_order` fails with `GD_CHECKOUT_DISABLED` and
   the checkout UI says the store is closed.

## Regenerating types

`src/lib/supabase/database.types.ts` is committed and must match the migrations:

```bash
pnpm dlx supabase gen types typescript --project-id <project-ref> --schema public > src/lib/supabase/database.types.ts
```

## Security model in one paragraph

Every exposed table has RLS on, and grants are explicit because a new project does not
expose SQL-created tables to the Data API automatically. Anonymous reads see only active
categories, published + active products in an active category with at least one published
image, and the child rows of those products — enforced through
`private.is_public_product()` / `private.is_public_bundle()` so the rules never recurse.
Authorization for staff reads `public.staff_profiles` through
`private.current_staff_role()`; no decision ever reads `user_metadata`. Orders have no
insert policy at all: `public.create_order` is the only writer, `SECURITY DEFINER` with
`search_path = ''`, execute revoked from `public`/`anon` and granted to `authenticated`
(logged-in checkout) and `service_role` (guest checkout through the server-only client).

## Domain error codes

`create_order` and the staff RPCs raise stable codes the server actions translate:
`GD_INVALID_REQUEST`, `GD_INVALID_CONTACT`, `GD_INVALID_ADDRESS`, `GD_CHECKOUT_DISABLED`,
`GD_EMPTY_CART`, `GD_INVALID_QUANTITY`, `GD_DUPLICATE_SKU`, `GD_PRODUCT_UNAVAILABLE`,
`GD_INSUFFICIENT_STOCK`, `GD_INVALID_SHIPPING`, `GD_INVALID_COUPON`, `GD_FORBIDDEN`,
`GD_ORDER_NOT_FOUND`, `GD_INVALID_STATUS`, `GD_INVALID_ROLE`, `GD_USER_NOT_FOUND`,
`GD_CANNOT_DEMOTE_SELF`. No SQL, table name or other customer's data is ever surfaced.

## Not in this phase

Payments (orders are created `pending` / `unpaid`), payment webhooks, transactional email,
Supabase Storage for product images (paths point at committed files under `public/`), and
cross-device cart/wishlist sync.
