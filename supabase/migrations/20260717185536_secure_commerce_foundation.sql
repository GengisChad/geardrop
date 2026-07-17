create or replace function private.has_staff_role(allowed_roles public.staff_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_profiles
    where user_id = (select auth.uid())
      and active
      and role = any (allowed_roles)
  );
$$;

create or replace function private.is_public_product(candidate_product_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.products as product
    join public.categories as category on category.id = product.category_id
    where product.id = candidate_product_id
      and product.publication_status = 'published'::public.publication_status
      and product.active
      and category.active
      and exists (
        select 1
        from public.product_images as image
        where image.product_id = product.id
          and image.published
      )
  );
$$;

create or replace function private.is_public_bundle(candidate_bundle_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.bundles as bundle
    where bundle.id = candidate_bundle_id
      and bundle.active
      and private.is_public_product(bundle.hero_product_id)
      and not exists (
        select 1
        from public.bundle_items as item
        where item.bundle_id = bundle.id
          and not private.is_public_product(item.product_id)
      )
  );
$$;

revoke all on function private.has_staff_role(public.staff_role[]) from public;
revoke all on function private.is_public_product(bigint) from public;
revoke all on function private.is_public_bundle(bigint) from public;
grant usage on schema private to anon, authenticated;
grant execute on function private.has_staff_role(public.staff_role[]) to authenticated;
grant execute on function private.is_public_product(bigint) to anon, authenticated;
grant execute on function private.is_public_bundle(bigint) to anon, authenticated;

alter table public.site_settings enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_specs enable row level security;
alter table public.product_features enable row level security;
alter table public.product_box_contents enable row level security;
alter table public.product_tags enable row level security;
alter table public.product_relations enable row level security;
alter table public.bundles enable row level security;
alter table public.bundle_items enable row level security;
alter table public.shipping_methods enable row level security;
alter table public.coupons enable row level security;
alter table public.customer_profiles enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.audit_events enable row level security;
alter table public.order_enablement_checks enable row level security;

create policy site_settings_public_read on public.site_settings
for select to anon, authenticated using (true);
create policy site_settings_owner_manage on public.site_settings
for update to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role])))
with check ((select private.has_staff_role(array['owner'::public.staff_role])));

create policy categories_public_read on public.categories
for select to anon, authenticated using (active);
create policy categories_staff_read on public.categories
for select to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role])));
create policy categories_staff_insert on public.categories
for insert to authenticated
with check ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role])));
create policy categories_staff_update on public.categories
for update to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role])))
with check ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role])));
create policy categories_staff_delete on public.categories
for delete to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role])));

create policy products_public_read on public.products
for select to anon, authenticated using ((select private.is_public_product(id)));
create policy products_staff_read on public.products
for select to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role])));
create policy products_staff_insert on public.products
for insert to authenticated
with check ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role])));
create policy products_staff_update on public.products
for update to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role])))
with check ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role])));
create policy products_staff_delete on public.products
for delete to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role])));

create policy product_images_public_read on public.product_images
for select to anon, authenticated
using (published and (select private.is_public_product(product_id)));
create policy product_specs_public_read on public.product_specs
for select to anon, authenticated using ((select private.is_public_product(product_id)));
create policy product_features_public_read on public.product_features
for select to anon, authenticated using ((select private.is_public_product(product_id)));
create policy product_box_contents_public_read on public.product_box_contents
for select to anon, authenticated using ((select private.is_public_product(product_id)));
create policy product_tags_public_read on public.product_tags
for select to anon, authenticated using ((select private.is_public_product(product_id)));
create policy product_relations_public_read on public.product_relations
for select to anon, authenticated
using (
  (select private.is_public_product(product_id))
  and (select private.is_public_product(related_product_id))
);

create policy product_images_staff_all on public.product_images
for all to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role])))
with check ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role])));
create policy product_specs_staff_all on public.product_specs
for all to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role])))
with check ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role])));
create policy product_features_staff_all on public.product_features
for all to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role])))
with check ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role])));
create policy product_box_contents_staff_all on public.product_box_contents
for all to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role])))
with check ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role])));
create policy product_tags_staff_all on public.product_tags
for all to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role])))
with check ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role])));
create policy product_relations_staff_all on public.product_relations
for all to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role])))
with check ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role])));

create policy bundles_public_read on public.bundles
for select to anon, authenticated using ((select private.is_public_bundle(id)));
create policy bundle_items_public_read on public.bundle_items
for select to anon, authenticated using ((select private.is_public_bundle(bundle_id)));
create policy bundles_staff_all on public.bundles
for all to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role])))
with check ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role])));
create policy bundle_items_staff_all on public.bundle_items
for all to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role])))
with check ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role])));

create policy shipping_methods_public_read on public.shipping_methods
for select to anon, authenticated using (active);
create policy shipping_methods_staff_read on public.shipping_methods
for select to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role])));
create policy shipping_methods_manager_all on public.shipping_methods
for all to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role])))
with check ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role])));

create policy coupons_manager_all on public.coupons
for all to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role])))
with check ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role])));

create policy customer_profiles_own_select on public.customer_profiles
for select to authenticated using (user_id = (select auth.uid()));
create policy customer_profiles_own_insert on public.customer_profiles
for insert to authenticated with check (user_id = (select auth.uid()));
create policy customer_profiles_own_update on public.customer_profiles
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
create policy customer_profiles_manager_read on public.customer_profiles
for select to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role])));

create policy customer_addresses_own_all on public.customer_addresses
for all to authenticated
using (customer_id = (select auth.uid()))
with check (customer_id = (select auth.uid()));
create policy customer_addresses_manager_read on public.customer_addresses
for select to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role])));

create policy staff_profiles_self_read on public.staff_profiles
for select to authenticated using (user_id = (select auth.uid()));
create policy staff_profiles_manager_read on public.staff_profiles
for select to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role])));
create policy staff_profiles_owner_manage on public.staff_profiles
for all to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role])))
with check ((select private.has_staff_role(array['owner'::public.staff_role])));

create policy orders_customer_read on public.orders
for select to authenticated using (customer_id = (select auth.uid()));
create policy orders_manager_read on public.orders
for select to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role])));
create policy order_items_customer_read on public.order_items
for select to authenticated
using (
  exists (
    select 1 from public.orders
    where orders.id = order_items.order_id
      and orders.customer_id = (select auth.uid())
  )
);
create policy order_items_manager_read on public.order_items
for select to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role])));

create policy coupon_redemptions_customer_read on public.coupon_redemptions
for select to authenticated using (customer_id = (select auth.uid()));
create policy coupon_redemptions_manager_read on public.coupon_redemptions
for select to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role])));

create policy inventory_movements_editor_read on public.inventory_movements
for select to authenticated
using (
  order_id is null
  and (select private.has_staff_role(array['editor'::public.staff_role]))
);
create policy inventory_movements_manager_read on public.inventory_movements
for select to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role])));

create policy audit_events_manager_read on public.audit_events
for select to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role])));
create policy order_enablement_checks_manager_read on public.order_enablement_checks
for select to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role])));
create policy order_enablement_checks_owner_manage on public.order_enablement_checks
for all to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role])))
with check ((select private.has_staff_role(array['owner'::public.staff_role])));

revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;

grant select on public.site_settings, public.categories, public.products,
  public.product_images, public.product_specs, public.product_features,
  public.product_box_contents, public.product_tags, public.product_relations,
  public.bundles, public.bundle_items, public.shipping_methods
to anon, authenticated;

grant select on public.customer_profiles, public.customer_addresses, public.staff_profiles,
  public.orders, public.order_items, public.coupon_redemptions,
  public.inventory_movements, public.audit_events, public.order_enablement_checks,
  public.coupons
to authenticated;

grant insert, update on public.customer_profiles, public.customer_addresses to authenticated;
grant delete on public.customer_addresses to authenticated;
grant update on public.site_settings to authenticated;
grant insert, update, delete on public.categories, public.product_images,
  public.product_specs, public.product_features, public.product_box_contents,
  public.product_tags, public.product_relations, public.bundles, public.bundle_items,
  public.shipping_methods, public.coupons, public.staff_profiles,
  public.order_enablement_checks
to authenticated;

grant insert (
  category_id, slug, sku, name, tagline, description, price_cents,
  compare_at_price_cents, currency, publication_status, active,
  availability_override, preorder_allocation, blade_type, rating,
  review_count, sort_order
) on public.products to authenticated;
grant update (
  category_id, slug, sku, name, tagline, description, price_cents,
  compare_at_price_cents, currency, publication_status, active,
  availability_override, preorder_allocation, blade_type, rating,
  review_count, sort_order
) on public.products to authenticated;
grant delete on public.products to authenticated;
revoke update (stock_quantity) on public.products from anon, authenticated;

grant usage, select on all sequences in schema public to authenticated;
