begin;
select plan(8);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, raw_app_meta_data, raw_user_meta_data, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000601', 'authenticated', 'authenticated', 'product-owner@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000603', 'authenticated', 'authenticated', 'product-editor@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), '', '', '', '');

insert into public.staff_profiles (user_id, role, display_name)
values
  ('00000000-0000-0000-0000-000000000601', 'owner', 'Product Owner'),
  ('00000000-0000-0000-0000-000000000603', 'editor', 'Product Editor');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000603', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$insert into public.products (category_id, slug, sku, name, tagline, description, price_cents, publication_status, active)
    values ((select id from public.categories order by id limit 1), 'editor-safe-draft', 'editor-safe-draft', 'Editor safe draft', 'Draft', 'Draft editoriale', 0, 'draft', false)$$,
  'editor can create only a safe zero-stock draft'
);

select throws_ok(
  $$update public.products set price_cents = 1299 where sku = 'editor-safe-draft'$$,
  '42501', 'GD_EDITOR_COMMERCE_FIELDS_FORBIDDEN',
  'editor cannot update price directly'
);

select throws_ok(
  $$update public.products set availability_override = 'incoming' where sku = 'editor-safe-draft'$$,
  '42501', 'GD_EDITOR_COMMERCE_FIELDS_FORBIDDEN',
  'editor cannot update availability directly'
);

select throws_ok(
  $$update public.products set publication_status = 'published', active = true where sku = 'editor-safe-draft'$$,
  '23514', 'GD_ZERO_PRICE_PRODUCT_CANNOT_PUBLISH',
  'editor cannot publish a zero-price draft'
);

select throws_ok(
  $$insert into public.products (category_id, slug, sku, name, tagline, description, price_cents)
    values ((select id from public.categories order by id limit 1), 'editor-priced-draft', 'editor-priced-draft', 'Priced', 'Draft', 'Draft', 100)$$,
  '42501', 'GD_EDITOR_DRAFT_DEFAULTS_REQUIRED',
  'editor cannot inject sensitive values during insert'
);

select lives_ok(
  $$update public.products set name = 'Editor renamed draft', tagline = 'Contenuto aggiornato' where sku = 'editor-safe-draft'$$,
  'editor can update content fields'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000601', true);
select lives_ok(
  $$update public.products set price_cents = 1299 where sku = 'editor-safe-draft'$$,
  'owner can set sensitive commerce fields'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000603', true);
select lives_ok(
  $$update public.products set publication_status = 'published', active = true where sku = 'editor-safe-draft'$$,
  'editor can publish after a manager sets a valid price'
);

select * from finish();
rollback;
