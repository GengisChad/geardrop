begin;
select plan(29);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000401', 'authenticated', 'authenticated', 'media-owner@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000402', 'authenticated', 'authenticated', 'media-admin@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000403', 'authenticated', 'authenticated', 'media-editor@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000404', 'authenticated', 'authenticated', 'media-customer@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

insert into public.staff_profiles (user_id, role, display_name)
values
  ('00000000-0000-0000-0000-000000000401', 'owner', 'Media Owner'),
  ('00000000-0000-0000-0000-000000000402', 'admin', 'Media Admin'),
  ('00000000-0000-0000-0000-000000000403', 'editor', 'Media Editor');

insert into public.media_assets (
  bucket_id, object_path, original_filename, mime_type,
  byte_size, width, height, alt_text, uploaded_by
)
values (
  'product-images', 'contracts/existing.webp', 'existing.webp', 'image/webp',
  1024, 100, 100, 'Existing media', '00000000-0000-0000-0000-000000000401'
);

insert into public.inventory_movements (
  product_id, delta, stock_after, reason, actor_user_id, note
)
select id, 1, 1, 'initial', null, 'media security fixture'
from public.products
where sku = 'wizard-arrow-4-80b';

select is(has_table_privilege('anon', 'public.media_assets', 'select'), false, 'anonymous users have no media-library grant');
select is(has_table_privilege('anon', 'public.media_assets', 'insert'), false, 'anonymous users have no media write grant');
select is(has_table_privilege('authenticated', 'public.media_assets', 'select'), true, 'authenticated staff can receive RLS-filtered media reads');
select is(has_table_privilege('authenticated', 'public.media_assets', 'insert'), true, 'authenticated staff can receive RLS-filtered media creates');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000404', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select results_eq(
  $$select count(*)::bigint from public.media_assets$$,
  array[0::bigint],
  'customer cannot enumerate the media library'
);
select throws_ok(
  $$
    insert into public.media_assets (
      bucket_id, object_path, original_filename, mime_type,
      byte_size, width, height, alt_text, uploaded_by
    ) values (
      'product-images', 'contracts/customer.png', 'customer.png', 'image/png',
      1024, 100, 100, 'Customer media', '00000000-0000-0000-0000-000000000404'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "media_assets"',
  'customer cannot create media'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000403', true);
set local role authenticated;
select results_eq(
  $$select count(*)::bigint from public.media_assets$$,
  array[1::bigint],
  'editor can read content media'
);
select lives_ok(
  $$
    insert into public.media_assets (
      bucket_id, object_path, original_filename, mime_type,
      byte_size, width, height, alt_text, uploaded_by
    ) values (
      'product-images', 'contracts/editor.png', 'editor.png', 'image/png',
      2048, 200, 200, 'Editor media', '00000000-0000-0000-0000-000000000403'
    )
  $$,
  'editor can create content media'
);
select lives_ok(
  $$update public.media_assets set alt_text = 'Editor updated media' where object_path = 'contracts/editor.png'$$,
  'editor can update content media'
);
select throws_like(
  $$delete from public.media_assets where object_path = 'contracts/editor.png'$$,
  '%permission denied%',
  'editor cannot permanently delete media'
);
select throws_ok(
  $$select public.adjust_inventory('wizard-arrow-4-80b', 1, 'manual_adjustment', 'editor denied')$$,
  '42501',
  'GD_INVENTORY_MANAGER_REQUIRED',
  'editor cannot adjust inventory'
);
select results_eq(
  $$select count(*)::bigint from public.inventory_movements where order_id is null$$,
  array[1::bigint],
  'editor can still read permitted movement history'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000401', true);
set local role authenticated;
select lives_ok(
  $$
    insert into public.media_assets (
      bucket_id, object_path, original_filename, mime_type,
      byte_size, width, height, alt_text, uploaded_by
    ) values (
      'product-images', 'contracts/owner.avif', 'owner.avif', 'image/avif',
      4096, 300, 300, 'Owner media', '00000000-0000-0000-0000-000000000401'
    )
  $$,
  'owner can create media'
);
select results_eq(
  $$select count(*)::bigint from public.media_assets where object_path = 'contracts/owner.avif'$$,
  array[1::bigint],
  'owner can read media'
);
select lives_ok(
  $$update public.media_assets set alt_text = 'Owner updated media' where object_path = 'contracts/owner.avif'$$,
  'owner can update media'
);
select lives_ok(
  $$select public.begin_media_delete(
      (select id from public.media_assets where object_path = 'contracts/owner.avif')
    );
    select public.complete_media_delete(
      (select id from public.media_assets where object_path = 'contracts/owner.avif')
    )$$,
  'owner can permanently delete unlinked media through lifecycle'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000402', true);
set local role authenticated;
select lives_ok(
  $$update public.products set seo_title = 'Audited product SEO' where sku = 'wizard-arrow-4-80b'$$,
  'admin can mutate product content'
);
select lives_ok(
  $$select public.begin_media_delete(
      (select id from public.media_assets where object_path = 'contracts/editor.png')
    );
    select public.complete_media_delete(
      (select id from public.media_assets where object_path = 'contracts/editor.png')
    )$$,
  'admin can permanently delete unlinked media through lifecycle'
);
reset role;

select results_eq(
  $$
    select count(*)::bigint
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'product_images_public_object_read'
      and roles @> array['anon'::name, 'authenticated'::name]
      and qual ilike '%bucket_id = ''product-images''%'
      and qual ilike '%storage.allow_any_operation%'
      and qual ilike '%private.is_public_product%'
  $$,
  array[1::bigint],
  'public object reads require bucket, download operation, and product eligibility'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'product_images_content_staff_insert'
      and roles = array['authenticated'::name]
      and with_check ilike '%bucket_id = ''product-images''%'
      and with_check ilike '%private.has_staff_role%'
      and with_check ilike '%editor%'
  $$,
  array[1::bigint],
  'storage upload predicate is bucket-scoped to authenticated content staff'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'product_images_content_staff_update'
      and qual ilike '%bucket_id = ''product-images''%'
      and with_check ilike '%bucket_id = ''product-images''%'
      and qual ilike '%editor%'
  $$,
  array[0::bigint],
  'storage overwrite has no update policy'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'product_images_manager_delete'
      and roles = array['authenticated'::name]
      and qual ilike '%owner%'
      and qual ilike '%admin%'
      and qual not ilike '%editor%'
  $$,
  array[1::bigint],
  'storage delete predicate is limited to owner and admin'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd in ('INSERT', 'UPDATE', 'DELETE')
      and 'anon'::name = any(roles)
  $$,
  array[0::bigint],
  'anonymous users have no Storage write policy'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_catalog.pg_trigger
    where not tgisinternal
      and tgfoid = 'private.audit_admin_mutation()'::regprocedure
      and tgrelid in (
        'public.products'::regclass,
        'public.media_assets'::regclass,
        'public.product_images'::regclass,
        'public.product_specs'::regclass,
        'public.product_features'::regclass,
        'public.product_box_contents'::regclass,
        'public.product_tags'::regclass,
        'public.product_relations'::regclass
      )
  $$,
  array[8::bigint],
  'all normalized product and media mutation tables are audited'
);
select results_eq(
  $$
    select count(*)::bigint
    from public.audit_events
    where action = 'insert'
      and entity_type = 'media_assets'
      and actor_user_id = '00000000-0000-0000-0000-000000000403'
  $$,
  array[1::bigint],
  'audit event records the editor actor'
);
select results_eq(
  $$
    select count(*)::bigint
    from public.audit_events
    where action = 'update'
      and entity_type = 'products'
      and actor_user_id = '00000000-0000-0000-0000-000000000402'
  $$,
  array[1::bigint],
  'product mutation is audited'
);
select is(
  has_function_privilege('anon', 'private.audit_admin_mutation()', 'execute'),
  false,
  'anonymous users cannot execute the audit trigger function'
);
select is(
  has_function_privilege('authenticated', 'private.audit_admin_mutation()', 'execute'),
  false,
  'authenticated users cannot execute the audit trigger function directly'
);
select results_eq(
  $$
    select count(*)::bigint
    from public.media_assets
    where object_path = 'contracts/editor.png'
  $$,
  array[0::bigint],
  'admin media delete persists'
);

select * from finish();
rollback;
