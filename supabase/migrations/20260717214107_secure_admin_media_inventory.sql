revoke all privileges on public.media_assets from anon, authenticated;
revoke all privileges on sequence public.media_assets_id_seq from anon, authenticated;

grant select, insert, update, delete on public.media_assets to authenticated;
grant usage, select on sequence public.media_assets_id_seq to authenticated;

create policy media_assets_staff_read on public.media_assets
for select to authenticated
using (
  (select private.has_staff_role(
    array[
      'owner'::public.staff_role,
      'admin'::public.staff_role,
      'editor'::public.staff_role
    ]
  ))
);

create policy media_assets_content_staff_insert on public.media_assets
for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and (select private.has_staff_role(
    array[
      'owner'::public.staff_role,
      'admin'::public.staff_role,
      'editor'::public.staff_role
    ]
  ))
);

create policy media_assets_content_staff_update on public.media_assets
for update to authenticated
using (
  (select private.has_staff_role(
    array[
      'owner'::public.staff_role,
      'admin'::public.staff_role,
      'editor'::public.staff_role
    ]
  ))
)
with check (
  (select private.has_staff_role(
    array[
      'owner'::public.staff_role,
      'admin'::public.staff_role,
      'editor'::public.staff_role
    ]
  ))
);

create policy media_assets_manager_delete on public.media_assets
for delete to authenticated
using (
  (select private.has_staff_role(
    array[
      'owner'::public.staff_role,
      'admin'::public.staff_role
    ]
  ))
);

create or replace function private.is_public_product_image_object(
  candidate_bucket_id text,
  candidate_object_path text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    candidate_bucket_id = 'product-images'
    and exists (
      select 1
      from public.media_assets as media_asset
      join public.product_images as product_image
        on product_image.media_asset_id = media_asset.id
      where media_asset.bucket_id = candidate_bucket_id
        and media_asset.object_path = candidate_object_path
        and product_image.published
        and private.is_public_product(product_image.product_id)
    );
$$;

revoke all on function private.is_public_product_image_object(text, text) from public, anon, authenticated;
grant execute on function private.is_public_product_image_object(text, text) to anon, authenticated;

-- Task 4 server actions call this only after the Storage API succeeds. It
-- records completion without mutating the official Storage schema; Task 4
-- owns compensation if this audit/metadata step fails after object mutation.
create or replace function public.record_completed_media_storage_mutation(
  p_operation text,
  p_object_path text
)
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
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'GD_AUTHENTICATION_REQUIRED';
  end if;

  if normalized_operation is null
    or normalized_operation not in ('insert', 'update', 'delete') then
    raise exception using errcode = '22023', message = 'GD_INVALID_STORAGE_OPERATION';
  end if;

  if normalized_path is null or normalized_path = '' then
    raise exception using errcode = '22023', message = 'GD_INVALID_STORAGE_PATH';
  end if;

  if normalized_operation = 'delete' then
    if not private.has_staff_role(
      array['owner'::public.staff_role, 'admin'::public.staff_role]
    ) then
      raise exception using errcode = '42501', message = 'GD_STORAGE_MANAGER_REQUIRED';
    end if;
  elsif not private.has_staff_role(
    array[
      'owner'::public.staff_role,
      'admin'::public.staff_role,
      'editor'::public.staff_role
    ]
  ) then
    raise exception using errcode = '42501', message = 'GD_STORAGE_STAFF_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.media_assets as media_asset
    where media_asset.bucket_id = 'product-images'
      and media_asset.object_path = normalized_path
      and (
        normalized_operation <> 'insert'
        or media_asset.uploaded_by = actor_id
      )
  ) then
    raise exception using errcode = 'P0002', message = 'GD_MEDIA_ASSET_NOT_FOUND';
  end if;

  insert into public.audit_events (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    after_state
  ) values (
    actor_id,
    'storage.' || normalized_operation || '.completed',
    'storage.objects',
    'product-images/' || normalized_path,
    jsonb_build_object(
      'bucket_id', 'product-images',
      'object_path', normalized_path,
      'operation', normalized_operation
    )
  )
  returning id into audit_event_id;

  return audit_event_id;
end;
$$;

revoke all on function public.record_completed_media_storage_mutation(text, text)
from public, anon, authenticated, service_role;
grant execute on function public.record_completed_media_storage_mutation(text, text)
to authenticated;

create policy product_images_public_object_read on storage.objects
for select to anon, authenticated
using (
  bucket_id = 'product-images'
  and storage.allow_any_operation(
    array['object.get_authenticated_info', 'object.get_authenticated']
  )
  and (select private.is_public_product_image_object(bucket_id, name))
);

create policy product_images_staff_object_read on storage.objects
for select to authenticated
using (
  bucket_id = 'product-images'
  and (select private.has_staff_role(
    array[
      'owner'::public.staff_role,
      'admin'::public.staff_role,
      'editor'::public.staff_role
    ]
  ))
);

create policy product_images_content_staff_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'product-images'
  and owner_id = (select auth.uid()::text)
  and exists (
    select 1
    from public.media_assets as media_asset
    where media_asset.bucket_id = storage.objects.bucket_id
      and media_asset.object_path = storage.objects.name
      and (
        media_asset.uploaded_by = (select auth.uid())
        or storage.allow_only_operation('object.upload_update')
      )
  )
  and (select private.has_staff_role(
    array[
      'owner'::public.staff_role,
      'admin'::public.staff_role,
      'editor'::public.staff_role
    ]
  ))
);

create policy product_images_content_staff_update on storage.objects
for update to authenticated
using (
  bucket_id = 'product-images'
  and exists (
    select 1
    from public.media_assets as media_asset
    where media_asset.bucket_id = storage.objects.bucket_id
      and media_asset.object_path = storage.objects.name
  )
  and (select private.has_staff_role(
    array[
      'owner'::public.staff_role,
      'admin'::public.staff_role,
      'editor'::public.staff_role
    ]
  ))
)
with check (
  bucket_id = 'product-images'
  and exists (
    select 1
    from public.media_assets as media_asset
    where media_asset.bucket_id = storage.objects.bucket_id
      and media_asset.object_path = storage.objects.name
  )
  and (select private.has_staff_role(
    array[
      'owner'::public.staff_role,
      'admin'::public.staff_role,
      'editor'::public.staff_role
    ]
  ))
);

create policy product_images_manager_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'product-images'
  and exists (
    select 1
    from public.media_assets as media_asset
    where media_asset.bucket_id = storage.objects.bucket_id
      and media_asset.object_path = storage.objects.name
  )
  and (select private.has_staff_role(
    array[
      'owner'::public.staff_role,
      'admin'::public.staff_role
    ]
  ))
);

create or replace function private.audit_admin_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  before_row jsonb;
  after_row jsonb;
  entity_row jsonb;
  entity_key text;
begin
  -- Seed and reviewed direct-database maintenance have no request actor.
  if actor_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if not private.has_staff_role(
    array[
      'owner'::public.staff_role,
      'admin'::public.staff_role,
      'editor'::public.staff_role
    ]
  ) then
    raise exception using errcode = '42501', message = 'GD_STAFF_REQUIRED';
  end if;

  before_row := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  after_row := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  entity_row := coalesce(after_row, before_row);
  entity_key := coalesce(
    entity_row ->> 'id',
    nullif(
      concat_ws(
        ':',
        entity_row ->> 'product_id',
        entity_row ->> 'related_product_id',
        entity_row ->> 'media_asset_id',
        entity_row ->> 'tag',
        entity_row ->> 'relation_type',
        entity_row ->> 'sort_order'
      ),
      ''
    ),
    'unknown'
  );

  insert into public.audit_events (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    before_state,
    after_state
  ) values (
    actor_id,
    lower(tg_op),
    tg_table_name,
    entity_key,
    before_row,
    after_row
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.audit_admin_mutation() from public, anon, authenticated, service_role;

create trigger products_audit_admin_mutation
after insert or update or delete on public.products
for each row execute function private.audit_admin_mutation();
create trigger media_assets_audit_admin_mutation
after insert or update or delete on public.media_assets
for each row execute function private.audit_admin_mutation();
create trigger product_images_audit_admin_mutation
after insert or update or delete on public.product_images
for each row execute function private.audit_admin_mutation();
create trigger product_specs_audit_admin_mutation
after insert or update or delete on public.product_specs
for each row execute function private.audit_admin_mutation();
create trigger product_features_audit_admin_mutation
after insert or update or delete on public.product_features
for each row execute function private.audit_admin_mutation();
create trigger product_box_contents_audit_admin_mutation
after insert or update or delete on public.product_box_contents
for each row execute function private.audit_admin_mutation();
create trigger product_tags_audit_admin_mutation
after insert or update or delete on public.product_tags
for each row execute function private.audit_admin_mutation();
create trigger product_relations_audit_admin_mutation
after insert or update or delete on public.product_relations
for each row execute function private.audit_admin_mutation();

grant insert (
  short_name,
  manage_stock,
  low_stock_threshold,
  allow_backorder,
  preorder_release_date,
  seo_title,
  seo_description
) on public.products to authenticated;
grant update (
  short_name,
  manage_stock,
  low_stock_threshold,
  allow_backorder,
  preorder_release_date,
  seo_title,
  seo_description
) on public.products to authenticated;

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
  target_product public.products%rowtype;
  next_stock integer;
begin
  if not private.has_staff_role(
    array[
      'owner'::public.staff_role,
      'admin'::public.staff_role
    ]
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

  update public.products
  set stock_quantity = next_stock
  where id = target_product.id;

  insert into public.inventory_movements (
    product_id,
    delta,
    stock_after,
    reason,
    actor_user_id,
    note
  ) values (
    target_product.id,
    p_delta,
    next_stock,
    p_reason,
    (select auth.uid()),
    nullif(trim(p_note), '')
  );

  return next_stock;
end;
$$;

revoke all on function public.adjust_inventory(text, integer, public.inventory_reason, text)
from public, anon, authenticated;
grant execute on function public.adjust_inventory(text, integer, public.inventory_reason, text)
to authenticated;
revoke update (stock_quantity) on public.products from anon, authenticated;
