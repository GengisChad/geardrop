create or replace function public.duplicate_product_draft(
  p_source_product_id bigint,
  p_name text,
  p_slug text,
  p_sku text
)
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
  if not private.has_staff_role(
    array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role]
  ) then
    raise exception using errcode = '42501', message = 'GD_PRODUCT_STAFF_REQUIRED';
  end if;

  if nullif(normalized_name, '') is null
    or nullif(normalized_slug, '') is null
    or nullif(normalized_sku, '') is null
    or normalized_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or normalized_sku !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception using errcode = '22023', message = 'GD_INVALID_PRODUCT_DUPLICATE_IDENTITY';
  end if;

  select product.*
  into source_product
  from public.products as product
  where product.id = p_source_product_id
  for share;

  if not found then
    raise exception using errcode = 'P0002', message = 'GD_PRODUCT_NOT_FOUND';
  end if;

  insert into public.products (
    category_id, slug, sku, name, tagline, description,
    price_cents, compare_at_price_cents, currency,
    publication_status, active, stock_quantity,
    availability_override, preorder_allocation, blade_type,
    rating, review_count, sort_order, short_name,
    manage_stock, low_stock_threshold, allow_backorder,
    preorder_release_date, seo_title, seo_description
  ) values (
    source_product.category_id, normalized_slug, normalized_sku, normalized_name,
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
  from public.product_specs as detail
  where detail.product_id = source_product.id
  order by detail.sort_order, detail.id;

  insert into public.product_features (product_id, title, description, sort_order)
  select new_product_id, detail.title, detail.description, detail.sort_order
  from public.product_features as detail
  where detail.product_id = source_product.id
  order by detail.sort_order, detail.id;

  insert into public.product_box_contents (product_id, content, sort_order)
  select new_product_id, detail.content, detail.sort_order
  from public.product_box_contents as detail
  where detail.product_id = source_product.id
  order by detail.sort_order, detail.id;

  insert into public.product_tags (product_id, tag)
  select new_product_id, product_tag.tag
  from public.product_tags as product_tag
  where product_tag.product_id = source_product.id;

  insert into public.product_relations (
    product_id, related_product_id, relation_type, sort_order
  )
  select new_product_id, relation.related_product_id, relation.relation_type, relation.sort_order
  from public.product_relations as relation
  where relation.product_id = source_product.id;

  insert into public.product_images (
    product_id, src, width, height, alt, sort_order, published,
    media_asset_id, is_primary
  )
  select
    new_product_id, image.src, image.width, image.height, image.alt,
    image.sort_order, false, image.media_asset_id, image.is_primary
  from public.product_images as image
  join public.media_assets as media_asset on media_asset.id = image.media_asset_id
  where image.product_id = source_product.id
    and media_asset.status = 'ready'::public.media_asset_status
  order by image.sort_order, image.id;

  insert into public.audit_events (
    actor_user_id, action, entity_type, entity_id, after_state
  ) values (
    actor_id,
    'catalog.product.duplicated',
    'products',
    new_product_id::text,
    jsonb_build_object('source_product_id', source_product.id, 'new_product_id', new_product_id)
  );

  return new_product_id;
end;
$$;

create or replace function public.bulk_update_products(
  p_product_ids bigint[],
  p_operation text,
  p_category_id bigint default null
)
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
begin
  if not private.has_staff_role(
    array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role]
  ) then
    raise exception using errcode = '42501', message = 'GD_PRODUCT_STAFF_REQUIRED';
  end if;

  requested_count := coalesce(array_length(p_product_ids, 1), 0);
  if requested_count = 0
    or exists (select 1 from unnest(p_product_ids) as product_id where product_id is null)
    or (select count(distinct product_id) from unnest(p_product_ids) as product_id) <> requested_count then
    raise exception using errcode = '22023', message = 'GD_INVALID_PRODUCT_SET';
  end if;

  if normalized_operation not in ('publish', 'draft', 'archive', 'category') then
    raise exception using errcode = '22023', message = 'GD_INVALID_BULK_PRODUCT_OPERATION';
  end if;

  if normalized_operation = 'category' and not exists (
    select 1 from public.categories as category where category.id = p_category_id
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
    update public.products
    set publication_status = 'published'::public.publication_status,
        active = true
    where id = any(p_product_ids);
  elsif normalized_operation = 'draft' then
    update public.products
    set publication_status = 'draft'::public.publication_status,
        active = false
    where id = any(p_product_ids);
  elsif normalized_operation = 'archive' then
    update public.products
    set publication_status = 'archived'::public.publication_status,
        active = false
    where id = any(p_product_ids);
  else
    update public.products
    set category_id = p_category_id
    where id = any(p_product_ids);
  end if;

  get diagnostics updated_count = row_count;

  insert into public.audit_events (
    actor_user_id, action, entity_type, entity_id, after_state
  ) values (
    actor_id,
    'catalog.products.bulk_updated',
    'products',
    array_to_string(p_product_ids, ','),
    jsonb_build_object(
      'product_ids', to_jsonb(p_product_ids),
      'operation', normalized_operation,
      'category_id', p_category_id,
      'updated_count', updated_count
    )
  );

  return updated_count;
end;
$$;

create or replace function public.replace_product_details(
  p_product_id bigint,
  p_specs jsonb,
  p_features jsonb,
  p_box_contents jsonb
)
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
begin
  if not private.has_staff_role(
    array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role]
  ) then
    raise exception using errcode = '42501', message = 'GD_PRODUCT_STAFF_REQUIRED';
  end if;

  perform 1 from public.products where id = p_product_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_PRODUCT_NOT_FOUND';
  end if;

  if jsonb_typeof(specs) <> 'array'
    or jsonb_typeof(features) <> 'array'
    or jsonb_typeof(box_contents) <> 'array' then
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

  insert into public.audit_events (
    actor_user_id, action, entity_type, entity_id, after_state
  ) values (
    actor_id,
    'catalog.product.details_replaced',
    'products',
    p_product_id::text,
    jsonb_build_object(
      'spec_count', jsonb_array_length(specs),
      'feature_count', jsonb_array_length(features),
      'box_content_count', jsonb_array_length(box_contents)
    )
  );
end;
$$;

create or replace function public.reorder_product_images(
  p_product_id bigint,
  p_image_ids bigint[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  requested_count integer := coalesce(array_length(p_image_ids, 1), 0);
  current_count integer;
begin
  if not private.has_staff_role(
    array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role]
  ) then
    raise exception using errcode = '42501', message = 'GD_PRODUCT_STAFF_REQUIRED';
  end if;

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
    select image.id
    from public.product_images as image
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
    from public.product_images as image
    where image.product_id = p_product_id
  )
  update public.product_images as image
  set sort_order = -temporary_positions.position
  from temporary_positions
  where image.id = temporary_positions.id;

  with requested_positions as (
    select image_id, ordinality::integer - 1 as position
    from unnest(p_image_ids) with ordinality as requested(image_id, ordinality)
  )
  update public.product_images as image
  set sort_order = requested_positions.position
  from requested_positions
  where image.id = requested_positions.image_id
    and image.product_id = p_product_id;

  insert into public.audit_events (
    actor_user_id, action, entity_type, entity_id, after_state
  ) values (
    actor_id,
    'catalog.product.images_reordered',
    'products',
    p_product_id::text,
    jsonb_build_object('image_ids', to_jsonb(p_image_ids))
  );
end;
$$;

create or replace function public.set_primary_product_image(
  p_product_id bigint,
  p_image_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if not private.has_staff_role(
    array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role]
  ) then
    raise exception using errcode = '42501', message = 'GD_PRODUCT_STAFF_REQUIRED';
  end if;

  perform 1
  from public.product_images as image
  where image.product_id = p_product_id
  order by image.id
  for update;

  if not exists (
    select 1 from public.product_images as image
    where image.id = p_image_id and image.product_id = p_product_id
  ) then
    raise exception using errcode = 'P0002', message = 'GD_PRODUCT_IMAGE_NOT_FOUND';
  end if;

  update public.product_images set is_primary = false where product_id = p_product_id;
  update public.product_images set is_primary = true where id = p_image_id and product_id = p_product_id;

  insert into public.audit_events (
    actor_user_id, action, entity_type, entity_id, after_state
  ) values (
    actor_id,
    'catalog.product.primary_image_set',
    'products',
    p_product_id::text,
    jsonb_build_object('image_id', p_image_id)
  );
end;
$$;

create or replace function public.swap_media_asset_associations(
  p_old_media_asset_id bigint,
  p_new_media_asset_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  updated_count integer;
  old_asset_unused boolean;
begin
  if not private.has_staff_role(
    array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role]
  ) then
    raise exception using errcode = '42501', message = 'GD_PRODUCT_STAFF_REQUIRED';
  end if;

  if p_old_media_asset_id is null
    or p_new_media_asset_id is null
    or p_old_media_asset_id = p_new_media_asset_id then
    raise exception using errcode = '22023', message = 'GD_INVALID_MEDIA_SWAP';
  end if;

  perform 1
  from public.media_assets as media_asset
  where media_asset.id in (p_old_media_asset_id, p_new_media_asset_id)
  order by media_asset.id
  for update;

  if (select count(*) from public.media_assets where id in (p_old_media_asset_id, p_new_media_asset_id)) <> 2 then
    raise exception using errcode = 'P0002', message = 'GD_MEDIA_ASSET_NOT_FOUND';
  end if;

  if not exists (
    select 1 from public.media_assets as media_asset
    where media_asset.id = p_new_media_asset_id
      and media_asset.status = 'ready'::public.media_asset_status
  ) then
    raise exception using errcode = '23514', message = 'GD_MEDIA_NOT_READY';
  end if;

  update public.product_images
  set media_asset_id = p_new_media_asset_id
  where media_asset_id = p_old_media_asset_id;
  get diagnostics updated_count = row_count;

  old_asset_unused := not exists (
    select 1 from public.product_images where media_asset_id = p_old_media_asset_id
  );

  insert into public.audit_events (
    actor_user_id, action, entity_type, entity_id, after_state
  ) values (
    actor_id,
    'catalog.media.associations_swapped',
    'media_assets',
    p_old_media_asset_id::text,
    jsonb_build_object(
      'old_media_asset_id', p_old_media_asset_id,
      'new_media_asset_id', p_new_media_asset_id,
      'updated_count', updated_count,
      'old_asset_unused', old_asset_unused
    )
  );

  return jsonb_build_object(
    'updated_count', updated_count,
    'old_asset_unused', old_asset_unused
  );
end;
$$;

create or replace function public.product_deletion_impact(p_product_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  impact jsonb;
begin
  if not private.has_staff_role(
    array['owner'::public.staff_role, 'admin'::public.staff_role]
  ) then
    raise exception using errcode = '42501', message = 'GD_PRODUCT_MANAGER_REQUIRED';
  end if;

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

create or replace function public.delete_product_permanently(
  p_product_id bigint,
  p_expected_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target public.products%rowtype;
begin
  if not private.has_staff_role(
    array['owner'::public.staff_role, 'admin'::public.staff_role]
  ) then
    raise exception using errcode = '42501', message = 'GD_PRODUCT_MANAGER_REQUIRED';
  end if;

  select product.*
  into target
  from public.products as product
  where product.id = p_product_id
  for update;

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

  insert into public.audit_events (
    actor_user_id, action, entity_type, entity_id, before_state
  ) values (
    actor_id,
    'catalog.product.deleted',
    'products',
    target.id::text,
    to_jsonb(target)
  );
end;
$$;

create or replace function public.adjust_inventory(
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
  if not private.has_staff_role(
    array['owner'::public.staff_role, 'admin'::public.staff_role]
  ) then
    raise exception using errcode = '42501', message = 'GD_INVENTORY_MANAGER_REQUIRED';
  end if;

  if p_delta is null or p_delta = 0 then
    raise exception using errcode = '22023', message = 'GD_INVALID_STOCK_DELTA';
  end if;

  if p_reason not in (
    'manual_adjustment'::public.inventory_reason,
    'return'::public.inventory_reason,
    'damage'::public.inventory_reason
  ) then
    raise exception using errcode = '22023', message = 'GD_INVALID_MANUAL_STOCK_REASON';
  end if;

  select product.*
  into target_product
  from public.products as product
  where product.sku = lower(trim(p_sku))
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'GD_PRODUCT_NOT_FOUND';
  end if;

  next_stock := target_product.stock_quantity + p_delta;
  if next_stock < 0 then
    raise exception using errcode = '23514', message = 'GD_INSUFFICIENT_STOCK';
  end if;

  update public.products set stock_quantity = next_stock where id = target_product.id;

  insert into public.inventory_movements (
    product_id, delta, stock_after, reason, actor_user_id, note
  ) values (
    target_product.id, p_delta, next_stock, p_reason, actor_id, nullif(trim(p_note), '')
  );

  insert into public.audit_events (
    actor_user_id, action, entity_type, entity_id, before_state, after_state
  ) values (
    actor_id,
    'inventory.adjusted',
    'products',
    target_product.id::text,
    jsonb_build_object('sku', target_product.sku, 'stock_quantity', target_product.stock_quantity),
    jsonb_build_object(
      'sku', target_product.sku,
      'stock_quantity', next_stock,
      'delta', p_delta,
      'reason', p_reason,
      'note', nullif(trim(p_note), '')
    )
  );

  return next_stock;
end;
$$;

revoke all on function public.duplicate_product_draft(bigint, text, text, text)
from public, anon, authenticated, service_role;
revoke all on function public.bulk_update_products(bigint[], text, bigint)
from public, anon, authenticated, service_role;
revoke all on function public.replace_product_details(bigint, jsonb, jsonb, jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.reorder_product_images(bigint, bigint[])
from public, anon, authenticated, service_role;
revoke all on function public.set_primary_product_image(bigint, bigint)
from public, anon, authenticated, service_role;
revoke all on function public.swap_media_asset_associations(bigint, bigint)
from public, anon, authenticated, service_role;
revoke all on function public.product_deletion_impact(bigint)
from public, anon, authenticated, service_role;
revoke all on function public.delete_product_permanently(bigint, text)
from public, anon, authenticated, service_role;
revoke all on function public.adjust_inventory(text, integer, public.inventory_reason, text)
from public, anon, authenticated, service_role;

grant execute on function public.duplicate_product_draft(bigint, text, text, text)
to authenticated;
grant execute on function public.bulk_update_products(bigint[], text, bigint)
to authenticated;
grant execute on function public.replace_product_details(bigint, jsonb, jsonb, jsonb)
to authenticated;
grant execute on function public.reorder_product_images(bigint, bigint[])
to authenticated;
grant execute on function public.set_primary_product_image(bigint, bigint)
to authenticated;
grant execute on function public.swap_media_asset_associations(bigint, bigint)
to authenticated;
grant execute on function public.product_deletion_impact(bigint)
to authenticated;
grant execute on function public.delete_product_permanently(bigint, text)
to authenticated;
grant execute on function public.adjust_inventory(text, integer, public.inventory_reason, text)
to authenticated;

revoke update (stock_quantity) on public.products from anon, authenticated;
