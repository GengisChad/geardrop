-- GEAR//DROP — reset of the objects THIS project owns (design §3).
--
-- DESTRUCTIVE. Read this header before running it.
--
-- Scope, deliberately narrow:
--   * it drops only the named objects this repository creates in `public` and the whole
--     non-exposed `private` schema;
--   * every statement is `if exists`, so re-running it is safe and a fresh project is a
--     no-op;
--   * it NEVER touches auth, storage, realtime, vault, extensions, supabase_migrations,
--     graphql, cron or net, and it never deletes `auth.users`.
--
-- Anything else the operator found with supabase/inventory.sql — tables from an earlier,
-- unrelated iteration of the project — is intentionally NOT dropped here. Removing those
-- is a manual, reviewed decision: append explicit `drop table public.<name> cascade;`
-- lines below the marker at the end of this file after checking their contents.
--
-- Dropping a table with `cascade` also removes its policies, triggers, indexes,
-- constraints and identity sequences, so those need no separate statements.

-- ---------------------------------------------------------------------------
-- Functions (dropped first: policies and triggers depend on them)
-- ---------------------------------------------------------------------------

drop function if exists public.create_order(jsonb)                                   cascade;
drop function if exists public.order_summary(bigint)                                 cascade;
drop function if exists public.admin_set_order_status(bigint, text, text, text)      cascade;
drop function if exists public.admin_adjust_stock(bigint, integer, text, text)       cascade;
drop function if exists public.owner_upsert_staff(text, text, boolean)               cascade;
drop function if exists public.owner_list_staff()                                    cascade;
drop function if exists public.set_updated_at()                                      cascade;

-- The private schema holds only this project's RLS helpers; it owns no data.
drop schema if exists private cascade;

-- ---------------------------------------------------------------------------
-- Tables, child-first so foreign keys never block a drop
-- ---------------------------------------------------------------------------

drop table if exists public.audit_events          cascade;
drop table if exists public.inventory_movements   cascade;
drop table if exists public.coupon_redemptions    cascade;
drop table if exists public.order_items           cascade;
drop table if exists public.orders                cascade;

drop table if exists public.staff_profiles        cascade;
drop table if exists public.customer_addresses    cascade;
drop table if exists public.customer_profiles     cascade;

drop table if exists public.coupons               cascade;
drop table if exists public.shipping_methods      cascade;
drop table if exists public.store_settings        cascade;

drop table if exists public.bundle_items          cascade;
drop table if exists public.bundles               cascade;
drop table if exists public.product_relations     cascade;
drop table if exists public.product_tags          cascade;
drop table if exists public.product_box_contents  cascade;
drop table if exists public.product_features      cascade;
drop table if exists public.product_specs         cascade;
drop table if exists public.product_images        cascade;
drop table if exists public.products              cascade;
drop table if exists public.categories            cascade;

-- ---------------------------------------------------------------------------
-- Manual drop list — append reviewed statements for pre-existing objects here.
-- ---------------------------------------------------------------------------
-- drop table if exists public.<obsolete_object> cascade;
