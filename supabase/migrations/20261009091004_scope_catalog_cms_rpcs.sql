-- Catalogue, media, CMS, promotions, coupons and stock RPCs act inside one company.
--
-- - An RPC that works on existing rows reads their company and requires the caller's role
--   there (private.require_org_role keeps each function's own error message). A set of rows
--   spanning two companies is refused as an invalid set.
-- - An RPC that creates a root takes p_organization_id as its first argument; when it also
--   receives an existing row, the row must belong to that company, or it is "not found".
-- - Natural keys (SKU, codes, keys) are looked up inside the company; sets that used to mean
--   "all rows" (category order, homepage order, footer) now mean all rows of the company.
-- - Audit events carry the company explicitly.
begin;

-- ---------------------------------------------------------------------------------------
-- Products.
-- ---------------------------------------------------------------------------------------

create or replace function public.bulk_update_products(p_product_ids bigint[], p_operation text, p_category_id bigint default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  normalized_operation text := lower(trim(p_operation));
  requested_count integer;
  locked_count integer;
  updated_count integer;
  companies bigint[];
  company bigint;
begin
  select array_agg(distinct organization_id) into companies from public.products where id = any(p_product_ids);
  company := companies[1];
  perform private.require_org_role(company,
    array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role],
    'GD_PRODUCT_STAFF_REQUIRED');

  requested_count := coalesce(array_length(p_product_ids, 1), 0);
  if requested_count = 0
    or coalesce(cardinality(companies), 0) > 1
    or exists (select 1 from unnest(p_product_ids) as product_id where product_id is null)
    or (select count(distinct product_id) from unnest(p_product_ids) as product_id) <> requested_count then
    raise exception using errcode = '22023', message = 'GD_INVALID_PRODUCT_SET';
  end if;

  if normalized_operation not in ('publish', 'draft', 'archive', 'category') then
    raise exception using errcode = '22023', message = 'GD_INVALID_BULK_PRODUCT_OPERATION';
  end if;

  if normalized_operation = 'category' and not exists (
    select 1 from public.categories as category where category.id = p_category_id and category.organization_id = company
  ) then
    raise exception using errcode = 'P0002', message = 'GD_CATEGORY_NOT_FOUND';
  end if;

  select count(*)::integer
  into locked_count
  from (
    select product.id
    from public.products as product
    where product.id = any(p_product_ids)
    order by product.id
    for update
  ) as locked_products;

  if locked_count <> requested_count then
    raise exception using errcode = 'P0002', message = 'GD_PRODUCT_SET_NOT_FOUND';
  end if;

  if normalized_operation = 'publish' then
    update public.products set publication_status = 'published'::public.publication_status, active = true
    where id = any(p_product_ids);
  elsif normalized_operation = 'draft' then
    update public.products set publication_status = 'draft'::public.publication_status, active = false
    where id = any(p_product_ids);
  elsif normalized_operation = 'archive' then
    update public.products set publication_status = 'archived'::public.publication_status, active = false
    where id = any(p_product_ids);
  else
    update public.products set category_id = p_category_id where id = any(p_product_ids);
  end if;

  get diagnostics updated_count = row_count;

  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, after_state)
  values (
    company, actor_id, 'catalog.products.bulk_updated', 'products', array_to_string(p_product_ids, ','),
    jsonb_build_object('product_ids', to_jsonb(p_product_ids), 'operation', normalized_operation,
      'category_id', p_category_id, 'updated_count', updated_count)
  );

  return updated_count;
end;
$$;

create or replace function public.delete_product_permanently(p_product_id bigint, p_expected_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target public.products%rowtype;
begin
  perform private.require_org_role(private.organization_of_product(p_product_id),
    array['owner'::public.staff_role, 'admin'::public.staff_role], 'GD_PRODUCT_MANAGER_REQUIRED');

  select product.* into target from public.products as product where product.id = p_product_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_PRODUCT_NOT_FOUND';
  end if;
  if p_expected_name is distinct from target.name then
    raise exception using errcode = '22023', message = 'GD_PRODUCT_CONFIRMATION_MISMATCH';
  end if;
  if exists (select 1 from public.order_items where product_id = target.id) then
    raise exception using errcode = '23503', message = 'GD_PRODUCT_HAS_ORDERS';
  end if;
  if exists (select 1 from public.bundles where hero_product_id = target.id)
    or exists (select 1 from public.bundle_items where product_id = target.id) then
    raise exception using errcode = '23503', message = 'GD_PRODUCT_HAS_BUNDLES';
  end if;
  if exists (select 1 from public.inventory_movements where product_id = target.id) then
    raise exception using errcode = '23503', message = 'GD_PRODUCT_HAS_INVENTORY';
  end if;

  delete from public.products where id = target.id;

  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, before_state)
  values (target.organization_id, actor_id, 'catalog.product.deleted', 'products', target.id::text, to_jsonb(target));
end;
$$;

create or replace function public.duplicate_product_draft(p_source_product_id bigint, p_name text, p_slug text, p_sku text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  source_product public.products%rowtype;
  new_product_id bigint;
  normalized_name text := trim(p_name);
  normalized_slug text := lower(trim(p_slug));
  normalized_sku text := lower(trim(p_sku));
begin
  perform private.require_org_role(private.organization_of_product(p_source_product_id),
    array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role],
    'GD_PRODUCT_STAFF_REQUIRED');

  if nullif(normalized_name, '') is null
    or nullif(normalized_slug, '') is null
    or nullif(normalized_sku, '') is null
    or normalized_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or normalized_sku !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception using errcode = '22023', message = 'GD_INVALID_PRODUCT_DUPLICATE_IDENTITY';
  end if;

  select product.* into source_product from public.products as product where product.id = p_source_product_id for share;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_PRODUCT_NOT_FOUND';
  end if;

  insert into public.products (
    organization_id, category_id, slug, sku, name, tagline, description,
    price_cents, compare_at_price_cents, currency,
    publication_status, active, stock_quantity,
    availability_override, preorder_allocation, blade_type,
    rating, review_count, sort_order, short_name,
    manage_stock, low_stock_threshold, allow_backorder,
    preorder_release_date, seo_title, seo_description
  ) values (
    source_product.organization_id, source_product.category_id, normalized_slug, normalized_sku, normalized_name,
    source_product.tagline, source_product.description,
    0, null, source_product.currency,
    'draft'::public.publication_status, false, 0,
    null, 0, source_product.blade_type,
    0, 0, source_product.sort_order, source_product.short_name,
    true, 5, false,
    null, source_product.seo_title, source_product.seo_description
  )
  returning id into new_product_id;

  insert into public.product_specs (product_id, label, value, sort_order)
  select new_product_id, detail.label, detail.value, detail.sort_order
  from public.product_specs as detail where detail.product_id = source_product.id
  order by detail.sort_order, detail.id;

  insert into public.product_features (product_id, title, description, sort_order)
  select new_product_id, detail.title, detail.description, detail.sort_order
  from public.product_features as detail where detail.product_id = source_product.id
  order by detail.sort_order, detail.id;

  insert into public.product_box_contents (product_id, content, sort_order)
  select new_product_id, detail.content, detail.sort_order
  from public.product_box_contents as detail where detail.product_id = source_product.id
  order by detail.sort_order, detail.id;

  insert into public.product_tags (product_id, tag)
  select new_product_id, product_tag.tag
  from public.product_tags as product_tag where product_tag.product_id = source_product.id;

  insert into public.product_relations (product_id, related_product_id, relation_type, sort_order)
  select new_product_id, relation.related_product_id, relation.relation_type, relation.sort_order
  from public.product_relations as relation where relation.product_id = source_product.id;

  insert into public.product_images (product_id, src, width, height, alt, sort_order, published, media_asset_id, is_primary)
  select new_product_id, image.src, image.width, image.height, image.alt, image.sort_order, false, image.media_asset_id, image.is_primary
  from public.product_images as image
  join public.media_assets as media_asset on media_asset.id = image.media_asset_id
  where image.product_id = source_product.id
    and media_asset.status = 'ready'::public.media_asset_status
  order by image.sort_order, image.id;

  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, after_state)
  values (source_product.organization_id, actor_id, 'catalog.product.duplicated', 'products', new_product_id::text,
    jsonb_build_object('source_product_id', source_product.id, 'new_product_id', new_product_id));

  return new_product_id;
end;
$$;

create or replace function public.product_deletion_impact(p_product_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  impact jsonb;
begin
  perform private.require_org_role(private.organization_of_product(p_product_id),
    array['owner'::public.staff_role, 'admin'::public.staff_role], 'GD_PRODUCT_MANAGER_REQUIRED');

  if not exists (select 1 from public.products where id = p_product_id) then
    raise exception using errcode = 'P0002', message = 'GD_PRODUCT_NOT_FOUND';
  end if;

  select jsonb_build_object(
    'orders', (select count(*) from public.order_items where product_id = p_product_id),
    'bundles', (
      select count(*) from (
        select bundle.id from public.bundles as bundle where bundle.hero_product_id = p_product_id
        union
        select item.bundle_id from public.bundle_items as item where item.product_id = p_product_id
      ) as dependent_bundles
    ),
    'relations', (
      select count(*) from public.product_relations
      where product_id = p_product_id or related_product_id = p_product_id
    ),
    'images', (select count(*) from public.product_images where product_id = p_product_id),
    'specs', (select count(*) from public.product_specs where product_id = p_product_id),
    'features', (select count(*) from public.product_features where product_id = p_product_id),
    'box_contents', (select count(*) from public.product_box_contents where product_id = p_product_id),
    'tags', (select count(*) from public.product_tags where product_id = p_product_id),
    'inventory_movements', (select count(*) from public.inventory_movements where product_id = p_product_id)
  ) into impact;

  return impact;
end;
$$;

create or replace function public.reorder_product_images(p_product_id bigint, p_image_ids bigint[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  requested_count integer := coalesce(array_length(p_image_ids, 1), 0);
  current_count integer;
  company bigint := private.organization_of_product(p_product_id);
begin
  perform private.require_org_role(company,
    array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role],
    'GD_PRODUCT_STAFF_REQUIRED');
  if requested_count = 0
    or exists (select 1 from unnest(p_image_ids) as image_id where image_id is null)
    or (select count(distinct image_id) from unnest(p_image_ids) as image_id) <> requested_count then
    raise exception using errcode = '22023', message = 'GD_INVALID_IMAGE_ORDER';
  end if;
  perform 1 from public.products where id = p_product_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_PRODUCT_NOT_FOUND';
  end if;
  select count(*)::integer
  into current_count
  from (
    select image.id from public.product_images as image
    where image.product_id = p_product_id
    order by image.id
    for update
  ) as locked_images;
  if current_count <> requested_count
    or (select count(*) from public.product_images where product_id = p_product_id and id = any(p_image_ids)) <> requested_count
    or exists (select 1 from public.product_images where product_id = p_product_id and sort_order < 0) then
    raise exception using errcode = '22023', message = 'GD_IMAGE_SET_MISMATCH';
  end if;
  with temporary_positions as (
    select image.id, row_number() over (order by image.id)::integer as position
    from public.product_images as image where image.product_id = p_product_id
  )
  update public.product_images as image set sort_order = -temporary_positions.position
  from temporary_positions where image.id = temporary_positions.id;
  with requested_positions as (
    select image_id, ordinality::integer - 1 as position
    from unnest(p_image_ids) with ordinality as requested(image_id, ordinality)
  )
  update public.product_images as image set sort_order = requested_positions.position
  from requested_positions
  where image.id = requested_positions.image_id and image.product_id = p_product_id;
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, after_state)
  values (company, actor_id, 'catalog.product.images_reordered', 'products', p_product_id::text,
    jsonb_build_object('image_ids', to_jsonb(p_image_ids)));
end;
$$;

create or replace function public.replace_product_details(p_product_id bigint, p_specs jsonb, p_features jsonb, p_box_contents jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  specs jsonb := coalesce(p_specs, '[]'::jsonb);
  features jsonb := coalesce(p_features, '[]'::jsonb);
  box_contents jsonb := coalesce(p_box_contents, '[]'::jsonb);
  company bigint := private.organization_of_product(p_product_id);
begin
  perform private.require_org_role(company,
    array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role],
    'GD_PRODUCT_STAFF_REQUIRED');
  perform 1 from public.products where id = p_product_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_PRODUCT_NOT_FOUND';
  end if;
  if jsonb_typeof(specs) <> 'array' or jsonb_typeof(features) <> 'array' or jsonb_typeof(box_contents) <> 'array' then
    raise exception using errcode = '22023', message = 'GD_INVALID_PRODUCT_DETAILS';
  end if;
  if exists (
    select 1 from jsonb_array_elements(specs) as item(value)
    where jsonb_typeof(item.value) <> 'object'
      or nullif(trim(item.value ->> 'label'), '') is null
      or nullif(trim(item.value ->> 'value'), '') is null
  ) or exists (
    select 1 from jsonb_array_elements(features) as item(value)
    where jsonb_typeof(item.value) <> 'object'
      or nullif(trim(item.value ->> 'title'), '') is null
      or nullif(trim(item.value ->> 'description'), '') is null
  ) or exists (
    select 1 from jsonb_array_elements(box_contents) as item(value)
    where jsonb_typeof(item.value) <> 'object'
      or nullif(trim(item.value ->> 'content'), '') is null
  ) then
    raise exception using errcode = '22023', message = 'GD_INVALID_PRODUCT_DETAILS';
  end if;
  delete from public.product_specs where product_id = p_product_id;
  delete from public.product_features where product_id = p_product_id;
  delete from public.product_box_contents where product_id = p_product_id;
  insert into public.product_specs (product_id, label, value, sort_order)
  select p_product_id, trim(item.value ->> 'label'), trim(item.value ->> 'value'), item.ordinality::integer - 1
  from jsonb_array_elements(specs) with ordinality as item(value, ordinality);
  insert into public.product_features (product_id, title, description, sort_order)
  select p_product_id, trim(item.value ->> 'title'), trim(item.value ->> 'description'), item.ordinality::integer - 1
  from jsonb_array_elements(features) with ordinality as item(value, ordinality);
  insert into public.product_box_contents (product_id, content, sort_order)
  select p_product_id, trim(item.value ->> 'content'), item.ordinality::integer - 1
  from jsonb_array_elements(box_contents) with ordinality as item(value, ordinality);
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, after_state)
  values (company, actor_id, 'catalog.product.details_replaced', 'products', p_product_id::text,
    jsonb_build_object('spec_count', jsonb_array_length(specs), 'feature_count', jsonb_array_length(features),
      'box_content_count', jsonb_array_length(box_contents)));
end;
$$;

create or replace function public.set_primary_product_image(p_product_id bigint, p_image_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  company bigint := private.organization_of_product(p_product_id);
begin
  perform private.require_org_role(company,
    array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role],
    'GD_PRODUCT_STAFF_REQUIRED');
  perform 1 from public.product_images as image where image.product_id = p_product_id order by image.id for update;
  if not exists (select 1 from public.product_images as image where image.id = p_image_id and image.product_id = p_product_id) then
    raise exception using errcode = 'P0002', message = 'GD_PRODUCT_IMAGE_NOT_FOUND';
  end if;
  update public.product_images set is_primary = false where product_id = p_product_id;
  update public.product_images set is_primary = true where id = p_image_id and product_id = p_product_id;
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, after_state)
  values (company, actor_id, 'catalog.product.primary_image_set', 'products', p_product_id::text,
    jsonb_build_object('image_id', p_image_id));
end;
$$;

create or replace function public.update_product_image_metadata(p_product_id bigint, p_image_id bigint, p_alt text, p_published boolean, p_is_primary boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_org_role(private.organization_of_product(p_product_id),
    array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role],
    'GD_PRODUCT_STAFF_REQUIRED');
  update public.product_images set alt = trim(p_alt), published = p_published
  where id = p_image_id and product_id = p_product_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_PRODUCT_IMAGE_NOT_FOUND';
  end if;
  if p_is_primary then
    update public.product_images set is_primary = (id = p_image_id) where product_id = p_product_id;
  end if;
end;
$$;

-- Categories: the order covers every category of the company, and only them.
create or replace function public.reorder_categories(p_category_ids bigint[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  category_count integer;
  companies bigint[];
  company bigint;
begin
  select array_agg(distinct organization_id) into companies from public.categories where id = any(p_category_ids);
  company := companies[1];
  perform private.require_org_role(company,
    array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role],
    'GD_CATEGORY_STAFF_REQUIRED');
  if p_category_ids is null or cardinality(p_category_ids) = 0
    or array_position(p_category_ids, null) is not null
    or (select count(distinct category_id) from unnest(p_category_ids) as category(category_id)) <> cardinality(p_category_ids) then
    raise exception using errcode = '22023', message = 'GD_INVALID_CATEGORY_ORDER';
  end if;
  if coalesce(cardinality(companies), 0) <> 1 then
    raise exception using errcode = '22023', message = 'GD_CATEGORY_ID_SET_MISMATCH';
  end if;

  perform 1 from public.categories where organization_id = company order by id for update;
  select count(*)::integer into category_count from public.categories where organization_id = company;
  if category_count <> cardinality(p_category_ids)
    or exists (select id from public.categories where organization_id = company except select unnest(p_category_ids)) then
    raise exception using errcode = '22023', message = 'GD_CATEGORY_ID_SET_MISMATCH';
  end if;

  with temporary_order as (
    select category.id, row_number() over (order by category.id)::integer as position
    from public.categories as category where category.organization_id = company
  )
  update public.categories as category set sort_order = -1000000 - temporary_order.position
  from temporary_order where category.id = temporary_order.id;

  with requested_order as (
    select category_id, ordinality::integer - 1 as position
    from unnest(p_category_ids) with ordinality as requested(category_id, ordinality)
  )
  update public.categories as category set sort_order = requested_order.position
  from requested_order where category.id = requested_order.category_id;

  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, after_state)
  values (company, actor_id, 'catalog.categories.reordered', 'categories', 'all',
    jsonb_build_object('category_ids', to_jsonb(p_category_ids)));
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Media.
-- ---------------------------------------------------------------------------------------

create or replace function public.begin_media_delete(p_media_asset_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.media_assets%rowtype;
begin
  perform private.require_org_role(
    (select organization_id from public.media_assets where id = p_media_asset_id),
    array['owner'::public.staff_role, 'admin'::public.staff_role], 'GD_MEDIA_MANAGER_REQUIRED');
  select media_asset.* into target from public.media_assets as media_asset where media_asset.id = p_media_asset_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_MEDIA_ASSET_NOT_FOUND';
  end if;
  if exists (select 1 from public.product_images as product_image where product_image.media_asset_id = target.id) then
    raise exception using errcode = '23503', message = 'GD_MEDIA_IN_USE';
  end if;
  update public.media_assets
  set status = 'failed'::public.media_asset_status, failure_code = 'delete_pending', ready_at = null
  where id = target.id;
  return target.object_path;
end;
$$;

create or replace function public.complete_media_delete(p_media_asset_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.media_assets%rowtype;
begin
  perform private.require_org_role(
    (select organization_id from public.media_assets where id = p_media_asset_id),
    array['owner'::public.staff_role, 'admin'::public.staff_role], 'GD_MEDIA_MANAGER_REQUIRED');
  select media_asset.* into target from public.media_assets as media_asset where media_asset.id = p_media_asset_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_MEDIA_ASSET_NOT_FOUND';
  end if;
  if target.status <> 'failed'::public.media_asset_status or target.failure_code <> 'delete_pending' then
    raise exception using errcode = '55000', message = 'GD_MEDIA_DELETE_NOT_STARTED';
  end if;
  if exists (select 1 from public.product_images as product_image where product_image.media_asset_id = target.id) then
    raise exception using errcode = '23503', message = 'GD_MEDIA_IN_USE';
  end if;
  if exists (
    select 1 from storage.objects as stored_object
    where stored_object.bucket_id = target.bucket_id and stored_object.name = target.object_path
  ) then
    raise exception using errcode = '55000', message = 'GD_STORAGE_OBJECT_STILL_EXISTS';
  end if;
  delete from public.media_assets where id = target.id;
end;
$$;

create or replace function public.fail_media_upload(p_media_asset_id bigint, p_failure_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target public.media_assets%rowtype;
  normalized_failure text := lower(trim(p_failure_code));
  company bigint := (select organization_id from public.media_assets where id = p_media_asset_id);
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'GD_AUTHENTICATION_REQUIRED';
  end if;
  perform private.require_org_role(company,
    array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role],
    'GD_MEDIA_STAFF_REQUIRED');
  if normalized_failure is null or normalized_failure = '' or length(normalized_failure) > 64
    or normalized_failure !~ '^[a-z0-9_]+$' then
    raise exception using errcode = '22023', message = 'GD_INVALID_MEDIA_FAILURE_CODE';
  end if;
  select media_asset.* into target from public.media_assets as media_asset where media_asset.id = p_media_asset_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_MEDIA_ASSET_NOT_FOUND';
  end if;
  if target.uploaded_by <> actor_id
    and not private.is_org_member(company, array['owner'::public.staff_role, 'admin'::public.staff_role]) then
    raise exception using errcode = '42501', message = 'GD_MEDIA_OWNER_OR_MANAGER_REQUIRED';
  end if;
  if target.status <> 'pending'::public.media_asset_status then
    raise exception using errcode = '55000', message = 'GD_MEDIA_NOT_PENDING';
  end if;
  update public.media_assets
  set status = 'failed'::public.media_asset_status, failure_code = normalized_failure, ready_at = null
  where id = target.id;
end;
$$;

create or replace function public.finalize_media_upload(p_media_asset_id bigint, p_mime_type text, p_byte_size bigint, p_width integer, p_height integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target public.media_assets%rowtype;
  normalized_mime text := lower(trim(p_mime_type));
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'GD_AUTHENTICATION_REQUIRED';
  end if;
  perform private.require_org_role(
    (select organization_id from public.media_assets where id = p_media_asset_id),
    array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role],
    'GD_MEDIA_STAFF_REQUIRED');
  if normalized_mime is null
    or normalized_mime not in ('image/png', 'image/jpeg', 'image/webp', 'image/avif')
    or p_byte_size is null or p_byte_size <= 0 or p_byte_size > 10485760
    or p_width is null or p_width <= 0
    or p_height is null or p_height <= 0 then
    raise exception using errcode = '22023', message = 'GD_INVALID_MEDIA_METADATA';
  end if;
  select media_asset.* into target from public.media_assets as media_asset where media_asset.id = p_media_asset_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_MEDIA_ASSET_NOT_FOUND';
  end if;
  if target.uploaded_by <> actor_id then
    raise exception using errcode = '42501', message = 'GD_MEDIA_OWNER_REQUIRED';
  end if;
  if target.status <> 'pending'::public.media_asset_status then
    raise exception using errcode = '55000', message = 'GD_MEDIA_NOT_PENDING';
  end if;
  if not exists (
    select 1 from storage.objects as stored_object
    where stored_object.bucket_id = target.bucket_id
      and stored_object.name = target.object_path
      and stored_object.owner_id = actor_id::text
  ) then
    raise exception using errcode = 'P0002', message = 'GD_STORAGE_OBJECT_NOT_FOUND';
  end if;
  update public.media_assets
  set mime_type = normalized_mime, byte_size = p_byte_size, width = p_width, height = p_height,
      status = 'ready'::public.media_asset_status, failure_code = null, ready_at = now()
  where id = target.id;
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, after_state)
  values (target.organization_id, actor_id, 'storage.insert.completed', 'storage.objects',
    target.bucket_id || '/' || target.object_path,
    jsonb_build_object('bucket_id', target.bucket_id, 'object_path', target.object_path,
      'mime_type', normalized_mime, 'byte_size', p_byte_size));
end;
$$;

create or replace function public.record_completed_media_storage_mutation(p_operation text, p_object_path text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  normalized_operation text := lower(trim(p_operation));
  normalized_path text := trim(p_object_path);
  audit_event_id bigint;
  company bigint;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'GD_AUTHENTICATION_REQUIRED';
  end if;
  if normalized_operation is null or normalized_operation not in ('insert', 'update', 'delete') then
    raise exception using errcode = '22023', message = 'GD_INVALID_STORAGE_OPERATION';
  end if;
  if normalized_path is null or normalized_path = '' then
    raise exception using errcode = '22023', message = 'GD_INVALID_STORAGE_PATH';
  end if;
  select media_asset.organization_id into company
  from public.media_assets as media_asset
  where media_asset.bucket_id = 'product-images' and media_asset.object_path = normalized_path;
  if normalized_operation = 'delete' then
    perform private.require_org_role(company,
      array['owner'::public.staff_role, 'admin'::public.staff_role], 'GD_STORAGE_MANAGER_REQUIRED');
  else
    perform private.require_org_role(company,
      array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role],
      'GD_STORAGE_STAFF_REQUIRED');
  end if;
  if not exists (
    select 1 from public.media_assets as media_asset
    where media_asset.bucket_id = 'product-images'
      and media_asset.object_path = normalized_path
      and (normalized_operation <> 'insert' or media_asset.uploaded_by = actor_id)
  ) then
    raise exception using errcode = 'P0002', message = 'GD_MEDIA_ASSET_NOT_FOUND';
  end if;
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, after_state)
  values (company, actor_id, 'storage.' || normalized_operation || '.completed', 'storage.objects',
    'product-images/' || normalized_path,
    jsonb_build_object('bucket_id', 'product-images', 'object_path', normalized_path, 'operation', normalized_operation))
  returning id into audit_event_id;
  return audit_event_id;
end;
$$;

create or replace function public.swap_media_asset_associations(p_old_media_asset_id bigint, p_new_media_asset_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  updated_count integer;
  old_asset_unused boolean;
  companies bigint[];
  company bigint;
begin
  select array_agg(distinct organization_id) into companies
  from public.media_assets where id in (p_old_media_asset_id, p_new_media_asset_id);
  company := companies[1];
  perform private.require_org_role(company,
    array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role],
    'GD_PRODUCT_STAFF_REQUIRED');
  if p_old_media_asset_id is null or p_new_media_asset_id is null or p_old_media_asset_id = p_new_media_asset_id
    or coalesce(cardinality(companies), 0) > 1 then
    raise exception using errcode = '22023', message = 'GD_INVALID_MEDIA_SWAP';
  end if;
  perform 1 from public.media_assets as media_asset
  where media_asset.id in (p_old_media_asset_id, p_new_media_asset_id)
  order by media_asset.id for update;
  if (select count(*) from public.media_assets where id in (p_old_media_asset_id, p_new_media_asset_id)) <> 2 then
    raise exception using errcode = 'P0002', message = 'GD_MEDIA_ASSET_NOT_FOUND';
  end if;
  if not exists (
    select 1 from public.media_assets as media_asset
    where media_asset.id = p_new_media_asset_id and media_asset.status = 'ready'::public.media_asset_status
  ) then
    raise exception using errcode = '23514', message = 'GD_MEDIA_NOT_READY';
  end if;
  update public.product_images set media_asset_id = p_new_media_asset_id where media_asset_id = p_old_media_asset_id;
  get diagnostics updated_count = row_count;
  old_asset_unused := not exists (select 1 from public.product_images where media_asset_id = p_old_media_asset_id);
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, after_state)
  values (company, actor_id, 'catalog.media.associations_swapped', 'media_assets', p_old_media_asset_id::text,
    jsonb_build_object('old_media_asset_id', p_old_media_asset_id, 'new_media_asset_id', p_new_media_asset_id,
      'updated_count', updated_count, 'old_asset_unused', old_asset_unused));
  return jsonb_build_object('updated_count', updated_count, 'old_asset_unused', old_asset_unused);
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Bundles, coupons, promotions: created in the company named by the caller.
-- ---------------------------------------------------------------------------------------

drop function public.save_bundle_with_items(jsonb, jsonb);
create function public.save_bundle_with_items(p_organization_id bigint, p_bundle jsonb, p_items jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_bundle_id bigint;
  existing_bundle public.bundles%rowtype;
  normalized_slug text;
  item_count integer;
begin
  perform private.require_org_role(p_organization_id,
    array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role],
    'GD_BUNDLE_STAFF_REQUIRED');
  if p_organization_id is null or jsonb_typeof(p_bundle) <> 'object' or jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = '22023', message = 'GD_INVALID_BUNDLE_PAYLOAD';
  end if;
  if p_bundle - array[
    'id', 'slug', 'eyebrow', 'title_line_one', 'title_line_two', 'description',
    'price_cents', 'compare_at_price_cents', 'hero_product_id', 'media_asset_id',
    'availability_override', 'sort_order', 'active', 'starts_at', 'ends_at'
  ] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'GD_INVALID_BUNDLE_PAYLOAD';
  end if;
  normalized_slug := lower(trim(p_bundle ->> 'slug'));
  if normalized_slug is null or normalized_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or nullif(trim(p_bundle ->> 'eyebrow'), '') is null
    or nullif(trim(p_bundle ->> 'title_line_one'), '') is null
    or nullif(trim(p_bundle ->> 'title_line_two'), '') is null
    or nullif(trim(p_bundle ->> 'description'), '') is null then
    raise exception using errcode = '22023', message = 'GD_INVALID_BUNDLE_CONTENT';
  end if;
  select count(*)::integer into item_count from jsonb_array_elements(p_items);
  if item_count < 1 or item_count > 100
    or exists (
      select 1 from jsonb_array_elements(p_items) as item(value)
      where jsonb_typeof(item.value) <> 'object'
        or item.value - array['product_id', 'quantity', 'sort_order'] <> '{}'::jsonb
        or coalesce((item.value ->> 'product_id')::bigint, 0) <= 0
        or coalesce((item.value ->> 'quantity')::integer, 0) <= 0
        or coalesce((item.value ->> 'sort_order')::integer, -1) < 0
    )
    or (select count(distinct (item.value ->> 'product_id')::bigint) from jsonb_array_elements(p_items) as item(value)) <> item_count then
    raise exception using errcode = '22023', message = 'GD_INVALID_BUNDLE_ITEMS';
  end if;
  target_bundle_id := nullif(p_bundle ->> 'id', '')::bigint;
  if target_bundle_id is null then
    insert into public.bundles (
      organization_id, slug, eyebrow, title_line_one, title_line_two, description,
      price_cents, compare_at_price_cents, hero_product_id, media_asset_id,
      availability_override, sort_order, active, starts_at, ends_at
    ) values (
      p_organization_id, normalized_slug, trim(p_bundle ->> 'eyebrow'), trim(p_bundle ->> 'title_line_one'),
      trim(p_bundle ->> 'title_line_two'), trim(p_bundle ->> 'description'),
      (p_bundle ->> 'price_cents')::integer,
      (p_bundle ->> 'compare_at_price_cents')::integer,
      (p_bundle ->> 'hero_product_id')::bigint,
      nullif(p_bundle ->> 'media_asset_id', '')::bigint,
      nullif(p_bundle ->> 'availability_override', '')::public.availability_override,
      coalesce((p_bundle ->> 'sort_order')::integer, 0),
      coalesce((p_bundle ->> 'active')::boolean, false),
      nullif(p_bundle ->> 'starts_at', '')::timestamptz,
      nullif(p_bundle ->> 'ends_at', '')::timestamptz
    ) returning id into target_bundle_id;
  else
    select bundle.* into existing_bundle from public.bundles as bundle
    where bundle.id = target_bundle_id and bundle.organization_id = p_organization_id for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'GD_BUNDLE_NOT_FOUND';
    end if;
    update public.bundles set
      slug = normalized_slug,
      eyebrow = trim(p_bundle ->> 'eyebrow'),
      title_line_one = trim(p_bundle ->> 'title_line_one'),
      title_line_two = trim(p_bundle ->> 'title_line_two'),
      description = trim(p_bundle ->> 'description'),
      price_cents = (p_bundle ->> 'price_cents')::integer,
      compare_at_price_cents = (p_bundle ->> 'compare_at_price_cents')::integer,
      hero_product_id = (p_bundle ->> 'hero_product_id')::bigint,
      media_asset_id = nullif(p_bundle ->> 'media_asset_id', '')::bigint,
      availability_override = nullif(p_bundle ->> 'availability_override', '')::public.availability_override,
      sort_order = coalesce((p_bundle ->> 'sort_order')::integer, 0),
      active = coalesce((p_bundle ->> 'active')::boolean, false),
      starts_at = nullif(p_bundle ->> 'starts_at', '')::timestamptz,
      ends_at = nullif(p_bundle ->> 'ends_at', '')::timestamptz
    where id = target_bundle_id;
  end if;
  delete from public.bundle_items where bundle_items.bundle_id = target_bundle_id;
  insert into public.bundle_items (bundle_id, product_id, quantity, sort_order)
  select target_bundle_id, (item.value ->> 'product_id')::bigint, (item.value ->> 'quantity')::integer, (item.value ->> 'sort_order')::integer
  from jsonb_array_elements(p_items) as item(value);
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, after_state)
  values (p_organization_id, actor_id, 'catalog.bundle.saved', 'bundles', target_bundle_id::text,
    jsonb_build_object('item_count', item_count, 'slug', normalized_slug));
  return target_bundle_id;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'GD_INVALID_BUNDLE_PAYLOAD';
end;
$$;
revoke all on function public.save_bundle_with_items(bigint, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_bundle_with_items(bigint, jsonb, jsonb) to authenticated;

drop function public.save_coupon_with_targets(jsonb, bigint[], bigint[], bigint[]);
create function public.save_coupon_with_targets(
  p_organization_id bigint,
  p_coupon jsonb,
  p_product_ids bigint[],
  p_category_ids bigint[],
  p_bundle_ids bigint[]
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id bigint := nullif(p_coupon ->> 'id', '')::bigint;
begin
  perform private.require_org_role(p_organization_id,
    array['owner'::public.staff_role, 'admin'::public.staff_role], 'GD_COUPON_MANAGER_REQUIRED');
  if p_organization_id is null then
    raise exception using errcode = '22023', message = 'GD_ORGANIZATION_REQUIRED';
  end if;
  p_product_ids := coalesce(p_product_ids, array[]::bigint[]);
  p_category_ids := coalesce(p_category_ids, array[]::bigint[]);
  p_bundle_ids := coalesce(p_bundle_ids, array[]::bigint[]);
  if exists (select unnest(p_product_ids) except select id from public.products where organization_id = p_organization_id)
    or exists (select unnest(p_category_ids) except select id from public.categories where organization_id = p_organization_id)
    or exists (select unnest(p_bundle_ids) except select id from public.bundles where organization_id = p_organization_id) then
    raise exception using errcode = '23503', message = 'GD_COUPON_TARGET_NOT_FOUND';
  end if;
  if target_id is null then
    insert into public.coupons (
      organization_id, code, discount_kind, discount_value, free_shipping, minimum_subtotal_cents,
      maximum_discount_cents, usage_limit, per_customer_limit, first_purchase_only,
      starts_at, expires_at, active, disabled_at
    ) values (
      p_organization_id, upper(trim(p_coupon ->> 'code')), (p_coupon ->> 'discount_kind')::public.discount_kind,
      (p_coupon ->> 'discount_value')::integer, (p_coupon ->> 'free_shipping')::boolean,
      (p_coupon ->> 'minimum_subtotal_cents')::integer,
      nullif(p_coupon ->> 'maximum_discount_cents', '')::integer,
      nullif(p_coupon ->> 'usage_limit', '')::integer, nullif(p_coupon ->> 'per_customer_limit', '')::integer,
      (p_coupon ->> 'first_purchase_only')::boolean, nullif(p_coupon ->> 'starts_at', '')::timestamptz,
      nullif(p_coupon ->> 'expires_at', '')::timestamptz, (p_coupon ->> 'active')::boolean, null
    ) returning id into target_id;
  else
    update public.coupons set
      code = upper(trim(p_coupon ->> 'code')), discount_kind = (p_coupon ->> 'discount_kind')::public.discount_kind,
      discount_value = (p_coupon ->> 'discount_value')::integer, free_shipping = (p_coupon ->> 'free_shipping')::boolean,
      minimum_subtotal_cents = (p_coupon ->> 'minimum_subtotal_cents')::integer,
      maximum_discount_cents = nullif(p_coupon ->> 'maximum_discount_cents', '')::integer,
      usage_limit = nullif(p_coupon ->> 'usage_limit', '')::integer,
      per_customer_limit = nullif(p_coupon ->> 'per_customer_limit', '')::integer,
      first_purchase_only = (p_coupon ->> 'first_purchase_only')::boolean,
      starts_at = nullif(p_coupon ->> 'starts_at', '')::timestamptz,
      expires_at = nullif(p_coupon ->> 'expires_at', '')::timestamptz,
      active = (p_coupon ->> 'active')::boolean, disabled_at = null
    where id = target_id and organization_id = p_organization_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'GD_COUPON_NOT_FOUND';
    end if;
  end if;
  delete from public.coupon_products where coupon_id = target_id;
  delete from public.coupon_categories where coupon_id = target_id;
  delete from public.coupon_bundles where coupon_id = target_id;
  insert into public.coupon_products (coupon_id, product_id) select target_id, id from unnest(p_product_ids) as ids(id);
  insert into public.coupon_categories (coupon_id, category_id) select target_id, id from unnest(p_category_ids) as ids(id);
  insert into public.coupon_bundles (coupon_id, bundle_id) select target_id, id from unnest(p_bundle_ids) as ids(id);
  return target_id;
end;
$$;
revoke all on function public.save_coupon_with_targets(bigint, jsonb, bigint[], bigint[], bigint[]) from public, anon, authenticated;
grant execute on function public.save_coupon_with_targets(bigint, jsonb, bigint[], bigint[], bigint[]) to authenticated;

create or replace function public.duplicate_coupon_with_targets(p_coupon_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  source public.coupons%rowtype;
  target_id bigint;
begin
  perform private.require_org_role(
    (select organization_id from public.coupons where id = p_coupon_id),
    array['owner'::public.staff_role, 'admin'::public.staff_role], 'GD_COUPON_MANAGER_REQUIRED');
  select * into source from public.coupons where id = p_coupon_id for share;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_COUPON_NOT_FOUND';
  end if;
  insert into public.coupons (
    organization_id, code, discount_kind, discount_value, minimum_subtotal_cents, maximum_discount_cents,
    usage_limit, used_count, starts_at, expires_at, active, free_shipping, per_customer_limit,
    first_purchase_only, disabled_at
  ) values (
    source.organization_id, source.code || '-COPIA', source.discount_kind, source.discount_value, source.minimum_subtotal_cents,
    source.maximum_discount_cents, source.usage_limit, 0, source.starts_at, source.expires_at, false,
    source.free_shipping, source.per_customer_limit, source.first_purchase_only, null
  ) returning id into target_id;
  insert into public.coupon_products (coupon_id, product_id)
  select target_id, product_id from public.coupon_products where coupon_id = p_coupon_id;
  insert into public.coupon_categories (coupon_id, category_id)
  select target_id, category_id from public.coupon_categories where coupon_id = p_coupon_id;
  insert into public.coupon_bundles (coupon_id, bundle_id)
  select target_id, bundle_id from public.coupon_bundles where coupon_id = p_coupon_id;
  return target_id;
end;
$$;

drop function public.save_promotion_with_targets(jsonb, bigint[], bigint[], bigint[]);
create function public.save_promotion_with_targets(
  p_organization_id bigint,
  p_promotion jsonb,
  p_product_ids bigint[],
  p_category_ids bigint[],
  p_bundle_ids bigint[]
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id bigint := nullif(p_promotion ->> 'id', '')::bigint;
begin
  perform private.require_org_role(p_organization_id,
    array['owner'::public.staff_role, 'admin'::public.staff_role], 'GD_PROMOTION_MANAGER_REQUIRED');
  if p_organization_id is null then
    raise exception using errcode = '22023', message = 'GD_ORGANIZATION_REQUIRED';
  end if;
  p_product_ids := coalesce(p_product_ids, array[]::bigint[]);
  p_category_ids := coalesce(p_category_ids, array[]::bigint[]);
  p_bundle_ids := coalesce(p_bundle_ids, array[]::bigint[]);
  if exists (select unnest(p_product_ids) except select id from public.products where organization_id = p_organization_id)
    or exists (select unnest(p_category_ids) except select id from public.categories where organization_id = p_organization_id)
    or exists (select unnest(p_bundle_ids) except select id from public.bundles where organization_id = p_organization_id) then
    raise exception using errcode = '23503', message = 'GD_PROMOTION_TARGET_NOT_FOUND';
  end if;
  if target_id is null then
    insert into public.promotions (
      organization_id, name, description, discount_kind, discount_value, minimum_subtotal_cents,
      minimum_quantity, priority, stackable, starts_at, ends_at, active
    ) values (
      p_organization_id, p_promotion ->> 'name', nullif(p_promotion ->> 'description', ''),
      (p_promotion ->> 'discount_kind')::public.promotion_discount_kind,
      (p_promotion ->> 'discount_value')::integer,
      (p_promotion ->> 'minimum_subtotal_cents')::integer,
      (p_promotion ->> 'minimum_quantity')::integer, (p_promotion ->> 'priority')::integer,
      (p_promotion ->> 'stackable')::boolean, nullif(p_promotion ->> 'starts_at', '')::timestamptz,
      nullif(p_promotion ->> 'ends_at', '')::timestamptz, (p_promotion ->> 'active')::boolean
    ) returning id into target_id;
  else
    update public.promotions set
      name = p_promotion ->> 'name', description = nullif(p_promotion ->> 'description', ''),
      discount_kind = (p_promotion ->> 'discount_kind')::public.promotion_discount_kind,
      discount_value = (p_promotion ->> 'discount_value')::integer,
      minimum_subtotal_cents = (p_promotion ->> 'minimum_subtotal_cents')::integer,
      minimum_quantity = (p_promotion ->> 'minimum_quantity')::integer,
      priority = (p_promotion ->> 'priority')::integer, stackable = (p_promotion ->> 'stackable')::boolean,
      starts_at = nullif(p_promotion ->> 'starts_at', '')::timestamptz,
      ends_at = nullif(p_promotion ->> 'ends_at', '')::timestamptz, active = (p_promotion ->> 'active')::boolean
    where id = target_id and organization_id = p_organization_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'GD_PROMOTION_NOT_FOUND';
    end if;
  end if;
  delete from public.promotion_products where promotion_id = target_id;
  delete from public.promotion_categories where promotion_id = target_id;
  delete from public.promotion_bundles where promotion_id = target_id;
  insert into public.promotion_products (promotion_id, product_id) select target_id, id from unnest(p_product_ids) as ids(id);
  insert into public.promotion_categories (promotion_id, category_id) select target_id, id from unnest(p_category_ids) as ids(id);
  insert into public.promotion_bundles (promotion_id, bundle_id) select target_id, id from unnest(p_bundle_ids) as ids(id);
  return target_id;
end;
$$;
revoke all on function public.save_promotion_with_targets(bigint, jsonb, bigint[], bigint[], bigint[]) from public, anon, authenticated;
grant execute on function public.save_promotion_with_targets(bigint, jsonb, bigint[], bigint[], bigint[]) to authenticated;

-- ---------------------------------------------------------------------------------------
-- CMS.
-- ---------------------------------------------------------------------------------------

drop function public.save_homepage_section(jsonb, bigint[]);
create function public.save_homepage_section(p_organization_id bigint, p_section jsonb, p_target_ids bigint[])
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_section_id bigint;
  normalized_type public.homepage_section_type;
  normalized_status public.publication_status;
begin
  perform private.require_org_role(p_organization_id,
    array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role],
    'GD_CMS_STAFF_REQUIRED');
  if p_organization_id is null or jsonb_typeof(p_section) <> 'object' or p_section - array[
    'id', 'section_key', 'section_type', 'eyebrow', 'title', 'subtitle', 'description',
    'desktop_media_asset_id', 'mobile_media_asset_id', 'cta_label', 'cta_href',
    'publication_status', 'starts_at', 'ends_at', 'active', 'sort_order'
  ] <> '{}'::jsonb or p_target_ids is null or array_position(p_target_ids, null) is not null
    or (select count(distinct target_id) from unnest(p_target_ids) as target(target_id)) <> cardinality(p_target_ids) then
    raise exception using errcode = '22023', message = 'GD_INVALID_HOMEPAGE_SECTION';
  end if;
  normalized_type := (p_section ->> 'section_type')::public.homepage_section_type;
  normalized_status := coalesce(nullif(p_section ->> 'publication_status', ''), 'draft')::public.publication_status;
  if nullif(trim(p_section ->> 'section_key'), '') is null
    or trim(p_section ->> 'section_key') !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or ((p_section ->> 'cta_label') is null) <> ((p_section ->> 'cta_href') is null)
    or ((p_section ->> 'cta_href') is not null and not private.is_safe_content_link(p_section ->> 'cta_href')) then
    raise exception using errcode = '22023', message = 'GD_INVALID_HOMEPAGE_SECTION';
  end if;
  if normalized_type in ('featured_products', 'latest_drops', 'competitive_products', 'bestsellers', 'new_arrivals', 'offers', 'categories')
    and cardinality(p_target_ids) < 1 then
    raise exception using errcode = '22023', message = 'GD_INVALID_HOMEPAGE_TARGETS';
  elsif normalized_type = 'bundle' and cardinality(p_target_ids) <> 1 then
    raise exception using errcode = '22023', message = 'GD_INVALID_HOMEPAGE_TARGETS';
  elsif normalized_type not in ('featured_products', 'latest_drops', 'competitive_products', 'bestsellers', 'new_arrivals', 'offers', 'categories', 'bundle')
    and cardinality(p_target_ids) <> 0 then
    raise exception using errcode = '22023', message = 'GD_INVALID_HOMEPAGE_TARGETS';
  end if;
  target_section_id := nullif(p_section ->> 'id', '')::bigint;
  if target_section_id is null then
    insert into public.homepage_sections (
      organization_id, section_key, section_type, eyebrow, title, subtitle, description, desktop_media_asset_id,
      mobile_media_asset_id, cta_label, cta_href, publication_status, published_at, starts_at, ends_at, active, sort_order
    ) values (
      p_organization_id, trim(p_section ->> 'section_key'), normalized_type, nullif(trim(p_section ->> 'eyebrow'), ''),
      nullif(trim(p_section ->> 'title'), ''), nullif(trim(p_section ->> 'subtitle'), ''),
      nullif(trim(p_section ->> 'description'), ''),
      nullif(p_section ->> 'desktop_media_asset_id', '')::bigint, nullif(p_section ->> 'mobile_media_asset_id', '')::bigint,
      nullif(trim(p_section ->> 'cta_label'), ''), nullif(trim(p_section ->> 'cta_href'), ''), normalized_status,
      case when normalized_status = 'published' then now() else null end,
      nullif(p_section ->> 'starts_at', '')::timestamptz, nullif(p_section ->> 'ends_at', '')::timestamptz,
      coalesce((p_section ->> 'active')::boolean, false), coalesce((p_section ->> 'sort_order')::integer, 0)
    ) returning id into target_section_id;
  else
    perform 1 from public.homepage_sections
    where id = target_section_id and organization_id = p_organization_id for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'GD_HOMEPAGE_SECTION_NOT_FOUND';
    end if;
    update public.homepage_sections set
      section_key = trim(p_section ->> 'section_key'), section_type = normalized_type,
      eyebrow = nullif(trim(p_section ->> 'eyebrow'), ''), title = nullif(trim(p_section ->> 'title'), ''),
      subtitle = nullif(trim(p_section ->> 'subtitle'), ''), description = nullif(trim(p_section ->> 'description'), ''),
      desktop_media_asset_id = nullif(p_section ->> 'desktop_media_asset_id', '')::bigint,
      mobile_media_asset_id = nullif(p_section ->> 'mobile_media_asset_id', '')::bigint,
      cta_label = nullif(trim(p_section ->> 'cta_label'), ''), cta_href = nullif(trim(p_section ->> 'cta_href'), ''),
      publication_status = normalized_status,
      published_at = case when normalized_status = 'published' then coalesce(published_at, now()) else null end,
      starts_at = nullif(p_section ->> 'starts_at', '')::timestamptz, ends_at = nullif(p_section ->> 'ends_at', '')::timestamptz,
      active = coalesce((p_section ->> 'active')::boolean, false), sort_order = coalesce((p_section ->> 'sort_order')::integer, 0)
    where id = target_section_id;
  end if;
  delete from public.homepage_section_products where section_id = target_section_id;
  delete from public.homepage_section_categories where section_id = target_section_id;
  delete from public.homepage_section_bundles where section_id = target_section_id;
  if normalized_type in ('featured_products', 'latest_drops', 'competitive_products', 'bestsellers', 'new_arrivals', 'offers') then
    insert into public.homepage_section_products (section_id, product_id, sort_order)
    select target_section_id, target_id, ordinality - 1 from unnest(p_target_ids) with ordinality as target(target_id, ordinality);
  elsif normalized_type = 'categories' then
    insert into public.homepage_section_categories (section_id, category_id, sort_order)
    select target_section_id, target_id, ordinality - 1 from unnest(p_target_ids) with ordinality as target(target_id, ordinality);
  elsif normalized_type = 'bundle' then
    insert into public.homepage_section_bundles (section_id, bundle_id, sort_order)
    select target_section_id, target_id, ordinality - 1 from unnest(p_target_ids) with ordinality as target(target_id, ordinality);
  end if;
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, after_state)
  values (p_organization_id, actor_id, 'content.homepage.saved', 'homepage_sections', target_section_id::text,
    jsonb_build_object('section_type', normalized_type, 'target_count', cardinality(p_target_ids)));
  return target_section_id;
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode = '22023', message = 'GD_INVALID_HOMEPAGE_SECTION';
end;
$$;
revoke all on function public.save_homepage_section(bigint, jsonb, bigint[]) from public, anon, authenticated;
grant execute on function public.save_homepage_section(bigint, jsonb, bigint[]) to authenticated;

create or replace function public.publish_homepage_section(p_section_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  company bigint := (select organization_id from public.homepage_sections where id = p_section_id);
begin
  perform private.require_org_role(company,
    array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role],
    'GD_CMS_STAFF_REQUIRED');
  perform 1 from public.homepage_sections where id = p_section_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_HOMEPAGE_SECTION_NOT_FOUND';
  end if;
  update public.homepage_sections set publication_status = 'published', published_at = now(), active = true
  where id = p_section_id;
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, after_state)
  values (company, actor_id, 'content.homepage.published', 'homepage_sections', p_section_id::text,
    jsonb_build_object('published', true));
end;
$$;

-- The order covers every homepage section of the company, and only them.
create or replace function public.reorder_homepage_sections(p_section_ids bigint[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  section_count integer;
  companies bigint[];
  company bigint;
begin
  select array_agg(distinct organization_id) into companies from public.homepage_sections where id = any(p_section_ids);
  company := companies[1];
  perform private.require_org_role(company,
    array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role],
    'GD_CMS_STAFF_REQUIRED');
  if p_section_ids is null or array_length(p_section_ids, 1) is null or array_position(p_section_ids, null) is not null
    or (select count(distinct section_id) from unnest(p_section_ids) as requested(section_id)) <> cardinality(p_section_ids)
    or coalesce(cardinality(companies), 0) <> 1 then
    raise exception using errcode = '22023', message = 'GD_HOMEPAGE_SECTION_ID_SET_MISMATCH';
  end if;
  perform 1 from public.homepage_sections where organization_id = company order by id for update;
  select count(*)::integer into section_count from public.homepage_sections where organization_id = company;
  if section_count <> cardinality(p_section_ids)
    or exists (
      select 1 from unnest(p_section_ids) as requested(id)
      left join public.homepage_sections as section on section.id = requested.id and section.organization_id = company
      where section.id is null
    ) then
    raise exception using errcode = '22023', message = 'GD_HOMEPAGE_SECTION_ID_SET_MISMATCH';
  end if;
  set constraints public.homepage_sections_sort_order_key deferred;
  with requested as (select id, ordinality - 1 as sort_order from unnest(p_section_ids) with ordinality as item(id, ordinality))
  update public.homepage_sections as section set sort_order = requested.sort_order
  from requested where section.id = requested.id;
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, after_state)
  values (company, actor_id, 'content.homepage.reordered', 'homepage_sections', 'all',
    jsonb_build_object('section_ids', to_jsonb(p_section_ids)));
end;
$$;

-- The footer is the company's: replacing it never touches another company's columns.
drop function public.save_footer_configuration(jsonb);
create function public.save_footer_configuration(p_organization_id bigint, p_configuration jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  column_record record;
  item_record record;
  social_record record;
  column_id bigint;
begin
  perform private.require_org_role(p_organization_id,
    array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role],
    'GD_CONTENT_STAFF_REQUIRED');
  if p_organization_id is null
    or jsonb_typeof(p_configuration -> 'columns') is distinct from 'array'
    or jsonb_typeof(p_configuration -> 'social_links') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'GD_FOOTER_INVALID_PAYLOAD';
  end if;
  delete from public.social_links where organization_id = p_organization_id;
  delete from public.footer_columns where organization_id = p_organization_id;
  for column_record in
    select value, ordinality - 1 as position from jsonb_array_elements(p_configuration -> 'columns') with ordinality
  loop
    insert into public.footer_columns (organization_id, column_key, title, sort_order, publication_status, active, published_at)
    values (
      p_organization_id, column_record.value ->> 'key', column_record.value ->> 'title', column_record.position,
      (column_record.value ->> 'publication_status')::public.publication_status,
      (column_record.value ->> 'active')::boolean,
      case when column_record.value ->> 'publication_status' = 'published' then now() else null end
    ) returning id into column_id;
    for item_record in
      select value, ordinality - 1 as position from jsonb_array_elements(column_record.value -> 'items') with ordinality
    loop
      insert into public.footer_items (column_id, label, href, active, sort_order)
      values (column_id, item_record.value ->> 'label', item_record.value ->> 'href',
        (item_record.value ->> 'active')::boolean, item_record.position);
    end loop;
  end loop;
  for social_record in
    select value, ordinality - 1 as position from jsonb_array_elements(p_configuration -> 'social_links') with ordinality
  loop
    insert into public.social_links (organization_id, platform_key, label, href, sort_order, publication_status, active, published_at)
    values (
      p_organization_id, social_record.value ->> 'platform_key', social_record.value ->> 'label',
      social_record.value ->> 'href', social_record.position,
      (social_record.value ->> 'publication_status')::public.publication_status,
      (social_record.value ->> 'active')::boolean,
      case when social_record.value ->> 'publication_status' = 'published' then now() else null end
    );
  end loop;
end;
$$;
revoke all on function public.save_footer_configuration(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.save_footer_configuration(bigint, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------
-- Stock, restock notices and the order checklist.
-- ---------------------------------------------------------------------------------------

drop function public.adjust_inventory(text, integer, public.inventory_reason, text);
create function public.adjust_inventory(
  p_organization_id bigint,
  p_sku text,
  p_delta integer,
  p_reason public.inventory_reason,
  p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_product public.products%rowtype;
  next_stock integer;
begin
  perform private.require_org_role(p_organization_id,
    array['owner'::public.staff_role, 'admin'::public.staff_role], 'GD_INVENTORY_MANAGER_REQUIRED');
  if p_delta is null or p_delta = 0 then
    raise exception using errcode = '22023', message = 'GD_INVALID_STOCK_DELTA';
  end if;
  if p_reason not in ('manual_adjustment'::public.inventory_reason, 'return'::public.inventory_reason, 'damage'::public.inventory_reason) then
    raise exception using errcode = '22023', message = 'GD_INVALID_MANUAL_STOCK_REASON';
  end if;
  select product.* into target_product from public.products as product
  where product.organization_id = p_organization_id and lower(product.sku) = lower(trim(p_sku))
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_PRODUCT_NOT_FOUND';
  end if;
  next_stock := target_product.stock_quantity + p_delta;
  if next_stock < 0 then
    raise exception using errcode = '23514', message = 'GD_INSUFFICIENT_STOCK';
  end if;
  update public.products set stock_quantity = next_stock where id = target_product.id;
  insert into public.inventory_movements (product_id, delta, stock_after, reason, actor_user_id, note)
  values (target_product.id, p_delta, next_stock, p_reason, actor_id, nullif(trim(p_note), ''));
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, before_state, after_state)
  values (p_organization_id, actor_id, 'inventory.adjusted', 'products', target_product.id::text,
    jsonb_build_object('sku', target_product.sku, 'stock_quantity', target_product.stock_quantity),
    jsonb_build_object('sku', target_product.sku, 'stock_quantity', next_stock, 'delta', p_delta,
      'reason', p_reason, 'note', nullif(trim(p_note), '')));
  return next_stock;
end;
$$;
revoke all on function public.adjust_inventory(bigint, text, integer, public.inventory_reason, text) from public, anon, authenticated;
grant execute on function public.adjust_inventory(bigint, text, integer, public.inventory_reason, text) to authenticated;

-- Demand for the given products of one company; an outsider gets no rows, as before.
drop function public.get_inventory_restock_demand(text[]);
create function public.get_inventory_restock_demand(p_organization_id bigint, p_slugs text[])
returns table (product_slug text, pending_notices bigint, preorder_demand bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with _guard as (
    select private.is_org_member(p_organization_id, array['owner'::public.staff_role, 'admin'::public.staff_role]) as ok
  ),
  _slugs as (
    select unnest(p_slugs) as slug
  ),
  _notices as (
    select rr.product_slug, count(*) as cnt
    from public.restock_requests rr
    where rr.organization_id = p_organization_id
      and rr.product_slug = any(p_slugs)
      and rr.notified_at is null
    group by rr.product_slug
  ),
  _demand as (
    select p.slug, coalesce(sum(oi.preorder_quantity), 0) as total
    from public.products p
    join public.order_items oi on oi.product_id = p.id
    join public.orders o on o.id = oi.order_id
    where p.organization_id = p_organization_id
      and p.slug = any(p_slugs)
      and oi.preorder_quantity > 0
      and o.status in ('confirmed'::public.order_status, 'processing'::public.order_status)
    group by p.slug
  )
  select s.slug, coalesce(n.cnt, 0) as pending_notices, coalesce(d.total, 0) as preorder_demand
  from _slugs s
  left join _notices n on n.product_slug = s.slug
  left join _demand d on d.slug = s.slug
  where (select ok from _guard);
$$;
revoke all on function public.get_inventory_restock_demand(bigint, text[]) from public, anon, authenticated;
grant execute on function public.get_inventory_restock_demand(bigint, text[]) to authenticated;

-- Delivered notices are deleted, as the privacy page says. The six-month retention runs in
-- every company the caller manages, never in another.
create or replace function public.mark_restock_notices_sent(p_request_ids bigint[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  companies bigint[];
begin
  select array_agg(distinct organization_id) into companies from public.restock_requests where id = any(p_request_ids);
  if coalesce(cardinality(companies), 0) > 1 then
    raise exception using errcode = '22023', message = 'GD_RESTOCK_INVALID_SET';
  end if;
  perform private.require_org_role(companies[1],
    array['owner'::public.staff_role, 'admin'::public.staff_role], 'GD_RESTOCK_MANAGER_REQUIRED');
  if cardinality(p_request_ids) > 0 then
    delete from public.restock_requests where id = any(p_request_ids);
  end if;
  delete from public.restock_requests
  where created_at < now() - interval '6 months'
    and organization_id = any (private.member_organization_ids(array['owner'::public.staff_role, 'admin'::public.staff_role]));
end;
$$;

drop function public.set_manual_order_enablement_check(text, public.enablement_check_status, text);
create function public.set_manual_order_enablement_check(
  p_organization_id bigint,
  p_key text,
  p_status public.enablement_check_status,
  p_evidence text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  perform private.require_org_role(p_organization_id, array['owner'::public.staff_role], 'GD_ORDER_OWNER_REQUIRED');
  if p_organization_id is null
    or p_key in ('store_identity', 'shipping', 'catalog_stock') or p_status = 'pending'
    or nullif(trim(p_evidence), '') is null or char_length(trim(p_evidence)) > 1000 then
    raise exception using errcode = '22023', message = 'GD_ORDER_CHECK_INVALID';
  end if;
  update public.order_enablement_checks
  set status = p_status, evidence = trim(p_evidence), verified_at = now(), verified_by = actor_id
  where organization_id = p_organization_id and key = p_key;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_ORDER_CHECK_NOT_FOUND';
  end if;
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, after_state)
  values (p_organization_id, actor_id, 'store.order_check_verified', 'order_enablement_checks', p_key,
    jsonb_build_object('status', p_status, 'evidence', trim(p_evidence)));
end;
$$;
revoke all on function public.set_manual_order_enablement_check(bigint, text, public.enablement_check_status, text) from public, anon, authenticated;
grant execute on function public.set_manual_order_enablement_check(bigint, text, public.enablement_check_status, text) to authenticated;

commit;
