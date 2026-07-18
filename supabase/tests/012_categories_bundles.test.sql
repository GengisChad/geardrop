begin;
select plan(29);

select has_column('public', 'categories', 'media_asset_id', 'categories support managed media');
select col_type_is('public', 'categories', 'publication_status', 'publication_status', 'category publication is typed');
select col_type_is('public', 'bundles', 'availability_override', 'availability_override', 'bundle availability is typed');
select has_column('public', 'bundles', 'starts_at', 'bundles support publication windows');
select has_function('public', 'save_bundle_with_items', array['jsonb', 'jsonb'], 'atomic bundle save exists');
select has_function('public', 'reorder_categories', array['bigint[]'], 'collision-free category reorder exists');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000801', 'authenticated', 'authenticated', 'category-admin@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000802', 'authenticated', 'authenticated', 'category-editor@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000803', 'authenticated', 'authenticated', 'category-customer@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

insert into public.staff_profiles (user_id, role, display_name)
values
  ('00000000-0000-0000-0000-000000000801', 'admin', 'Category Admin'),
  ('00000000-0000-0000-0000-000000000802', 'editor', 'Category Editor');

insert into public.media_assets (
  bucket_id, object_path, original_filename, mime_type, byte_size,
  width, height, alt_text, uploaded_by, status, ready_at
)
values
  ('product-images', 'task10/ready.webp', 'ready.webp', 'image/webp', 4096, 640, 480, 'Ready category', '00000000-0000-0000-0000-000000000801', 'ready', now()),
  ('product-images', 'task10/pending.webp', 'pending.webp', 'image/webp', 0, 0, 0, 'Pending category', '00000000-0000-0000-0000-000000000801', 'pending', null);

select throws_ok(
  $$insert into public.categories (
      slug, name, tagline, description, active, sort_order, publication_status, media_asset_id
    ) values (
      'task10-pending', 'Pending', 'Pending', 'Pending media', false, 100, 'draft',
      (select id from public.media_assets where object_path = 'task10/pending.webp')
    )$$,
  '23514', 'GD_MEDIA_NOT_READY',
  'pending media cannot be associated to a category'
);
select lives_ok(
  $$insert into public.categories (
      slug, name, tagline, description, active, sort_order, publication_status, published_at, media_asset_id
    ) values (
      'task10-published', 'Published', 'Published', 'Published category', true, 100, 'published', now(),
      (select id from public.media_assets where object_path = 'task10/ready.webp')
    ), (
      'task10-draft', 'Draft', 'Draft', 'Draft category', false, 101, 'draft', null, null
    )$$,
  'ready category media can be associated'
);
select throws_ok(
  $$insert into public.categories (slug, name, tagline, description, sort_order)
    values ('task10-published', 'Duplicate', 'Duplicate', 'Duplicate slug', 102)$$,
  '23505', null,
  'category slug remains unique'
);

select throws_ok(
  $$insert into public.bundles (
      slug, eyebrow, title_line_one, title_line_two, description,
      price_cents, compare_at_price_cents, hero_product_id, starts_at, ends_at
    ) values (
      'task10-invalid-window', 'Invalid', 'Invalid', 'Window', 'Invalid window', 1000, 1500,
      (select id from public.products order by id limit 1), now(), now() - interval '1 day'
    )$$,
  '23514', null,
  'bundle end must follow start'
);
select throws_ok(
  $$insert into public.bundles (
      slug, eyebrow, title_line_one, title_line_two, description,
      price_cents, compare_at_price_cents, hero_product_id
    ) values (
      'task10-negative', 'Invalid', 'Invalid', 'Price', 'Negative price', -1, 1,
      (select id from public.products order by id limit 1)
    )$$,
  '23514', null,
  'bundle price cannot be negative'
);
select results_eq(
  $$select private.is_public_category((select id from public.categories where slug = 'task10-published'))$$,
  array[true],
  'published active category is public'
);
select results_eq(
  $$select private.is_public_category((select id from public.categories where slug = 'task10-draft'))$$,
  array[false],
  'draft category remains preview-only'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000801', true);
set local role authenticated;
select lives_ok(
  $$select public.save_bundle_with_items(
    jsonb_build_object(
      'slug', 'task10-bundle', 'eyebrow', 'Bundle', 'title_line_one', 'Atomic',
      'title_line_two', 'Bundle', 'description', 'Saved atomically',
      'price_cents', 1000, 'compare_at_price_cents', 1500,
      'hero_product_id', (select id from public.products order by id limit 1),
      'media_asset_id', (select id from public.media_assets where object_path = 'task10/ready.webp'),
      'availability_override', null, 'sort_order', 10, 'active', true,
      'starts_at', (now() - interval '1 day'), 'ends_at', (now() + interval '1 day')
    ),
    jsonb_build_array(
      jsonb_build_object('product_id', (select id from public.products order by id limit 1), 'quantity', 1, 'sort_order', 0),
      jsonb_build_object('product_id', (select id from public.products order by id offset 1 limit 1), 'quantity', 2, 'sort_order', 1)
    )
  )$$,
  'manager saves bundle and items atomically'
);
select results_eq(
  $$select count(*)::bigint from public.bundle_items
    where bundle_id = (select id from public.bundles where slug = 'task10-bundle')$$,
  array[2::bigint],
  'atomic bundle save writes exact item set'
);
select throws_ok(
  $$insert into public.bundle_items (bundle_id, product_id, quantity, sort_order)
    values (
      (select id from public.bundles where slug = 'task10-bundle'),
      (select id from public.products order by id offset 2 limit 1), 0, 2
    )$$,
  '23514', null,
  'bundle item quantity must be positive'
);
select throws_ok(
  $$update public.bundles set media_asset_id = (
      select id from public.media_assets where object_path = 'task10/pending.webp'
    ) where slug = 'task10-bundle'$$,
  '23514', 'GD_MEDIA_NOT_READY',
  'pending media cannot replace bundle media'
);
select throws_ok(
  $$select public.save_bundle_with_items(
    jsonb_build_object(
      'id', (select id from public.bundles where slug = 'task10-bundle'),
      'slug', 'task10-bundle', 'eyebrow', 'Bundle', 'title_line_one', 'Atomic',
      'title_line_two', 'Bundle', 'description', 'Must roll back',
      'price_cents', 1000, 'compare_at_price_cents', 1500,
      'hero_product_id', (select id from public.products order by id limit 1),
      'media_asset_id', null, 'availability_override', null, 'sort_order', 10,
      'active', true, 'starts_at', null, 'ends_at', null
    ),
    jsonb_build_array(
      jsonb_build_object('product_id', (select id from public.products order by id limit 1), 'quantity', 1, 'sort_order', 0),
      jsonb_build_object('product_id', 9223372036854770000, 'quantity', 1, 'sort_order', 1)
    )
  )$$,
  '23503', null,
  'invalid replacement rolls back parent and every item'
);
select results_eq(
  $$select count(*)::bigint from public.bundle_items
    where bundle_id = (select id from public.bundles where slug = 'task10-bundle')$$,
  array[2::bigint],
  'failed item replacement preserves original item set'
);
select results_eq(
  $$select private.is_public_bundle((select id from public.bundles where slug = 'task10-bundle'))$$,
  array[true],
  'active in-window bundle with public products is public'
);
select lives_ok(
  $$select public.reorder_categories((select array_agg(id order by id desc) from public.categories))$$,
  'category reorder avoids unique position collisions'
);
select results_eq(
  $$select id from public.categories order by sort_order limit 1$$,
  array[(select max(id) from public.categories)],
  'category order matches submitted id sequence'
);
select results_eq(
  $$select count(*)::bigint from public.audit_events where action = 'catalog.bundle.saved'$$,
  array[1::bigint],
  'bundle save writes aggregate audit'
);
select results_eq(
  $$select count(*)::bigint from public.audit_events where action = 'catalog.categories.reordered'$$,
  array[1::bigint],
  'category reorder writes aggregate audit'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000802', true);
set local role authenticated;
select throws_ok(
  $$update public.bundles set price_cents = price_cents + 1 where slug = 'task10-bundle'$$,
  '42501', 'GD_BUNDLE_MANAGER_REQUIRED',
  'editor cannot mutate bundle commerce fields directly'
);
select throws_ok(
  $$select public.save_bundle_with_items(
    jsonb_build_object(
      'id', (select id from public.bundles where slug = 'task10-bundle'),
      'slug', 'task10-bundle', 'eyebrow', 'Bundle', 'title_line_one', 'Atomic',
      'title_line_two', 'Bundle', 'description', 'Editor commerce attempt',
      'price_cents', 1100, 'compare_at_price_cents', 1500,
      'hero_product_id', (select id from public.products order by id limit 1),
      'media_asset_id', null, 'availability_override', null, 'sort_order', 10,
      'active', true, 'starts_at', null, 'ends_at', null
    ),
    jsonb_build_array(
      jsonb_build_object('product_id', (select id from public.products order by id limit 1), 'quantity', 1, 'sort_order', 0)
    )
  )$$,
  '42501', 'GD_BUNDLE_MANAGER_REQUIRED',
  'editor cannot bypass commerce boundary through atomic RPC'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000803', true);
set local role authenticated;
select throws_ok(
  $$select public.reorder_categories(array[(select id from public.categories order by id limit 1)])$$,
  '42501', 'GD_CATEGORY_STAFF_REQUIRED',
  'customer cannot reorder categories'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000801', true);
set local role authenticated;
select throws_ok(
  $$select public.reorder_categories(array[(select id from public.categories order by id limit 1)])$$,
  '22023', 'GD_CATEGORY_ID_SET_MISMATCH',
  'category reorder requires exact current id set'
);
reset role;

select results_eq(
  $$select count(*)::bigint from information_schema.triggers
    where event_object_schema = 'public'
      and event_object_table in ('categories', 'bundles', 'bundle_items')
      and trigger_name like '%audit_admin_mutation'$$,
  array[9::bigint],
  'category and bundle row families are audited'
);

select * from finish();
rollback;
