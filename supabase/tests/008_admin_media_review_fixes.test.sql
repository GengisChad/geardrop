begin;
select plan(13);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000501', 'authenticated', 'authenticated', 'review-owner@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000502', 'authenticated', 'authenticated', 'review-admin@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000503', 'authenticated', 'authenticated', 'review-editor@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000504', 'authenticated', 'authenticated', 'review-customer@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

insert into public.staff_profiles (user_id, role, display_name)
values
  ('00000000-0000-0000-0000-000000000501', 'owner', 'Review Owner'),
  ('00000000-0000-0000-0000-000000000502', 'admin', 'Review Admin'),
  ('00000000-0000-0000-0000-000000000503', 'editor', 'Review Editor');

insert into public.media_assets (
  bucket_id, object_path, original_filename, mime_type,
  byte_size, width, height, alt_text, uploaded_by, status, ready_at
)
values
  (
    'product-images', 'review/eligible.webp', 'eligible.webp', 'image/webp',
    1024, 100, 100, 'Eligible review media', '00000000-0000-0000-0000-000000000501',
    'ready', now()
  ),
  (
    'product-images', 'review/editor.png', 'editor.png', 'image/png',
    0, 0, 0, 'Editor review media', '00000000-0000-0000-0000-000000000503',
    'pending', null
  ),
  (
    'product-images', 'review/editor-ready.png', 'editor-ready.png', 'image/png',
    2048, 200, 200, 'Ready editor media', '00000000-0000-0000-0000-000000000503',
    'ready', now()
  );

update public.product_images
set media_asset_id = (select id from public.media_assets where object_path = 'review/eligible.webp'),
    is_primary = true
where id = (
  select image.id
  from public.product_images as image
  join public.products as product on product.id = image.product_id
  where product.sku = 'SOAR-PHOENIX-9-60GF'
    and image.published
  order by image.sort_order
  limit 1
);

insert into storage.objects (bucket_id, name, owner_id)
values (
  'product-images',
  'review/eligible.webp',
  '00000000-0000-0000-0000-000000000501'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000503', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select throws_ok(
  $$
    update public.media_assets
    set uploaded_by = '00000000-0000-0000-0000-000000000501'
    where object_path = 'review/editor.png'
  $$,
  '23514',
  'GD_MEDIA_UPLOADER_IMMUTABLE',
  'media uploader provenance cannot be reassigned'
);
select throws_ok(
  $$
    update public.media_assets
    set uploaded_by = null
    where object_path = 'review/editor.png'
  $$,
  '23514',
  'GD_MEDIA_UPLOADER_IMMUTABLE',
  'media uploader provenance cannot be cleared'
);
select results_eq(
  $$select uploaded_by from public.media_assets where object_path = 'review/editor.png'$$,
  array['00000000-0000-0000-0000-000000000503'::uuid],
  'failed provenance rewrites preserve the original uploader'
);
select lives_ok(
  $$
    insert into public.product_relations (
      product_id, related_product_id, relation_type, sort_order
    ) values (
      (select id from public.products where sku = 'SOAR-PHOENIX-9-60GF'),
      (select id from public.products where sku = 'COBALT-DRAGOON-2-60C'),
      'cross_sell',
      700
    )
  $$,
  'editor can create an audited cross-sell relation'
);
reset role;

select set_config('storage.operation', 'object.list', true);
set local role anon;
select results_eq(
  $$select count(*)::bigint from storage.objects where bucket_id = 'product-images'$$,
  array[0::bigint],
  'storage list operation cannot enumerate eligible objects'
);
select set_config('storage.operation', 'object.get_authenticated', true);
select results_eq(
  $$
    select name
    from storage.objects
    where bucket_id = 'product-images'
      and name = 'review/eligible.webp'
  $$,
  array['review/eligible.webp'::text],
  'eligible object read succeeds without media-library enumeration'
);
select throws_like(
  $$
    insert into storage.objects (bucket_id, name, owner_id)
    values ('product-images', 'review/anon.png', null)
  $$,
  '%row-level security%',
  'anonymous Storage insert is denied'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000504', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select throws_like(
  $$
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'product-images',
      'review/editor.png',
      '00000000-0000-0000-0000-000000000504'
    )
  $$,
  '%row-level security%',
  'nonstaff Storage insert is denied'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000503', true);
set local role authenticated;
select lives_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'product-images',
      'review/editor.png',
      '00000000-0000-0000-0000-000000000503'
    )
  $$,
  'editor Storage insert is allowed for own pending reservation'
);
select throws_like(
  $$
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'product-images',
      'review/editor-ready.png',
      '00000000-0000-0000-0000-000000000503'
    )
  $$,
  '%row-level security%',
  'ready reservation cannot be overwritten'
);
select set_config('storage.allow_delete_query', 'true', true);
select results_eq(
  $$
    with removed as (
      delete from storage.objects
      where bucket_id = 'product-images' and name = 'review/editor.png'
      returning 1
    )
    select count(*)::bigint from removed
  $$,
  array[0::bigint],
  'editor Storage delete is denied'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000502', true);
set local role authenticated;
select results_eq(
  $$
    with removed as (
      delete from storage.objects
      where bucket_id = 'product-images' and name = 'review/editor.png'
      returning 1
    )
    select count(*)::bigint from removed
  $$,
  array[1::bigint],
  'admin Storage delete is allowed'
);
reset role;

select results_eq(
  $$
    select count(*)::bigint
    from public.audit_events
    where entity_type = 'product_relations'
      and action = 'insert'
      and actor_user_id = '00000000-0000-0000-0000-000000000503'
      and entity_id like '%:cross_sell:%'
  $$,
  array[1::bigint],
  'product relation audit identity includes relation type'
);

select * from finish();
rollback;
