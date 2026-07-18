create type public.media_asset_status as enum ('pending', 'ready', 'failed');

alter table public.media_assets
  drop constraint media_assets_byte_size_check,
  drop constraint media_assets_width_check,
  drop constraint media_assets_height_check,
  add column status public.media_asset_status not null default 'pending',
  add column failure_code text,
  add column ready_at timestamptz;

-- Rows created before lifecycle support already describe completed objects.
update public.media_assets
set status = 'ready'::public.media_asset_status,
    ready_at = coalesce(updated_at, created_at, now());

alter table public.media_assets
  add constraint media_assets_lifecycle_metadata_check
  check (
    (
      status = 'pending'::public.media_asset_status
      and byte_size >= 0 and byte_size <= 10485760
      and width >= 0 and height >= 0
      and failure_code is null and ready_at is null
    )
    or (
      status = 'ready'::public.media_asset_status
      and byte_size > 0 and byte_size <= 10485760
      and width > 0 and height > 0
      and failure_code is null and ready_at is not null
    )
    or (
      status = 'failed'::public.media_asset_status
      and byte_size >= 0 and byte_size <= 10485760
      and width >= 0 and height >= 0
      and nullif(btrim(failure_code), '') is not null
      and length(failure_code) <= 64
      and ready_at is null
    )
  );

create index media_assets_status_created_idx
  on public.media_assets(status, created_at desc);

drop policy media_assets_content_staff_insert on public.media_assets;
create policy media_assets_content_staff_insert on public.media_assets
for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and status = 'pending'::public.media_asset_status
  and failure_code is null
  and ready_at is null
  and (select private.has_staff_role(
    array[
      'owner'::public.staff_role,
      'admin'::public.staff_role,
      'editor'::public.staff_role
    ]
  ))
);

-- Lifecycle and object identity are RPC-owned. Staff can edit descriptive
-- metadata directly, while the existing provenance trigger protects uploader.
revoke update, delete on public.media_assets from authenticated;
grant update (original_filename, alt_text, uploaded_by) on public.media_assets to authenticated;

drop policy product_images_content_staff_insert on storage.objects;
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
      and media_asset.uploaded_by = (select auth.uid())
      and media_asset.status = 'pending'::public.media_asset_status
  )
  and (select private.has_staff_role(
    array[
      'owner'::public.staff_role,
      'admin'::public.staff_role,
      'editor'::public.staff_role
    ]
  ))
);

-- Versioned paths replace object overwrites. This also prevents cross-staff
-- upserts from changing an existing object's ownership.
drop policy product_images_content_staff_update on storage.objects;

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
        and media_asset.status = 'ready'::public.media_asset_status
        and product_image.published
        and private.is_public_product(product_image.product_id)
    );
$$;

revoke all on function private.is_public_product_image_object(text, text)
from public, anon, authenticated;
grant execute on function private.is_public_product_image_object(text, text)
to anon, authenticated;

drop policy product_images_public_read on public.product_images;
create policy product_images_public_read on public.product_images
for select to anon, authenticated
using (
  published
  and (select private.is_public_product(product_id))
  and (
    media_asset_id is null
    or exists (
      select 1
      from public.media_assets as media_asset
      where media_asset.id = product_images.media_asset_id
        and media_asset.status = 'ready'::public.media_asset_status
    )
  )
);

create or replace function private.enforce_ready_product_image()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.media_asset_id is not null and not exists (
    select 1
    from public.media_assets as media_asset
    where media_asset.id = new.media_asset_id
      and media_asset.status = 'ready'::public.media_asset_status
  ) then
    raise exception using errcode = '23514', message = 'GD_MEDIA_NOT_READY';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_ready_product_image()
from public, anon, authenticated;

create trigger product_images_require_ready_media
before insert or update of media_asset_id on public.product_images
for each row execute function private.enforce_ready_product_image();

create or replace function public.finalize_media_upload(
  p_media_asset_id bigint,
  p_mime_type text,
  p_byte_size bigint,
  p_width integer,
  p_height integer
)
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

  if not private.has_staff_role(
    array[
      'owner'::public.staff_role,
      'admin'::public.staff_role,
      'editor'::public.staff_role
    ]
  ) then
    raise exception using errcode = '42501', message = 'GD_MEDIA_STAFF_REQUIRED';
  end if;

  if normalized_mime is null
    or normalized_mime not in ('image/png', 'image/jpeg', 'image/webp', 'image/avif')
    or p_byte_size is null or p_byte_size <= 0 or p_byte_size > 10485760
    or p_width is null or p_width <= 0
    or p_height is null or p_height <= 0 then
    raise exception using errcode = '22023', message = 'GD_INVALID_MEDIA_METADATA';
  end if;

  select media_asset.*
  into target
  from public.media_assets as media_asset
  where media_asset.id = p_media_asset_id
  for update;

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
    select 1
    from storage.objects as stored_object
    where stored_object.bucket_id = target.bucket_id
      and stored_object.name = target.object_path
      and stored_object.owner_id = actor_id::text
  ) then
    raise exception using errcode = 'P0002', message = 'GD_STORAGE_OBJECT_NOT_FOUND';
  end if;

  update public.media_assets
  set mime_type = normalized_mime,
      byte_size = p_byte_size,
      width = p_width,
      height = p_height,
      status = 'ready'::public.media_asset_status,
      failure_code = null,
      ready_at = now()
  where id = target.id;

  insert into public.audit_events (
    actor_user_id, action, entity_type, entity_id, after_state
  ) values (
    actor_id,
    'storage.insert.completed',
    'storage.objects',
    target.bucket_id || '/' || target.object_path,
    jsonb_build_object(
      'bucket_id', target.bucket_id,
      'object_path', target.object_path,
      'mime_type', normalized_mime,
      'byte_size', p_byte_size
    )
  );
end;
$$;

create or replace function public.fail_media_upload(
  p_media_asset_id bigint,
  p_failure_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target public.media_assets%rowtype;
  normalized_failure text := lower(trim(p_failure_code));
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'GD_AUTHENTICATION_REQUIRED';
  end if;

  if not private.has_staff_role(
    array[
      'owner'::public.staff_role,
      'admin'::public.staff_role,
      'editor'::public.staff_role
    ]
  ) then
    raise exception using errcode = '42501', message = 'GD_MEDIA_STAFF_REQUIRED';
  end if;

  if normalized_failure is null
    or normalized_failure = ''
    or length(normalized_failure) > 64
    or normalized_failure !~ '^[a-z0-9_]+$' then
    raise exception using errcode = '22023', message = 'GD_INVALID_MEDIA_FAILURE_CODE';
  end if;

  select media_asset.*
  into target
  from public.media_assets as media_asset
  where media_asset.id = p_media_asset_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'GD_MEDIA_ASSET_NOT_FOUND';
  end if;

  if target.uploaded_by <> actor_id and not private.has_staff_role(
    array['owner'::public.staff_role, 'admin'::public.staff_role]
  ) then
    raise exception using errcode = '42501', message = 'GD_MEDIA_OWNER_OR_MANAGER_REQUIRED';
  end if;

  if target.status <> 'pending'::public.media_asset_status then
    raise exception using errcode = '55000', message = 'GD_MEDIA_NOT_PENDING';
  end if;

  update public.media_assets
  set status = 'failed'::public.media_asset_status,
      failure_code = normalized_failure,
      ready_at = null
  where id = target.id;
end;
$$;

create or replace function public.begin_media_delete(p_media_asset_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.media_assets%rowtype;
begin
  if not private.has_staff_role(
    array['owner'::public.staff_role, 'admin'::public.staff_role]
  ) then
    raise exception using errcode = '42501', message = 'GD_MEDIA_MANAGER_REQUIRED';
  end if;

  select media_asset.*
  into target
  from public.media_assets as media_asset
  where media_asset.id = p_media_asset_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'GD_MEDIA_ASSET_NOT_FOUND';
  end if;

  if exists (
    select 1
    from public.product_images as product_image
    where product_image.media_asset_id = target.id
  ) then
    raise exception using errcode = '23503', message = 'GD_MEDIA_IN_USE';
  end if;

  update public.media_assets
  set status = 'failed'::public.media_asset_status,
      failure_code = 'delete_pending',
      ready_at = null
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
  if not private.has_staff_role(
    array['owner'::public.staff_role, 'admin'::public.staff_role]
  ) then
    raise exception using errcode = '42501', message = 'GD_MEDIA_MANAGER_REQUIRED';
  end if;

  select media_asset.*
  into target
  from public.media_assets as media_asset
  where media_asset.id = p_media_asset_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'GD_MEDIA_ASSET_NOT_FOUND';
  end if;

  if target.status <> 'failed'::public.media_asset_status
    or target.failure_code <> 'delete_pending' then
    raise exception using errcode = '55000', message = 'GD_MEDIA_DELETE_NOT_STARTED';
  end if;

  if exists (
    select 1
    from public.product_images as product_image
    where product_image.media_asset_id = target.id
  ) then
    raise exception using errcode = '23503', message = 'GD_MEDIA_IN_USE';
  end if;

  if exists (
    select 1
    from storage.objects as stored_object
    where stored_object.bucket_id = target.bucket_id
      and stored_object.name = target.object_path
  ) then
    raise exception using errcode = '55000', message = 'GD_STORAGE_OBJECT_STILL_EXISTS';
  end if;

  delete from public.media_assets where id = target.id;
end;
$$;

revoke all on function public.finalize_media_upload(bigint, text, bigint, integer, integer)
from public, anon, authenticated, service_role;
revoke all on function public.fail_media_upload(bigint, text)
from public, anon, authenticated, service_role;
revoke all on function public.begin_media_delete(bigint)
from public, anon, authenticated, service_role;
revoke all on function public.complete_media_delete(bigint)
from public, anon, authenticated, service_role;

grant execute on function public.finalize_media_upload(bigint, text, bigint, integer, integer)
to authenticated;
grant execute on function public.fail_media_upload(bigint, text)
to authenticated;
grant execute on function public.begin_media_delete(bigint)
to authenticated;
grant execute on function public.complete_media_delete(bigint)
to authenticated;

-- The lifecycle RPCs supersede the generic post-hoc audit endpoint.
revoke execute on function public.record_completed_media_storage_mutation(text, text)
from authenticated;
