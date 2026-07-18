begin;
select plan(18);

select has_enum('public', 'media_asset_status', 'media lifecycle enum exists');
select col_type_is('public', 'media_assets', 'status', 'media_asset_status', 'media status is typed');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000601', 'authenticated', 'authenticated', 'lifecycle-admin@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000602', 'authenticated', 'authenticated', 'lifecycle-editor@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000603', 'authenticated', 'authenticated', 'lifecycle-customer@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

insert into public.staff_profiles (user_id, role, display_name)
values
  ('00000000-0000-0000-0000-000000000601', 'admin', 'Lifecycle Admin'),
  ('00000000-0000-0000-0000-000000000602', 'editor', 'Lifecycle Editor');

insert into public.media_assets (
  bucket_id, object_path, original_filename, mime_type,
  byte_size, width, height, alt_text, uploaded_by, status, failure_code, ready_at
)
values
  ('product-images', 'lifecycle/ready.webp', 'ready.webp', 'image/webp', 0, 0, 0, 'Ready asset', '00000000-0000-0000-0000-000000000602', 'pending', null, null),
  ('product-images', 'lifecycle/pending.webp', 'pending.webp', 'image/webp', 0, 0, 0, 'Pending asset', '00000000-0000-0000-0000-000000000602', 'pending', null, null),
  ('product-images', 'lifecycle/failed.webp', 'failed.webp', 'image/webp', 0, 0, 0, 'Failed asset', '00000000-0000-0000-0000-000000000602', 'failed', 'upload_failed', null),
  ('product-images', 'lifecycle/delete.webp', 'delete.webp', 'image/webp', 0, 0, 0, 'Delete asset', '00000000-0000-0000-0000-000000000602', 'pending', null, null);

select results_eq(
  $$select status::text from public.media_assets where object_path = 'lifecycle/ready.webp'$$,
  array['pending'::text],
  'new media reservation starts pending'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000603', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select throws_like(
  $$insert into public.media_assets (
      object_path, original_filename, mime_type, byte_size, width, height, alt_text, uploaded_by
    ) values (
      'lifecycle/customer.webp', 'customer.webp', 'image/webp', 0, 0, 0, 'Customer',
      '00000000-0000-0000-0000-000000000603'
    )$$,
  '%row-level security%',
  'customer cannot reserve media'
);
select throws_ok(
  $$select public.finalize_media_upload(
    (select id from public.media_assets where object_path = 'lifecycle/ready.webp'),
    'image/webp', 4096, 320, 240
  )$$,
  '42501',
  'GD_MEDIA_STAFF_REQUIRED',
  'customer cannot finalize media'
);
select throws_ok(
  $$select public.fail_media_upload(
    (select id from public.media_assets where object_path = 'lifecycle/pending.webp'),
    'customer_attempt'
  )$$,
  '42501',
  'GD_MEDIA_STAFF_REQUIRED',
  'customer cannot fail media'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000602', true);
set local role authenticated;
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values (
      'product-images', 'lifecycle/ready.webp',
      '00000000-0000-0000-0000-000000000602'
    )$$,
  'pending reservation accepts exact uploader path'
);
select throws_like(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values (
      'product-images', 'lifecycle/unreserved.webp',
      '00000000-0000-0000-0000-000000000602'
    )$$,
  '%row-level security%',
  'unreserved Storage path is denied'
);
select lives_ok(
  $$select public.finalize_media_upload(
    (select id from public.media_assets where object_path = 'lifecycle/ready.webp'),
    'image/webp', 4096, 320, 240
  )$$,
  'pending owner can finalize upload'
);
select results_eq(
  $$select concat_ws(':', status::text, mime_type, byte_size, width, height)
    from public.media_assets where object_path = 'lifecycle/ready.webp'$$,
  array['ready:image/webp:4096:320:240'::text],
  'finalized metadata is authoritative'
);
select lives_ok(
  $$update public.product_images
    set media_asset_id = (select id from public.media_assets where object_path = 'lifecycle/ready.webp')
    where id = (select min(id) from public.product_images)$$,
  'ready media can be associated to a product'
);
select throws_ok(
  $$update public.product_images
    set media_asset_id = (select id from public.media_assets where object_path = 'lifecycle/pending.webp')
    where id = (select max(id) from public.product_images)$$,
  '23514',
  'GD_MEDIA_NOT_READY',
  'pending media cannot be associated to a product'
);
reset role;

select set_config('storage.operation', 'object.get_authenticated', true);
set local role anon;
select results_eq(
  $$select private.is_public_product_image_object('product-images', 'lifecycle/pending.webp')$$,
  array[false],
  'only ready product media is publicly readable'
);
select results_eq(
  $$select private.is_public_product_image_object('product-images', 'lifecycle/ready.webp')$$,
  array[true],
  'ready associated published media is publicly readable'
);
select results_eq(
  $$select private.is_public_product_image_object('product-images', 'lifecycle/failed.webp')$$,
  array[false],
  'failed media stays non-public'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000602', true);
set local role authenticated;
select throws_ok(
  $$select public.begin_media_delete((select id from public.media_assets where object_path = 'lifecycle/delete.webp'))$$,
  '42501',
  'GD_MEDIA_MANAGER_REQUIRED',
  'editor cannot begin media deletion'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000601', true);
set local role authenticated;
select throws_ok(
  $$select public.begin_media_delete((select id from public.media_assets where object_path = 'lifecycle/ready.webp'))$$,
  '23503',
  'GD_MEDIA_IN_USE',
  'manager cannot delete associated media'
);
select public.begin_media_delete(
  (select id from public.media_assets where object_path = 'lifecycle/delete.webp')
);
select public.complete_media_delete(
  (select id from public.media_assets where object_path = 'lifecycle/delete.webp')
);
select results_eq(
  $$select count(*)::bigint from public.media_assets where object_path = 'lifecycle/delete.webp'$$,
  array[0::bigint],
  'completed media deletion removes the reservation'
);

reset role;
select * from finish();
rollback;
