-- GEAR//DROP row level security, catalog-visibility helper and Data API grants.
--
-- See design §6 (public catalog visibility) and §7 (authorization matrix).
--
-- Strategy:
--   * A non-exposed `private` schema holds security-definer helpers so multi-table
--     catalog rules are expressed once without circular RLS. The helpers own no data
--     and expose only booleans / the caller's own staff role.
--   * The table owner (postgres) is exempt from RLS (no FORCE), so definer helpers see
--     every row and there is no policy recursion.
--   * Explicit grants expose intended tables to the Data API; RLS filters the rows.

create schema if not exists private;

-- Only catalog publication flags. Returns a public-visibility boolean, nothing else.
create or replace function private.is_public_product(p_product_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.products p
    join public.categories c on c.id = p.category_id
    where p.id = p_product_id
      and p.publication_status = 'published'
      and p.active
      and c.active
      and exists (
        select 1 from public.product_images pi
        where pi.product_id = p.id and pi.published
      )
  );
$$;

-- A bundle is public only when published + active and every referenced product is public.
create or replace function private.is_public_bundle(p_bundle_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.bundles b
    where b.id = p_bundle_id
      and b.publication_status = 'published'
      and b.active
      and exists (select 1 from public.bundle_items bi where bi.bundle_id = b.id)
      and not exists (
        select 1 from public.bundle_items bi
        where bi.bundle_id = b.id
          and not private.is_public_product(bi.product_id)
      )
  );
$$;

-- The caller's active staff role, or null. Never reads user_metadata.
create or replace function private.current_staff_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select sp.role
  from public.staff_profiles sp
  where sp.user_id = (select auth.uid())
    and sp.active
  limit 1;
$$;

grant usage on schema private to anon, authenticated, service_role;
grant execute on function private.is_public_product(bigint) to anon, authenticated, service_role;
grant execute on function private.is_public_bundle(bigint)  to anon, authenticated, service_role;
grant execute on function private.current_staff_role()      to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enable RLS on every exposed table
-- ---------------------------------------------------------------------------

alter table public.categories           enable row level security;
alter table public.products             enable row level security;
alter table public.product_images       enable row level security;
alter table public.product_specs        enable row level security;
alter table public.product_features     enable row level security;
alter table public.product_box_contents enable row level security;
alter table public.product_tags         enable row level security;
alter table public.product_relations    enable row level security;
alter table public.bundles              enable row level security;
alter table public.bundle_items         enable row level security;
alter table public.store_settings       enable row level security;
alter table public.shipping_methods     enable row level security;
alter table public.coupons              enable row level security;
alter table public.coupon_redemptions   enable row level security;
alter table public.customer_profiles    enable row level security;
alter table public.customer_addresses   enable row level security;
alter table public.staff_profiles       enable row level security;
alter table public.orders               enable row level security;
alter table public.order_items          enable row level security;
alter table public.inventory_movements  enable row level security;
alter table public.audit_events         enable row level security;

-- ---------------------------------------------------------------------------
-- Catalog: public read via helper, staff (editor+) write
-- ---------------------------------------------------------------------------

create policy categories_read on public.categories for select to anon, authenticated
  using (active or private.current_staff_role() is not null);
create policy categories_write on public.categories for all to authenticated
  using (private.current_staff_role() in ('editor', 'admin', 'owner'))
  with check (private.current_staff_role() in ('editor', 'admin', 'owner'));

create policy products_read on public.products for select to anon, authenticated
  using (private.is_public_product(id) or private.current_staff_role() is not null);
create policy products_write on public.products for all to authenticated
  using (private.current_staff_role() in ('editor', 'admin', 'owner'))
  with check (private.current_staff_role() in ('editor', 'admin', 'owner'));

create policy product_images_read on public.product_images for select to anon, authenticated
  using ((published and private.is_public_product(product_id)) or private.current_staff_role() is not null);
create policy product_images_write on public.product_images for all to authenticated
  using (private.current_staff_role() in ('editor', 'admin', 'owner'))
  with check (private.current_staff_role() in ('editor', 'admin', 'owner'));

create policy product_specs_read on public.product_specs for select to anon, authenticated
  using (private.is_public_product(product_id) or private.current_staff_role() is not null);
create policy product_specs_write on public.product_specs for all to authenticated
  using (private.current_staff_role() in ('editor', 'admin', 'owner'))
  with check (private.current_staff_role() in ('editor', 'admin', 'owner'));

create policy product_features_read on public.product_features for select to anon, authenticated
  using (private.is_public_product(product_id) or private.current_staff_role() is not null);
create policy product_features_write on public.product_features for all to authenticated
  using (private.current_staff_role() in ('editor', 'admin', 'owner'))
  with check (private.current_staff_role() in ('editor', 'admin', 'owner'));

create policy product_box_contents_read on public.product_box_contents for select to anon, authenticated
  using (private.is_public_product(product_id) or private.current_staff_role() is not null);
create policy product_box_contents_write on public.product_box_contents for all to authenticated
  using (private.current_staff_role() in ('editor', 'admin', 'owner'))
  with check (private.current_staff_role() in ('editor', 'admin', 'owner'));

create policy product_tags_read on public.product_tags for select to anon, authenticated
  using (private.is_public_product(product_id) or private.current_staff_role() is not null);
create policy product_tags_write on public.product_tags for all to authenticated
  using (private.current_staff_role() in ('editor', 'admin', 'owner'))
  with check (private.current_staff_role() in ('editor', 'admin', 'owner'));

create policy product_relations_read on public.product_relations for select to anon, authenticated
  using (private.is_public_product(product_id) or private.current_staff_role() is not null);
create policy product_relations_write on public.product_relations for all to authenticated
  using (private.current_staff_role() in ('editor', 'admin', 'owner'))
  with check (private.current_staff_role() in ('editor', 'admin', 'owner'));

create policy bundles_read on public.bundles for select to anon, authenticated
  using (private.is_public_bundle(id) or private.current_staff_role() is not null);
create policy bundles_write on public.bundles for all to authenticated
  using (private.current_staff_role() in ('editor', 'admin', 'owner'))
  with check (private.current_staff_role() in ('editor', 'admin', 'owner'));

create policy bundle_items_read on public.bundle_items for select to anon, authenticated
  using (private.is_public_bundle(bundle_id) or private.current_staff_role() is not null);
create policy bundle_items_write on public.bundle_items for all to authenticated
  using (private.current_staff_role() in ('editor', 'admin', 'owner'))
  with check (private.current_staff_role() in ('editor', 'admin', 'owner'));

-- ---------------------------------------------------------------------------
-- Store settings + shipping: public read of non-sensitive config, admin+ write
-- ---------------------------------------------------------------------------

create policy store_settings_read on public.store_settings for select to anon, authenticated
  using (true);
create policy store_settings_write on public.store_settings for update to authenticated
  using (private.current_staff_role() in ('admin', 'owner'))
  with check (private.current_staff_role() in ('admin', 'owner'));

create policy shipping_methods_read on public.shipping_methods for select to anon, authenticated
  using (active or private.current_staff_role() is not null);
create policy shipping_methods_write on public.shipping_methods for all to authenticated
  using (private.current_staff_role() in ('admin', 'owner'))
  with check (private.current_staff_role() in ('admin', 'owner'));

-- ---------------------------------------------------------------------------
-- Coupons: never public. Admin/owner manage; validation happens inside the RPC.
-- ---------------------------------------------------------------------------

create policy coupons_manage on public.coupons for all to authenticated
  using (private.current_staff_role() in ('admin', 'owner'))
  with check (private.current_staff_role() in ('admin', 'owner'));

create policy coupon_redemptions_read on public.coupon_redemptions for select to authenticated
  using (private.current_staff_role() in ('admin', 'owner'));

-- ---------------------------------------------------------------------------
-- Customer-owned data. Admin/owner may read other customers' PII (matrix §7).
-- ---------------------------------------------------------------------------

create policy customer_profiles_read on public.customer_profiles for select to authenticated
  using ((select auth.uid()) = user_id or private.current_staff_role() in ('admin', 'owner'));
create policy customer_profiles_insert on public.customer_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy customer_profiles_update on public.customer_profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy customer_addresses_read on public.customer_addresses for select to authenticated
  using ((select auth.uid()) = user_id or private.current_staff_role() in ('admin', 'owner'));
create policy customer_addresses_insert on public.customer_addresses for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy customer_addresses_update on public.customer_addresses for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy customer_addresses_delete on public.customer_addresses for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Staff profiles: own row visible; only owner manages roles.
-- ---------------------------------------------------------------------------

create policy staff_profiles_read on public.staff_profiles for select to authenticated
  using ((select auth.uid()) = user_id or private.current_staff_role() = 'owner');
create policy staff_profiles_manage on public.staff_profiles for all to authenticated
  using (private.current_staff_role() = 'owner')
  with check (private.current_staff_role() = 'owner');

-- ---------------------------------------------------------------------------
-- Orders + lines. Creation is through the SECURITY DEFINER RPC only (no insert policy).
-- Customers read their own; admin/owner read all and change lifecycle.
-- ---------------------------------------------------------------------------

create policy orders_read on public.orders for select to authenticated
  using (customer_id = (select auth.uid()) or private.current_staff_role() in ('admin', 'owner'));
create policy orders_update on public.orders for update to authenticated
  using (private.current_staff_role() in ('admin', 'owner'))
  with check (private.current_staff_role() in ('admin', 'owner'));

create policy order_items_read on public.order_items for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_id
      and (o.customer_id = (select auth.uid()) or private.current_staff_role() in ('admin', 'owner'))
  ));

create policy inventory_movements_read on public.inventory_movements for select to authenticated
  using (private.current_staff_role() in ('admin', 'owner'));

create policy audit_events_read on public.audit_events for select to authenticated
  using (private.current_staff_role() in ('admin', 'owner'));

-- ---------------------------------------------------------------------------
-- Data API grants. RLS filters rows; these expose the tables at all.
-- Identity columns need no separate sequence grant.
-- ---------------------------------------------------------------------------

grant select on
  public.categories, public.products, public.product_images, public.product_specs,
  public.product_features, public.product_box_contents, public.product_tags,
  public.product_relations, public.bundles, public.bundle_items,
  public.shipping_methods, public.store_settings
  to anon, authenticated;

grant insert, update, delete on
  public.categories, public.products, public.product_images, public.product_specs,
  public.product_features, public.product_box_contents, public.product_tags,
  public.product_relations, public.bundles, public.bundle_items, public.shipping_methods
  to authenticated;

grant update on public.store_settings to authenticated;

grant select, insert, update, delete on public.coupons to authenticated;
grant select on public.coupon_redemptions to authenticated;

grant select, insert, update, delete on public.customer_profiles  to authenticated;
grant select, insert, update, delete on public.customer_addresses to authenticated;
grant select, insert, update, delete on public.staff_profiles     to authenticated;

grant select, update on public.orders to authenticated;
grant select on public.order_items         to authenticated;
grant select on public.inventory_movements to authenticated;
grant select on public.audit_events        to authenticated;
