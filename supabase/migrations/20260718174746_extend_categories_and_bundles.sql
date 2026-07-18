alter table public.categories
  add column media_asset_id bigint references public.media_assets(id) on delete set null,
  add column seo_title text check (seo_title is null or char_length(seo_title) <= 70),
  add column seo_description text check (seo_description is null or char_length(seo_description) <= 180),
  add column publication_status public.publication_status not null default 'draft',
  add column published_at timestamptz;

update public.categories
set publication_status = 'published'::public.publication_status,
    published_at = coalesce(published_at, updated_at)
where active;

alter table public.categories
  add constraint categories_publication_consistent check (
    publication_status = 'published'::public.publication_status
    or published_at is null
  ),
  add constraint categories_sort_order_key unique (sort_order);

alter table public.bundles
  add column media_asset_id bigint references public.media_assets(id) on delete set null,
  add column availability_override public.availability_override,
  add column sort_order integer not null default 0,
  add column starts_at timestamptz,
  add column ends_at timestamptz,
  add constraint bundles_publication_window check (
    starts_at is null or ends_at is null or ends_at > starts_at
  );

create index categories_publication_order_idx
  on public.categories(sort_order, id)
  where active and publication_status = 'published';
create index bundles_publication_order_idx
  on public.bundles(sort_order, id)
  where active;

create or replace function private.enforce_ready_catalog_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.media_asset_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.media_assets as media_asset
    where media_asset.id = new.media_asset_id
      and media_asset.status = 'ready'
  ) then
    raise exception using errcode = '23514', message = 'GD_MEDIA_NOT_READY';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_ready_catalog_media()
from public, anon, authenticated, service_role;

create trigger categories_enforce_ready_media
before insert or update of media_asset_id on public.categories
for each row execute function private.enforce_ready_catalog_media();
create trigger bundles_enforce_ready_media
before insert or update of media_asset_id on public.bundles
for each row execute function private.enforce_ready_catalog_media();

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
      where media_asset.bucket_id = candidate_bucket_id
        and media_asset.object_path = candidate_object_path
        and media_asset.status = 'ready'::public.media_asset_status
        and (
          exists (
            select 1
            from public.product_images as product_image
            where product_image.media_asset_id = media_asset.id
              and product_image.published
              and private.is_public_product(product_image.product_id)
          )
          or exists (
            select 1
            from public.categories as category
            where category.media_asset_id = media_asset.id
              and private.is_public_category(category.id)
          )
          or exists (
            select 1
            from public.bundles as bundle
            where bundle.media_asset_id = media_asset.id
              and private.is_public_bundle(bundle.id)
          )
        )
    );
$$;

revoke all on function private.is_public_category(bigint) from public, anon, authenticated, service_role;
grant execute on function private.is_public_category(bigint) to anon, authenticated;

drop policy categories_public_read on public.categories;
create policy categories_public_read on public.categories
for select to anon, authenticated
using ((select private.is_public_category(id)));

create or replace function private.enforce_bundle_editor_boundaries()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role]) then
    return new;
  end if;

  if not private.has_staff_role(array['editor'::public.staff_role]) then
    raise exception using errcode = '42501', message = 'GD_BUNDLE_STAFF_REQUIRED';
  end if;

  if tg_op = 'INSERT' then
    if new.price_cents <> 0
      or new.compare_at_price_cents <> 1
      or new.availability_override is not null then
      raise exception using errcode = '42501', message = 'GD_BUNDLE_MANAGER_REQUIRED';
    end if;
  elsif new.price_cents is distinct from old.price_cents
    or new.compare_at_price_cents is distinct from old.compare_at_price_cents
    or new.availability_override is distinct from old.availability_override then
    raise exception using errcode = '42501', message = 'GD_BUNDLE_MANAGER_REQUIRED';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_bundle_editor_boundaries()
from public, anon, authenticated, service_role;

create trigger bundles_enforce_editor_boundaries
before insert or update on public.bundles
for each row execute function private.enforce_bundle_editor_boundaries();

create trigger categories_audit_admin_mutation
after insert or update or delete on public.categories
for each row execute function private.audit_admin_mutation();
create trigger bundles_audit_admin_mutation
after insert or update or delete on public.bundles
for each row execute function private.audit_admin_mutation();
create trigger bundle_items_audit_admin_mutation
after insert or update or delete on public.bundle_items
for each row execute function private.audit_admin_mutation();

create or replace function public.save_bundle_with_items(
  p_bundle jsonb,
  p_items jsonb
)
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
  if not private.has_staff_role(
    array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role]
  ) then
    raise exception using errcode = '42501', message = 'GD_BUNDLE_STAFF_REQUIRED';
  end if;
  if jsonb_typeof(p_bundle) <> 'object' or jsonb_typeof(p_items) <> 'array' then
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
    or (
      select count(distinct (item.value ->> 'product_id')::bigint)
      from jsonb_array_elements(p_items) as item(value)
    ) <> item_count then
    raise exception using errcode = '22023', message = 'GD_INVALID_BUNDLE_ITEMS';
  end if;

  target_bundle_id := nullif(p_bundle ->> 'id', '')::bigint;
  if target_bundle_id is null then
    insert into public.bundles (
      slug, eyebrow, title_line_one, title_line_two, description,
      price_cents, compare_at_price_cents, hero_product_id, media_asset_id,
      availability_override, sort_order, active, starts_at, ends_at
    ) values (
      normalized_slug, trim(p_bundle ->> 'eyebrow'), trim(p_bundle ->> 'title_line_one'),
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
    select bundle.* into existing_bundle
    from public.bundles as bundle where bundle.id = target_bundle_id for update;
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
  select
    target_bundle_id,
    (item.value ->> 'product_id')::bigint,
    (item.value ->> 'quantity')::integer,
    (item.value ->> 'sort_order')::integer
  from jsonb_array_elements(p_items) as item(value);

  insert into public.audit_events (
    actor_user_id, action, entity_type, entity_id, after_state
  ) values (
    actor_id, 'catalog.bundle.saved', 'bundles', target_bundle_id::text,
    jsonb_build_object('item_count', item_count, 'slug', normalized_slug)
  );
  return target_bundle_id;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'GD_INVALID_BUNDLE_PAYLOAD';
end;
$$;

create or replace function public.reorder_categories(p_category_ids bigint[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  category_count integer;
begin
  if not private.has_staff_role(
    array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role]
  ) then
    raise exception using errcode = '42501', message = 'GD_CATEGORY_STAFF_REQUIRED';
  end if;
  if p_category_ids is null or cardinality(p_category_ids) = 0
    or array_position(p_category_ids, null) is not null
    or (select count(distinct category_id) from unnest(p_category_ids) as category(category_id))
       <> cardinality(p_category_ids) then
    raise exception using errcode = '22023', message = 'GD_INVALID_CATEGORY_ORDER';
  end if;

  perform 1 from public.categories order by id for update;
  select count(*)::integer into category_count from public.categories;
  if category_count <> cardinality(p_category_ids)
    or exists (select id from public.categories except select unnest(p_category_ids)) then
    raise exception using errcode = '22023', message = 'GD_CATEGORY_ID_SET_MISMATCH';
  end if;

  with temporary_order as (
    select category.id, row_number() over (order by category.id)::integer as position
    from public.categories as category
  )
  update public.categories as category
  set sort_order = -1000000 - temporary_order.position
  from temporary_order
  where category.id = temporary_order.id;

  with requested_order as (
    select category_id, ordinality::integer - 1 as position
    from unnest(p_category_ids) with ordinality as requested(category_id, ordinality)
  )
  update public.categories as category
  set sort_order = requested_order.position
  from requested_order
  where category.id = requested_order.category_id;

  insert into public.audit_events (
    actor_user_id, action, entity_type, entity_id, after_state
  ) values (
    actor_id, 'catalog.categories.reordered', 'categories', 'all',
    jsonb_build_object('category_ids', to_jsonb(p_category_ids))
  );
end;
$$;

revoke all on function public.save_bundle_with_items(jsonb, jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.reorder_categories(bigint[])
from public, anon, authenticated, service_role;
grant execute on function public.save_bundle_with_items(jsonb, jsonb) to authenticated;
grant execute on function public.reorder_categories(bigint[]) to authenticated;
