begin;
select plan(30);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000701', 'authenticated', 'authenticated', 'atomic-admin@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000702', 'authenticated', 'authenticated', 'atomic-editor@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000703', 'authenticated', 'authenticated', 'atomic-customer@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

insert into public.staff_profiles (user_id, role, display_name)
values
  ('00000000-0000-0000-0000-000000000701', 'admin', 'Atomic Admin'),
  ('00000000-0000-0000-0000-000000000702', 'editor', 'Atomic Editor');

insert into public.products (
  category_id, slug, sku, name, tagline, description, price_cents,
  publication_status, active, stock_quantity
)
values
  ((select id from public.categories order by id limit 1), 'atomic-source', 'atomic-source', 'Atomic Source', 'Source', 'Source product', 1500, 'draft', false, 0),
  ((select id from public.categories order by id limit 1), 'atomic-bulk-good', 'atomic-bulk-good', 'Atomic Bulk Good', 'Bulk', 'Bulk product', 1000, 'draft', false, 0),
  ((select id from public.categories order by id limit 1), 'atomic-bulk-zero', 'atomic-bulk-zero', 'Atomic Bulk Zero', 'Bulk', 'Bulk product', 0, 'draft', false, 0),
  ((select id from public.categories order by id limit 1), 'atomic-ordered', 'atomic-ordered', 'Atomic Ordered', 'Ordered', 'Ordered product', 2000, 'draft', false, 0),
  ((select id from public.categories order by id limit 1), 'atomic-bundled', 'atomic-bundled', 'Atomic Bundled', 'Bundled', 'Bundled product', 2500, 'draft', false, 0),
  ((select id from public.categories order by id limit 1), 'atomic-delete', 'atomic-delete', 'Atomic Delete', 'Delete', 'Deletable product', 500, 'draft', false, 0),
  ((select id from public.categories order by id limit 1), 'atomic-inventory', 'atomic-inventory', 'Atomic Inventory', 'Inventory', 'Inventory product', 500, 'draft', false, 0);

insert into public.product_specs (product_id, label, value, sort_order)
values ((select id from public.products where slug = 'atomic-source'), 'Type', 'Source', 0);
insert into public.product_features (product_id, title, description, sort_order)
values ((select id from public.products where slug = 'atomic-source'), 'Feature', 'Source feature', 0);
insert into public.product_box_contents (product_id, content, sort_order)
values ((select id from public.products where slug = 'atomic-source'), 'Source box', 0);
insert into public.product_tags (product_id, tag)
values ((select id from public.products where slug = 'atomic-source'), 'novita');

insert into public.media_assets (
  object_path, original_filename, mime_type, byte_size, width, height,
  alt_text, uploaded_by, status, failure_code, ready_at
)
values
  ('atomic/old.webp', 'old.webp', 'image/webp', 1000, 100, 100, 'Old', '00000000-0000-0000-0000-000000000701', 'ready', null, now()),
  ('atomic/new.webp', 'new.webp', 'image/webp', 1000, 100, 100, 'New', '00000000-0000-0000-0000-000000000701', 'ready', null, now()),
  ('atomic/pending.webp', 'pending.webp', 'image/webp', 0, 0, 0, 'Pending', '00000000-0000-0000-0000-000000000701', 'pending', null, null);

insert into public.product_images (
  product_id, src, width, height, alt, sort_order, published, media_asset_id, is_primary
)
values
  ((select id from public.products where slug = 'atomic-source'), '/atomic/one.webp', 100, 100, 'One', 0, false, (select id from public.media_assets where object_path = 'atomic/old.webp'), true),
  ((select id from public.products where slug = 'atomic-source'), '/atomic/two.webp', 100, 100, 'Two', 1, false, (select id from public.media_assets where object_path = 'atomic/old.webp'), false);

insert into public.orders (
  order_number, customer_id, email, status, payment_status, subtotal_cents,
  discount_cents, shipping_cents, total_cents, shipping_method_code,
  shipping_address_snapshot, billing_address_snapshot, idempotency_key
)
values (
  'ATOMIC-ORDER-1', '00000000-0000-0000-0000-000000000703', 'atomic-customer@example.com',
  'pending', 'pending', 2000, 0, 0, 2000, 'test', '{}'::jsonb, '{}'::jsonb,
  '00000000-0000-0000-0000-000000000799'
);
insert into public.order_items (
  order_id, product_id, quantity, unit_price_cents, line_total_cents,
  product_name_snapshot, sku_snapshot, image_src_snapshot
)
values (
  (select id from public.orders where order_number = 'ATOMIC-ORDER-1'),
  (select id from public.products where slug = 'atomic-ordered'),
  1, 2000, 2000, 'Atomic Ordered', 'atomic-ordered', '/atomic/ordered.webp'
);

insert into public.bundles (
  slug, eyebrow, title_line_one, title_line_two, description,
  price_cents, compare_at_price_cents, hero_product_id, active
)
values (
  'atomic-bundle', 'Atomic', 'Atomic', 'Bundle', 'Bundle dependency',
  3000, 4000, (select id from public.products where slug = 'atomic-bundled'), false
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000702', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select throws_ok(
  $$select public.adjust_inventory('atomic-inventory', 1, 'manual_adjustment', 'editor')$$,
  '42501', 'GD_INVENTORY_MANAGER_REQUIRED',
  'editor commerce denial includes inventory adjustment'
);
reset role;

create or replace function pg_temp.force_duplicate_child_failure()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.products as product
    where product.id = new.product_id and product.slug = 'atomic-rollback-copy'
  ) then
    raise exception using errcode = '23505', message = 'forced duplicate child failure';
  end if;
  return new;
end;
$$;
create trigger force_duplicate_child_failure
before insert on public.product_specs
for each row execute function pg_temp.force_duplicate_child_failure();

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000702', true);
set local role authenticated;
select throws_ok(
  $$select public.duplicate_product_draft(
    (select id from public.products where slug = 'atomic-source'),
    'Rollback copy', 'atomic-rollback-copy', 'atomic-rollback-copy'
  )$$,
  '23505', null,
  'duplicate collision rolls back product and every copied child'
);
select results_eq(
  $$select count(*)::bigint from public.products where slug = 'atomic-rollback-copy'$$,
  array[0::bigint],
  'failed duplicate leaves no parent'
);
reset role;
drop trigger force_duplicate_child_failure on public.product_specs;
drop function pg_temp.force_duplicate_child_failure();

set local role authenticated;
select lives_ok(
  $$select public.duplicate_product_draft(
    (select id from public.products where slug = 'atomic-source'),
    'Atomic Copy', 'atomic-copy', 'atomic-copy'
  )$$,
  'valid duplicate succeeds'
);
select results_eq(
  $$select concat_ws(':', publication_status::text, active::text, stock_quantity, price_cents)
    from public.products where slug = 'atomic-copy'$$,
  array['draft:false:0:0'::text],
  'duplicate is an inactive zero-stock safe draft'
);
select results_eq(
  $$select count(*)::bigint from public.product_specs
    where product_id = (select id from public.products where slug = 'atomic-copy')$$,
  array[1::bigint],
  'duplicate copies child details atomically'
);

select throws_ok(
  $$select public.bulk_update_products(
    array[
      (select id from public.products where slug = 'atomic-bulk-good'),
      (select id from public.products where slug = 'atomic-bulk-zero')
    ], 'publish', null
  )$$,
  '23514', 'GD_ZERO_PRICE_PRODUCT_CANNOT_PUBLISH',
  'bulk publication failure rolls back every product'
);
select results_eq(
  $$select count(*)::bigint from public.products
    where slug in ('atomic-bulk-good', 'atomic-bulk-zero')
      and publication_status = 'draft' and not active$$,
  array[2::bigint],
  'failed bulk update leaves all products unchanged'
);

select throws_ok(
  $$select public.replace_product_details(
    (select id from public.products where slug = 'atomic-source'),
    '[{"label":"Replacement","value":"Value"}]'::jsonb,
    '[{"title":"","description":"Invalid"}]'::jsonb,
    '[]'::jsonb
  )$$,
  '22023', 'GD_INVALID_PRODUCT_DETAILS',
  'invalid coordinated detail replacement is rejected'
);
select results_eq(
  $$select label from public.product_specs
    where product_id = (select id from public.products where slug = 'atomic-source')$$,
  array['Type'::text],
  'failed detail replacement preserves every family'
);
select lives_ok(
  $$select public.replace_product_details(
    (select id from public.products where slug = 'atomic-source'),
    '[{"label":"Weight","value":"42g"}]'::jsonb,
    '[{"title":"Fast","description":"Very fast"}]'::jsonb,
    '[{"content":"One blade"}]'::jsonb
  )$$,
  'valid coordinated detail replacement succeeds'
);
select results_eq(
  $$select count(*)::bigint from public.product_specs
    where product_id = (select id from public.products where slug = 'atomic-source')$$,
  array[1::bigint],
  'coordinated replacement writes exact submitted details'
);

select lives_ok(
  $$select public.reorder_product_images(
    (select id from public.products where slug = 'atomic-source'),
    array[
      (select id from public.product_images where src = '/atomic/two.webp'),
      (select id from public.product_images where src = '/atomic/one.webp')
    ]
  )$$,
  'image reorder avoids unique position collisions'
);
select results_eq(
  $$select src from public.product_images
    where product_id = (select id from public.products where slug = 'atomic-source')
    order by sort_order$$,
  array['/atomic/two.webp'::text, '/atomic/one.webp'::text],
  'image order matches exact submitted id set'
);
select lives_ok(
  $$select public.set_primary_product_image(
    (select id from public.products where slug = 'atomic-source'),
    (select id from public.product_images where src = '/atomic/two.webp')
  )$$,
  'primary image switch is atomic'
);
select results_eq(
  $$select count(*)::bigint from public.product_images
    where product_id = (select id from public.products where slug = 'atomic-source')
      and is_primary$$,
  array[1::bigint],
  'primary image switch leaves exactly one primary'
);

select throws_ok(
  $$select public.swap_media_asset_associations(
    (select id from public.media_assets where object_path = 'atomic/old.webp'),
    (select id from public.media_assets where object_path = 'atomic/pending.webp')
  )$$,
  '23514', 'GD_MEDIA_NOT_READY',
  'media association swap rejects pending replacement'
);
select results_eq(
  $$select count(*)::bigint from public.product_images
    where media_asset_id = (select id from public.media_assets where object_path = 'atomic/old.webp')$$,
  array[2::bigint],
  'failed media swap preserves old associations'
);
select results_eq(
  $$select (public.swap_media_asset_associations(
    (select id from public.media_assets where object_path = 'atomic/old.webp'),
    (select id from public.media_assets where object_path = 'atomic/new.webp')
  ) ->> 'updated_count')::integer$$,
  array[2],
  'ready media swap reports updated association count'
);
select results_eq(
  $$select count(*)::bigint from public.product_images
    where media_asset_id = (select id from public.media_assets where object_path = 'atomic/old.webp')$$,
  array[0::bigint],
  'successful media swap leaves old asset unused'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true);
set local role authenticated;
select throws_ok(
  $$select public.delete_product_permanently(
    (select id from public.products where slug = 'atomic-ordered'), 'Atomic Ordered'
  )$$,
  '23503', 'GD_PRODUCT_HAS_ORDERS',
  'ordered product cannot be hard deleted'
);
select throws_ok(
  $$select public.delete_product_permanently(
    (select id from public.products where slug = 'atomic-bundled'), 'Atomic Bundled'
  )$$,
  '23503', 'GD_PRODUCT_HAS_BUNDLES',
  'bundle dependency prevents hard delete'
);
select throws_ok(
  $$select public.delete_product_permanently(
    (select id from public.products where slug = 'atomic-delete'), 'Wrong name'
  )$$,
  '22023', 'GD_PRODUCT_CONFIRMATION_MISMATCH',
  'hard delete requires exact product name confirmation'
);
select lives_ok(
  $$select public.delete_product_permanently(
    (select id from public.products where slug = 'atomic-delete'), 'Atomic Delete'
  )$$,
  'unreferenced confirmed product can be deleted'
);
select results_eq(
  $$select count(*)::bigint from public.products where slug = 'atomic-delete'$$,
  array[0::bigint],
  'hard delete removes the confirmed product'
);
select results_eq(
  $$select (public.product_deletion_impact(
    (select id from public.products where slug = 'atomic-ordered')
  ) ->> 'orders')::integer$$,
  array[1],
  'deletion impact reports concrete order dependencies'
);

select results_eq(
  $$select public.adjust_inventory('atomic-inventory', 5, 'manual_adjustment', 'initial shelf count')$$,
  array[5],
  'manager inventory adjustment returns new stock'
);
select results_eq(
  $$select count(*)::bigint from public.inventory_movements
    where product_id = (select id from public.products where slug = 'atomic-inventory')
      and delta = 5 and stock_after = 5$$,
  array[1::bigint],
  'inventory adjustment writes movement in same transaction'
);
select results_eq(
  $$select count(*)::bigint from public.audit_events
    where action = 'inventory.adjusted'
      and entity_id = (select id::text from public.products where slug = 'atomic-inventory')$$,
  array[1::bigint],
  'inventory adjustment writes administrative audit'
);
select results_eq(
  $$select count(*)::bigint from public.audit_events
    where action in (
      'catalog.product.duplicated',
      'catalog.product.details_replaced',
      'catalog.product.images_reordered',
      'catalog.product.primary_image_set',
      'catalog.media.associations_swapped',
      'catalog.product.deleted'
    )$$,
  array[6::bigint],
  'atomic catalog operations write per-family aggregate audits'
);

reset role;
select * from finish();
rollback;
