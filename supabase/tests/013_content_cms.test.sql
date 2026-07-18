begin;
select plan(36);

select results_eq(
  $$select enumlabel from pg_enum join pg_type on pg_type.oid = pg_enum.enumtypid
    where pg_type.typnamespace = 'public'::regnamespace and pg_type.typname = 'homepage_section_type'
    order by enumsortorder$$,
  $$values ('hero'), ('announcement'), ('featured_products'), ('latest_drops'), ('categories'),
    ('competitive_products'), ('bestsellers'), ('new_arrivals'), ('offers'), ('bundle'), ('club'),
    ('status_legend'), ('trust'), ('newsletter'), ('promo_banner'), ('rich_text'), ('cta')$$,
  'homepage section type is exact allowlist'
);
select results_eq(
  $$select count(*)::bigint from information_schema.tables where table_schema = 'public' and table_name in (
    'homepage_sections','homepage_section_products','homepage_section_categories','homepage_section_bundles',
    'content_pages','navigation_menus','navigation_items','footer_columns','footer_items','social_links'
  )$$,
  array[10::bigint],
  'all structured CMS tables exist'
);
select has_function('public', 'reorder_homepage_sections', array['bigint[]'], 'homepage reorder RPC exists');
select has_function('public', 'publish_homepage_section', array['bigint'], 'homepage publish RPC exists');
select has_function('public', 'save_navigation_tree', array['jsonb'], 'navigation tree RPC exists');
select has_column('public', 'homepage_sections', 'desktop_media_asset_id', 'homepage supports desktop media');
select has_column('public', 'homepage_sections', 'mobile_media_asset_id', 'homepage supports mobile media');
select col_type_is('public', 'homepage_sections', 'publication_status', 'publication_status', 'homepage publication is typed');
select col_type_is('public', 'content_pages', 'format', 'content_format', 'page format is typed');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000901', 'authenticated', 'authenticated', 'cms-admin@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000902', 'authenticated', 'authenticated', 'cms-editor@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000903', 'authenticated', 'authenticated', 'cms-customer@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
insert into public.staff_profiles (user_id, role, display_name) values
  ('00000000-0000-0000-0000-000000000901', 'admin', 'CMS Admin'),
  ('00000000-0000-0000-0000-000000000902', 'editor', 'CMS Editor');
insert into public.media_assets (
  bucket_id, object_path, original_filename, mime_type, byte_size, width, height,
  alt_text, uploaded_by, status, ready_at
) values
  ('product-images', 'task12/ready.webp', 'ready.webp', 'image/webp', 4096, 1200, 700, 'CMS ready', '00000000-0000-0000-0000-000000000901', 'ready', now()),
  ('product-images', 'task12/pending.webp', 'pending.webp', 'image/webp', 0, 0, 0, 'CMS pending', '00000000-0000-0000-0000-000000000901', 'pending', null);

select throws_ok(
  $$insert into public.homepage_sections (
    section_key, section_type, title, desktop_media_asset_id, publication_status, active, sort_order
  ) values ('pending-media', 'hero', 'Pending', (select id from public.media_assets where object_path='task12/pending.webp'), 'draft', false, 90)$$,
  '23514', 'GD_CMS_MEDIA_NOT_READY', 'pending media cannot be associated'
);
select lives_ok(
  $$insert into public.homepage_sections (
    section_key, section_type, title, desktop_media_asset_id, publication_status, published_at, active, sort_order
  ) values
    ('public-hero', 'hero', 'Public hero', (select id from public.media_assets where object_path='task12/ready.webp'), 'published', now() - interval '1 hour', true, 100),
    ('draft-hero', 'hero', 'Draft hero', null, 'draft', null, false, 101),
    ('expired-hero', 'hero', 'Expired hero', null, 'published', now() - interval '2 days', true, 102)$$,
  'ready, draft, and scheduled sections can be stored'
);
update public.homepage_sections set ends_at = now() - interval '1 day' where section_key = 'expired-hero';
select results_eq($$select private.is_public_homepage_section((select id from public.homepage_sections where section_key='public-hero'))$$, array[true], 'published current section is public');
select results_eq($$select private.is_public_homepage_section((select id from public.homepage_sections where section_key='draft-hero'))$$, array[false], 'draft section is private');
select results_eq($$select private.is_public_homepage_section((select id from public.homepage_sections where section_key='expired-hero'))$$, array[false], 'expired section is private');
select throws_ok(
  $$insert into public.homepage_sections (section_key,section_type,title,publication_status,active,sort_order)
    values ('duplicate-order','trust','Duplicate order','draft',false,100)$$,
  '23505', null, 'homepage positions are unique'
);
insert into public.homepage_sections (section_key,section_type,title,publication_status,active,sort_order)
values ('product-grid','featured_products','Product grid','draft',false,103);
select throws_ok(
  $$insert into public.content_pages (slug,title,markdown_source,format,publication_status,active)
    values ('unsafe-page','Unsafe','<script>alert(1)</script>','markdown','draft',false)$$,
  '23514', null, 'content pages reject raw HTML'
);
select lives_ok(
  $$insert into public.content_pages (slug,title,markdown_source,format,publication_status,published_at,active)
    values ('safe-page','Safe','# Titolo\n\n[Test](/negozio)','markdown','published',now(),true)$$,
  'safe Markdown page is stored'
);
select throws_ok(
  $$insert into public.navigation_menus (menu_key,label,publication_status,active) values ('bad','Bad','draft',false);
    insert into public.navigation_items (menu_id,label,href,sort_order)
    values ((select id from public.navigation_menus where menu_key='bad'),'Bad','javascript:alert(1)',0)$$,
  '23514', null, 'navigation rejects unsafe protocols'
);
insert into public.navigation_menus (menu_key,label,publication_status,published_at,active)
values ('main','Main','published',now(),true);
insert into public.navigation_items (menu_id,label,href,sort_order)
values ((select id from public.navigation_menus where menu_key='main'),'Root','/negozio',0);
insert into public.navigation_items (menu_id,parent_id,label,href,sort_order)
values (
  (select id from public.navigation_menus where menu_key='main'),
  (select id from public.navigation_items where label='Root'),
  'Child','/negozio/starter',0
);
select throws_ok(
  $$update public.navigation_items set parent_id=(select id from public.navigation_items where label='Child') where label='Root'$$,
  '23514', 'GD_NAVIGATION_CYCLE', 'navigation cycles are rejected'
);
select throws_ok(
  $$insert into public.homepage_section_products (section_id,product_id,sort_order)
    values ((select id from public.homepage_sections where section_key='product-grid'),9223372036854770000,0)$$,
  '23503', null, 'section product target must exist'
);

set local role anon;
select results_eq($$select section_key from public.homepage_sections order by section_key$$, array['public-hero'::text], 'anon sees only public current homepage sections');
select results_eq($$select slug from public.content_pages order by slug$$, array['safe-page'::text], 'anon sees only public content pages');
select results_eq($$select menu_key from public.navigation_menus order by menu_key$$, array['main'::text], 'anon sees only public menus');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000903', true);
set local role authenticated;
select throws_ok(
  $$insert into public.content_pages (slug,title,markdown_source,format,publication_status,active)
    values ('customer-page','No','# No','markdown','draft',false)$$,
  '42501', null, 'customer cannot write CMS rows'
);
select throws_ok(
  $$select public.publish_homepage_section((select id from public.homepage_sections where section_key='draft-hero'))$$,
  '42501', 'GD_CMS_STAFF_REQUIRED', 'customer cannot publish homepage section'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000902', true);
set local role authenticated;
select lives_ok(
  $$select public.publish_homepage_section((select id from public.homepage_sections where section_key='draft-hero'))$$,
  'editor can publish homepage section'
);
select results_eq(
  $$select publication_status::text, active::text from public.homepage_sections where section_key='draft-hero'$$,
  $$values ('published','true')$$,
  'publish RPC sets authoritative publication state'
);
select lives_ok(
  $$select public.reorder_homepage_sections((select array_agg(id order by id desc) from public.homepage_sections))$$,
  'editor can reorder exact homepage section set'
);
select results_eq(
  $$select id from public.homepage_sections order by sort_order limit 1$$,
  array[(select max(id) from public.homepage_sections)],
  'homepage reorder matches submitted sequence'
);
select lives_ok(
  $$select public.save_navigation_tree(jsonb_build_object(
    'menu', jsonb_build_object('key','footer','label','Footer','publication_status','draft','active',false),
    'items', jsonb_build_array(
      jsonb_build_object('label','Supporto','href','/assistenza','active',true,'children',jsonb_build_array(
        jsonb_build_object('label','FAQ','href','/assistenza/faq','active',true,'children','[]'::jsonb)
      ))
    )
  ))$$,
  'navigation tree saves atomically'
);
select results_eq(
  $$select count(*)::bigint from public.navigation_items where menu_id=(select id from public.navigation_menus where menu_key='footer')$$,
  array[2::bigint], 'navigation tree writes nested items'
);
reset role;

select results_eq(
  $$select count(*)::bigint from pg_class join pg_namespace on pg_namespace.oid=pg_class.relnamespace
    where pg_namespace.nspname='public' and pg_class.relname in (
      'homepage_sections','homepage_section_products','homepage_section_categories','homepage_section_bundles',
      'content_pages','navigation_menus','navigation_items','footer_columns','footer_items','social_links'
    ) and pg_class.relrowsecurity$$,
  array[10::bigint], 'RLS is enabled on every CMS table'
);
select results_eq(
  $$select count(*)::bigint from information_schema.triggers where event_object_schema='public'
    and event_object_table in ('homepage_sections','homepage_section_products','homepage_section_categories','homepage_section_bundles','content_pages','navigation_menus','navigation_items','footer_columns','footer_items','social_links')
    and trigger_name like '%audit_admin_mutation'$$,
  array[30::bigint], 'all CMS row families are audited'
);
select results_eq($$select count(*)::bigint from public.audit_events where action='content.homepage.reordered'$$, array[1::bigint], 'homepage reorder is aggregate audited');
select results_eq($$select count(*)::bigint from public.audit_events where action='content.homepage.published'$$, array[1::bigint], 'homepage publish is aggregate audited');
select results_eq($$select count(*)::bigint from public.audit_events where action='content.navigation.saved'$$, array[1::bigint], 'navigation save is aggregate audited');

select * from finish();
rollback;
