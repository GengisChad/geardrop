-- Row level security by company. Generated from the live policies by a reviewed script and
-- committed as static SQL: every policy that authorized through the global staff role now
-- authorizes through membership of the row's company.
--
-- - Tier A and B tables compare their own organization_id with the caller's companies.
-- - Tier C children check the company of their parent row.
-- - Public reads are limited to companies with a public shop, directly or through the
--   private.is_public_* helpers, which gain the same check. Oryvenne has no shop: nothing of
--   it is ever readable without a membership.
-- - Staff profiles stay global identity and keep their policies.
-- - Storage objects of the product image bucket follow the company of their media asset.
begin;

-- ---------------------------------------------------------------------------------------
-- Public visibility helpers: a row is public only in a company with a public shop.
-- ---------------------------------------------------------------------------------------

create or replace function private.is_public_category(candidate_category_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.categories as category
    left join public.media_assets as media_asset on media_asset.id = category.media_asset_id
    where category.id = candidate_category_id
      and private.is_storefront_organization(category.organization_id)
      and category.active
      and category.publication_status = 'published'::public.publication_status
      and (category.published_at is null or category.published_at <= statement_timestamp())
      and (category.media_asset_id is null or media_asset.status = 'ready')
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
    where product.id = candidate_product_id
      and private.is_storefront_organization(product.organization_id)
      and product.publication_status = 'published'::public.publication_status
      and product.active
      and private.is_public_category(product.category_id)
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
    left join public.media_assets as media_asset on media_asset.id = bundle.media_asset_id
    where bundle.id = candidate_bundle_id
      and private.is_storefront_organization(bundle.organization_id)
      and bundle.active
      and (bundle.starts_at is null or bundle.starts_at <= statement_timestamp())
      and (bundle.ends_at is null or bundle.ends_at > statement_timestamp())
      and (bundle.media_asset_id is null or media_asset.status = 'ready')
      and private.is_public_product(bundle.hero_product_id)
      and exists (
        select 1 from public.bundle_items as item where item.bundle_id = bundle.id
      )
      and not exists (
        select 1
        from public.bundle_items as item
        where item.bundle_id = bundle.id
          and not private.is_public_product(item.product_id)
      )
  );
$$;

create or replace function private.is_public_footer_column(p_column_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.is_storefront_organization(column_row.organization_id)
      and private.is_content_public(column_row.publication_status, column_row.published_at, column_row.starts_at, column_row.ends_at, column_row.active)
    from public.footer_columns as column_row where column_row.id = p_column_id
  ), false);
$$;

create or replace function private.is_public_homepage_section(p_section_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.is_storefront_organization(section.organization_id)
      and private.is_content_public(section.publication_status, section.published_at, section.starts_at, section.ends_at, section.active)
      and (section.desktop_media_asset_id is null or exists (
        select 1 from public.media_assets as media where media.id = section.desktop_media_asset_id and media.status = 'ready'
      ))
      and (section.mobile_media_asset_id is null or exists (
        select 1 from public.media_assets as media where media.id = section.mobile_media_asset_id and media.status = 'ready'
      ))
    from public.homepage_sections as section where section.id = p_section_id
  ), false);
$$;

create or replace function private.is_public_navigation_menu(p_menu_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.is_storefront_organization(menu.organization_id)
      and private.is_content_public(menu.publication_status, menu.published_at, menu.starts_at, menu.ends_at, menu.active)
    from public.navigation_menus as menu where menu.id = p_menu_id
  ), false);
$$;

-- ---------------------------------------------------------------------------------------
-- Policies.
-- ---------------------------------------------------------------------------------------

drop policy "audit_events_manager_read" on public.audit_events;
create policy "audit_events_manager_read" on public.audit_events
as permissive
for select
to authenticated
using (((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role]) AS member_organization_ids)::bigint[])) OR ((organization_id IS NULL) AND (cardinality(( SELECT private.member_organization_ids(ARRAY['owner'::staff_role]) AS member_organization_ids)) > 0))));

drop policy "bundle_items_staff_all" on public.bundle_items;
create policy "bundle_items_staff_all" on public.bundle_items
as permissive
for all
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])))
with check ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "bundles_staff_all" on public.bundles;
create policy "bundles_staff_all" on public.bundles
as permissive
for all
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])))
with check ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "categories_staff_delete" on public.categories;
create policy "categories_staff_delete" on public.categories
as permissive
for delete
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "categories_staff_insert" on public.categories;
create policy "categories_staff_insert" on public.categories
as permissive
for insert
to authenticated
with check ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "categories_staff_read" on public.categories;
create policy "categories_staff_read" on public.categories
as permissive
for select
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "categories_staff_update" on public.categories;
create policy "categories_staff_update" on public.categories
as permissive
for update
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])))
with check ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "content_pages_public_read" on public.content_pages;
create policy "content_pages_public_read" on public.content_pages
as permissive
for select
to anon, authenticated
using ((( SELECT private.is_content_public(content_pages.publication_status, content_pages.published_at, content_pages.starts_at, content_pages.ends_at, content_pages.active) AS is_content_public) AND ( SELECT private.is_storefront_organization(content_pages.organization_id) AS is_storefront_organization)));

drop policy "content_pages_staff_all" on public.content_pages;
create policy "content_pages_staff_all" on public.content_pages
as permissive
for all
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])))
with check ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "coupon_bundles_manager_all" on public.coupon_bundles;
create policy "coupon_bundles_manager_all" on public.coupon_bundles
as permissive
for all
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role]) AS member_organization_ids)::bigint[])))
with check ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "coupon_categories_manager_all" on public.coupon_categories;
create policy "coupon_categories_manager_all" on public.coupon_categories
as permissive
for all
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role]) AS member_organization_ids)::bigint[])))
with check ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "coupon_products_manager_all" on public.coupon_products;
create policy "coupon_products_manager_all" on public.coupon_products
as permissive
for all
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role]) AS member_organization_ids)::bigint[])))
with check ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "coupon_redemptions_manager_read" on public.coupon_redemptions;
create policy "coupon_redemptions_manager_read" on public.coupon_redemptions
as permissive
for select
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "coupons_manager_all" on public.coupons;
create policy "coupons_manager_all" on public.coupons
as permissive
for all
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role]) AS member_organization_ids)::bigint[])))
with check ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "customer_addresses_manager_read" on public.customer_addresses;
create policy "customer_addresses_manager_read" on public.customer_addresses
as permissive
for select
to authenticated
using ((EXISTS ( SELECT 1 FROM public.customer_profiles parent_row WHERE ((parent_row.user_id = customer_addresses.customer_id) AND (parent_row.organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role]) AS member_organization_ids)::bigint[]))))));

drop policy "customer_profiles_manager_read" on public.customer_profiles;
create policy "customer_profiles_manager_read" on public.customer_profiles
as permissive
for select
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "customer_profiles_own_insert" on public.customer_profiles;
create policy "customer_profiles_own_insert" on public.customer_profiles
as permissive
for insert
to authenticated
with check (((user_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.is_storefront_organization(customer_profiles.organization_id) AS is_storefront_organization)));

drop policy "customer_profiles_own_update" on public.customer_profiles;
create policy "customer_profiles_own_update" on public.customer_profiles
as permissive
for update
to authenticated
using ((user_id = ( SELECT auth.uid() AS uid)))
with check (((user_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.is_storefront_organization(customer_profiles.organization_id) AS is_storefront_organization)));

drop policy "footer_columns_staff_all" on public.footer_columns;
create policy "footer_columns_staff_all" on public.footer_columns
as permissive
for all
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])))
with check ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "footer_items_staff_all" on public.footer_items;
create policy "footer_items_staff_all" on public.footer_items
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1 FROM public.footer_columns parent_row WHERE ((parent_row.id = footer_items.column_id) AND (parent_row.organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[]))))))
with check ((EXISTS ( SELECT 1 FROM public.footer_columns parent_row WHERE ((parent_row.id = footer_items.column_id) AND (parent_row.organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[]))))));

drop policy "homepage_section_bundles_staff_all" on public.homepage_section_bundles;
create policy "homepage_section_bundles_staff_all" on public.homepage_section_bundles
as permissive
for all
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])))
with check ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "homepage_section_categories_staff_all" on public.homepage_section_categories;
create policy "homepage_section_categories_staff_all" on public.homepage_section_categories
as permissive
for all
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])))
with check ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "homepage_section_products_staff_all" on public.homepage_section_products;
create policy "homepage_section_products_staff_all" on public.homepage_section_products
as permissive
for all
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])))
with check ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "homepage_sections_staff_all" on public.homepage_sections;
create policy "homepage_sections_staff_all" on public.homepage_sections
as permissive
for all
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])))
with check ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "inventory_movements_editor_read" on public.inventory_movements;
create policy "inventory_movements_editor_read" on public.inventory_movements
as permissive
for select
to authenticated
using (((order_id IS NULL) AND (organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['editor'::staff_role]) AS member_organization_ids)::bigint[]))));

drop policy "inventory_movements_manager_read" on public.inventory_movements;
create policy "inventory_movements_manager_read" on public.inventory_movements
as permissive
for select
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "media_assets_content_staff_insert" on public.media_assets;
create policy "media_assets_content_staff_insert" on public.media_assets
as permissive
for insert
to authenticated
with check (((uploaded_by = ( SELECT auth.uid() AS uid)) AND (status = 'pending'::media_asset_status) AND (failure_code IS NULL) AND (ready_at IS NULL) AND (organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[]))));

drop policy "media_assets_content_staff_update" on public.media_assets;
create policy "media_assets_content_staff_update" on public.media_assets
as permissive
for update
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])))
with check ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "media_assets_manager_delete" on public.media_assets;
create policy "media_assets_manager_delete" on public.media_assets
as permissive
for delete
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "media_assets_staff_read" on public.media_assets;
create policy "media_assets_staff_read" on public.media_assets
as permissive
for select
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "navigation_items_staff_all" on public.navigation_items;
create policy "navigation_items_staff_all" on public.navigation_items
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1 FROM public.navigation_menus parent_row WHERE ((parent_row.id = navigation_items.menu_id) AND (parent_row.organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[]))))))
with check ((EXISTS ( SELECT 1 FROM public.navigation_menus parent_row WHERE ((parent_row.id = navigation_items.menu_id) AND (parent_row.organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[]))))));

drop policy "navigation_menus_staff_all" on public.navigation_menus;
create policy "navigation_menus_staff_all" on public.navigation_menus
as permissive
for all
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])))
with check ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "order_enablement_checks_manager_read" on public.order_enablement_checks;
create policy "order_enablement_checks_manager_read" on public.order_enablement_checks
as permissive
for select
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "order_enablement_checks_owner_manage" on public.order_enablement_checks;
create policy "order_enablement_checks_owner_manage" on public.order_enablement_checks
as permissive
for all
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role]) AS member_organization_ids)::bigint[])))
with check ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "order_items_manager_read" on public.order_items;
create policy "order_items_manager_read" on public.order_items
as permissive
for select
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "order_notes_manager_read" on public.order_notes;
create policy "order_notes_manager_read" on public.order_notes
as permissive
for select
to authenticated
using ((EXISTS ( SELECT 1 FROM public.orders parent_row WHERE ((parent_row.id = order_notes.order_id) AND (parent_row.organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role]) AS member_organization_ids)::bigint[]))))));

drop policy "order_status_events_manager_read" on public.order_status_events;
create policy "order_status_events_manager_read" on public.order_status_events
as permissive
for select
to authenticated
using ((EXISTS ( SELECT 1 FROM public.orders parent_row WHERE ((parent_row.id = order_status_events.order_id) AND (parent_row.organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role]) AS member_organization_ids)::bigint[]))))));

drop policy "orders_manager_read" on public.orders;
create policy "orders_manager_read" on public.orders
as permissive
for select
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "product_box_contents_staff_all" on public.product_box_contents;
create policy "product_box_contents_staff_all" on public.product_box_contents
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1 FROM public.products parent_row WHERE ((parent_row.id = product_box_contents.product_id) AND (parent_row.organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[]))))))
with check ((EXISTS ( SELECT 1 FROM public.products parent_row WHERE ((parent_row.id = product_box_contents.product_id) AND (parent_row.organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[]))))));

drop policy "product_features_staff_all" on public.product_features;
create policy "product_features_staff_all" on public.product_features
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1 FROM public.products parent_row WHERE ((parent_row.id = product_features.product_id) AND (parent_row.organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[]))))))
with check ((EXISTS ( SELECT 1 FROM public.products parent_row WHERE ((parent_row.id = product_features.product_id) AND (parent_row.organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[]))))));

drop policy "product_images_staff_all" on public.product_images;
create policy "product_images_staff_all" on public.product_images
as permissive
for all
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])))
with check ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "product_relations_staff_all" on public.product_relations;
create policy "product_relations_staff_all" on public.product_relations
as permissive
for all
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])))
with check ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "product_specs_staff_all" on public.product_specs;
create policy "product_specs_staff_all" on public.product_specs
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1 FROM public.products parent_row WHERE ((parent_row.id = product_specs.product_id) AND (parent_row.organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[]))))))
with check ((EXISTS ( SELECT 1 FROM public.products parent_row WHERE ((parent_row.id = product_specs.product_id) AND (parent_row.organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[]))))));

drop policy "product_tags_staff_all" on public.product_tags;
create policy "product_tags_staff_all" on public.product_tags
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1 FROM public.products parent_row WHERE ((parent_row.id = product_tags.product_id) AND (parent_row.organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[]))))))
with check ((EXISTS ( SELECT 1 FROM public.products parent_row WHERE ((parent_row.id = product_tags.product_id) AND (parent_row.organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[]))))));

drop policy "products_staff_delete" on public.products;
create policy "products_staff_delete" on public.products
as permissive
for delete
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "products_staff_insert" on public.products;
create policy "products_staff_insert" on public.products
as permissive
for insert
to authenticated
with check ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "products_staff_read" on public.products;
create policy "products_staff_read" on public.products
as permissive
for select
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "products_staff_update" on public.products;
create policy "products_staff_update" on public.products
as permissive
for update
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])))
with check ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "promotion_bundles_manager_all" on public.promotion_bundles;
create policy "promotion_bundles_manager_all" on public.promotion_bundles
as permissive
for all
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role]) AS member_organization_ids)::bigint[])))
with check ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "promotion_categories_manager_all" on public.promotion_categories;
create policy "promotion_categories_manager_all" on public.promotion_categories
as permissive
for all
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role]) AS member_organization_ids)::bigint[])))
with check ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "promotion_products_manager_all" on public.promotion_products;
create policy "promotion_products_manager_all" on public.promotion_products
as permissive
for all
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role]) AS member_organization_ids)::bigint[])))
with check ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "promotions_manager_all" on public.promotions;
create policy "promotions_manager_all" on public.promotions
as permissive
for all
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role]) AS member_organization_ids)::bigint[])))
with check ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "promotions_public_read" on public.promotions;
create policy "promotions_public_read" on public.promotions
as permissive
for select
to anon, authenticated
using (((active AND ((starts_at IS NULL) OR (starts_at <= statement_timestamp())) AND ((ends_at IS NULL) OR (ends_at > statement_timestamp()))) AND ( SELECT private.is_storefront_organization(promotions.organization_id) AS is_storefront_organization)));

drop policy "staff can read restock requests" on public.restock_requests;
create policy "staff can read restock requests" on public.restock_requests
as permissive
for select
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "shipping_methods_manager_all" on public.shipping_methods;
create policy "shipping_methods_manager_all" on public.shipping_methods
as permissive
for all
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role]) AS member_organization_ids)::bigint[])))
with check ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "shipping_methods_public_read" on public.shipping_methods;
create policy "shipping_methods_public_read" on public.shipping_methods
as permissive
for select
to anon, authenticated
using ((active AND ( SELECT private.is_storefront_organization(shipping_methods.organization_id) AS is_storefront_organization)));

drop policy "shipping_methods_staff_read" on public.shipping_methods;
create policy "shipping_methods_staff_read" on public.shipping_methods
as permissive
for select
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "site_settings_owner_manage" on public.site_settings;
create policy "site_settings_owner_manage" on public.site_settings
as permissive
for update
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role]) AS member_organization_ids)::bigint[])))
with check ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role]) AS member_organization_ids)::bigint[])));

drop policy "site_settings_public_read" on public.site_settings;
create policy "site_settings_public_read" on public.site_settings
as permissive
for select
to anon, authenticated
using (( SELECT private.is_storefront_organization(site_settings.organization_id) AS is_storefront_organization));

drop policy "social_links_public_read" on public.social_links;
create policy "social_links_public_read" on public.social_links
as permissive
for select
to anon, authenticated
using ((( SELECT private.is_content_public(social_links.publication_status, social_links.published_at, social_links.starts_at, social_links.ends_at, social_links.active) AS is_content_public) AND ( SELECT private.is_storefront_organization(social_links.organization_id) AS is_storefront_organization)));

drop policy "social_links_staff_all" on public.social_links;
create policy "social_links_staff_all" on public.social_links
as permissive
for all
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])))
with check ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])));

-- Members read their company's settings; the public read above covers shops only.
create policy site_settings_member_read on public.site_settings
as permissive
for select
to authenticated
using ((organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::staff_role, 'admin'::staff_role, 'editor'::staff_role]) AS member_organization_ids)::bigint[])));

-- ---------------------------------------------------------------------------------------
-- Storage: product image objects follow the company of their media asset.
-- ---------------------------------------------------------------------------------------

drop policy "product_images_content_staff_insert" on storage.objects;
create policy "product_images_content_staff_insert" on storage.objects
as permissive
for insert
to authenticated
with check (((bucket_id = 'product-images'::text) AND (owner_id = ( SELECT (auth.uid())::text AS uid)) AND (EXISTS ( SELECT 1
   FROM public.media_assets media_asset
  WHERE ((media_asset.bucket_id = objects.bucket_id) AND (media_asset.object_path = objects.name) AND (media_asset.uploaded_by = ( SELECT auth.uid() AS uid)) AND (media_asset.status = 'pending'::public.media_asset_status)
    AND (media_asset.organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role]) AS member_organization_ids)::bigint[])))))));

drop policy "product_images_manager_delete" on storage.objects;
create policy "product_images_manager_delete" on storage.objects
as permissive
for delete
to authenticated
using (((bucket_id = 'product-images'::text) AND (EXISTS ( SELECT 1
   FROM public.media_assets media_asset
  WHERE ((media_asset.bucket_id = objects.bucket_id) AND (media_asset.object_path = objects.name)
    AND (media_asset.organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::public.staff_role, 'admin'::public.staff_role]) AS member_organization_ids)::bigint[])))))));

drop policy "product_images_staff_object_read" on storage.objects;
create policy "product_images_staff_object_read" on storage.objects
as permissive
for select
to authenticated
using (((bucket_id = 'product-images'::text) AND (EXISTS ( SELECT 1
   FROM public.media_assets media_asset
  WHERE ((media_asset.bucket_id = objects.bucket_id) AND (media_asset.object_path = objects.name)
    AND (media_asset.organization_id = ANY (( SELECT private.member_organization_ids(ARRAY['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role]) AS member_organization_ids)::bigint[])))))));

commit;
