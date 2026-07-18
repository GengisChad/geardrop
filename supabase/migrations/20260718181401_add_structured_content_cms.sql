create type public.homepage_section_type as enum (
  'hero', 'announcement', 'featured_products', 'latest_drops', 'categories',
  'competitive_products', 'bestsellers', 'new_arrivals', 'offers', 'bundle',
  'club', 'status_legend', 'trust', 'newsletter', 'promo_banner', 'rich_text', 'cta'
);
create type public.content_format as enum ('markdown');

create or replace function private.is_safe_content_link(p_href text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_href is not null
    and length(trim(p_href)) between 1 and 2048
    and trim(p_href) !~ '[[:space:]<>]'
    and position(chr(92) in p_href) = 0
    and (
      (left(trim(p_href), 1) = '/' and left(trim(p_href), 2) <> '//')
      or left(trim(p_href), 1) = '#'
      or lower(trim(p_href)) like 'https://%'
      or lower(trim(p_href)) like 'mailto:%'
      or lower(trim(p_href)) like 'tel:%'
    );
$$;

revoke all on function private.is_safe_content_link(text) from public, anon, authenticated, service_role;
grant execute on function private.is_safe_content_link(text) to anon, authenticated;

create table public.homepage_sections (
  id bigint generated always as identity primary key,
  section_key text not null unique check (section_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  section_type public.homepage_section_type not null,
  eyebrow text,
  title text,
  subtitle text,
  description text,
  desktop_media_asset_id bigint references public.media_assets(id) on delete restrict,
  mobile_media_asset_id bigint references public.media_assets(id) on delete restrict,
  cta_label text,
  cta_href text,
  publication_status public.publication_status not null default 'draft',
  published_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default false,
  sort_order integer not null constraint homepage_sections_sort_order_key unique deferrable initially immediate check (sort_order between -1000000 and 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint homepage_sections_window check (starts_at is null or ends_at is null or ends_at > starts_at),
  constraint homepage_sections_publication_consistent check (publication_status = 'published' or published_at is null),
  constraint homepage_sections_cta_complete check ((cta_label is null) = (cta_href is null)),
  constraint homepage_sections_cta_safe check (cta_href is null or private.is_safe_content_link(cta_href))
);

create table public.homepage_section_products (
  section_id bigint not null references public.homepage_sections(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete restrict,
  sort_order integer not null check (sort_order between 0 and 100000),
  primary key (section_id, product_id),
  unique (section_id, sort_order)
);
create table public.homepage_section_categories (
  section_id bigint not null references public.homepage_sections(id) on delete cascade,
  category_id bigint not null references public.categories(id) on delete restrict,
  sort_order integer not null check (sort_order between 0 and 100000),
  primary key (section_id, category_id),
  unique (section_id, sort_order)
);
create table public.homepage_section_bundles (
  section_id bigint not null references public.homepage_sections(id) on delete cascade,
  bundle_id bigint not null references public.bundles(id) on delete restrict,
  sort_order integer not null check (sort_order between 0 and 100000),
  primary key (section_id, bundle_id),
  unique (section_id, sort_order)
);

create table public.content_pages (
  id bigint generated always as identity primary key,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(trim(title)) between 1 and 160),
  excerpt text,
  markdown_source text not null,
  format public.content_format not null default 'markdown',
  seo_title text check (seo_title is null or length(seo_title) <= 70),
  seo_description text check (seo_description is null or length(seo_description) <= 180),
  publication_status public.publication_status not null default 'draft',
  published_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default false,
  sort_order integer not null default 0 check (sort_order between -1000000 and 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_pages_markdown_only check (format = 'markdown' and markdown_source !~ '<[^>]*>'),
  constraint content_pages_window check (starts_at is null or ends_at is null or ends_at > starts_at),
  constraint content_pages_publication_consistent check (publication_status = 'published' or published_at is null)
);

create table public.navigation_menus (
  id bigint generated always as identity primary key,
  menu_key text not null unique check (menu_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  label text not null check (length(trim(label)) between 1 and 120),
  publication_status public.publication_status not null default 'draft',
  published_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint navigation_menus_window check (starts_at is null or ends_at is null or ends_at > starts_at),
  constraint navigation_menus_publication_consistent check (publication_status = 'published' or published_at is null)
);
create table public.navigation_items (
  id bigint generated always as identity primary key,
  menu_id bigint not null references public.navigation_menus(id) on delete cascade,
  parent_id bigint references public.navigation_items(id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 120),
  href text not null check (private.is_safe_content_link(href)),
  active boolean not null default true,
  sort_order integer not null check (sort_order between 0 and 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (menu_id, parent_id, sort_order),
  check (parent_id is null or parent_id <> id)
);

create table public.footer_columns (
  id bigint generated always as identity primary key,
  column_key text not null unique check (column_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(trim(title)) between 1 and 120),
  publication_status public.publication_status not null default 'draft',
  published_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default false,
  sort_order integer not null unique check (sort_order between -1000000 and 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint footer_columns_window check (starts_at is null or ends_at is null or ends_at > starts_at),
  constraint footer_columns_publication_consistent check (publication_status = 'published' or published_at is null)
);
create table public.footer_items (
  id bigint generated always as identity primary key,
  column_id bigint not null references public.footer_columns(id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 120),
  href text not null check (private.is_safe_content_link(href)),
  active boolean not null default true,
  sort_order integer not null check (sort_order between 0 and 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (column_id, sort_order)
);
create table public.social_links (
  id bigint generated always as identity primary key,
  platform_key text not null unique check (platform_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  label text not null check (length(trim(label)) between 1 and 120),
  href text not null check (private.is_safe_content_link(href)),
  publication_status public.publication_status not null default 'draft',
  published_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default false,
  sort_order integer not null unique check (sort_order between -1000000 and 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_links_window check (starts_at is null or ends_at is null or ends_at > starts_at),
  constraint social_links_publication_consistent check (publication_status = 'published' or published_at is null)
);

create index homepage_sections_public_idx on public.homepage_sections(sort_order, id)
where active and publication_status = 'published';
create index content_pages_public_idx on public.content_pages(sort_order, id)
where active and publication_status = 'published';
create index navigation_items_tree_idx on public.navigation_items(menu_id, parent_id, sort_order);
create index footer_items_column_idx on public.footer_items(column_id, sort_order);

create or replace function private.enforce_ready_cms_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  media_id bigint;
begin
  foreach media_id in array array[new.desktop_media_asset_id, new.mobile_media_asset_id] loop
    if media_id is not null and not exists (
      select 1 from public.media_assets as media where media.id = media_id and media.status = 'ready'
    ) then
      raise exception using errcode = '23514', message = 'GD_CMS_MEDIA_NOT_READY';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function private.enforce_ready_cms_media() from public, anon, authenticated, service_role;
create trigger homepage_sections_enforce_ready_media
before insert or update of desktop_media_asset_id, mobile_media_asset_id on public.homepage_sections
for each row execute function private.enforce_ready_cms_media();

create or replace function private.enforce_homepage_target_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_type public.homepage_section_type;
begin
  select section.section_type into target_type from public.homepage_sections as section where section.id = new.section_id;
  if tg_table_name = 'homepage_section_products' and target_type not in (
    'featured_products', 'latest_drops', 'competitive_products', 'bestsellers', 'new_arrivals', 'offers'
  ) then
    raise exception using errcode = '23514', message = 'GD_INVALID_HOMEPAGE_TARGET_TYPE';
  elsif tg_table_name = 'homepage_section_categories' and target_type <> 'categories' then
    raise exception using errcode = '23514', message = 'GD_INVALID_HOMEPAGE_TARGET_TYPE';
  elsif tg_table_name = 'homepage_section_bundles' and target_type <> 'bundle' then
    raise exception using errcode = '23514', message = 'GD_INVALID_HOMEPAGE_TARGET_TYPE';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_homepage_target_type() from public, anon, authenticated, service_role;
create trigger homepage_section_products_enforce_type before insert or update on public.homepage_section_products for each row execute function private.enforce_homepage_target_type();
create trigger homepage_section_categories_enforce_type before insert or update on public.homepage_section_categories for each row execute function private.enforce_homepage_target_type();
create trigger homepage_section_bundles_enforce_type before insert or update on public.homepage_section_bundles for each row execute function private.enforce_homepage_target_type();

create or replace function private.enforce_navigation_item_tree()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_menu_id bigint;
begin
  if new.parent_id is null then return new; end if;
  select item.menu_id into parent_menu_id from public.navigation_items as item where item.id = new.parent_id;
  if parent_menu_id is null or parent_menu_id <> new.menu_id then
    raise exception using errcode = '23514', message = 'GD_NAVIGATION_PARENT_MENU_MISMATCH';
  end if;
  if exists (
    with recursive ancestors(id, parent_id) as (
      select item.id, item.parent_id from public.navigation_items as item where item.id = new.parent_id
      union all
      select item.id, item.parent_id from public.navigation_items as item join ancestors on item.id = ancestors.parent_id
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception using errcode = '23514', message = 'GD_NAVIGATION_CYCLE';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_navigation_item_tree() from public, anon, authenticated, service_role;
create trigger navigation_items_enforce_tree before insert or update of menu_id, parent_id on public.navigation_items for each row execute function private.enforce_navigation_item_tree();

create or replace function private.is_content_public(
  p_status public.publication_status,
  p_published_at timestamptz,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_active boolean
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_active and p_status = 'published' and p_published_at is not null
    and p_published_at <= now()
    and (p_starts_at is null or p_starts_at <= now())
    and (p_ends_at is null or p_ends_at > now());
$$;
revoke all on function private.is_content_public(public.publication_status, timestamptz, timestamptz, timestamptz, boolean) from public, anon, authenticated, service_role;
grant execute on function private.is_content_public(public.publication_status, timestamptz, timestamptz, timestamptz, boolean) to anon, authenticated;

create or replace function private.is_public_homepage_section(p_section_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.is_content_public(section.publication_status, section.published_at, section.starts_at, section.ends_at, section.active)
      and (section.desktop_media_asset_id is null or exists (
        select 1 from public.media_assets as media where media.id = section.desktop_media_asset_id and media.status = 'ready'
      ))
      and (section.mobile_media_asset_id is null or exists (
        select 1 from public.media_assets as media where media.id = section.mobile_media_asset_id and media.status = 'ready'
      ))
    from public.homepage_sections as section where section.id = p_section_id
  ), false);
$$;
create or replace function private.is_public_navigation_menu(p_menu_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select private.is_content_public(menu.publication_status,menu.published_at,menu.starts_at,menu.ends_at,menu.active)
    from public.navigation_menus as menu where menu.id=p_menu_id),false);
$$;
create or replace function private.is_public_footer_column(p_column_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select private.is_content_public(column_row.publication_status,column_row.published_at,column_row.starts_at,column_row.ends_at,column_row.active)
    from public.footer_columns as column_row where column_row.id=p_column_id),false);
$$;
revoke all on function private.is_public_homepage_section(bigint) from public, anon, authenticated, service_role;
revoke all on function private.is_public_navigation_menu(bigint) from public, anon, authenticated, service_role;
revoke all on function private.is_public_footer_column(bigint) from public, anon, authenticated, service_role;
grant execute on function private.is_public_homepage_section(bigint) to anon, authenticated;
grant execute on function private.is_public_navigation_menu(bigint) to anon, authenticated;
grant execute on function private.is_public_footer_column(bigint) to anon, authenticated;

alter table public.homepage_sections enable row level security;
alter table public.homepage_section_products enable row level security;
alter table public.homepage_section_categories enable row level security;
alter table public.homepage_section_bundles enable row level security;
alter table public.content_pages enable row level security;
alter table public.navigation_menus enable row level security;
alter table public.navigation_items enable row level security;
alter table public.footer_columns enable row level security;
alter table public.footer_items enable row level security;
alter table public.social_links enable row level security;

create policy homepage_sections_public_read on public.homepage_sections for select to anon, authenticated using ((select private.is_public_homepage_section(id)));
create policy homepage_section_products_public_read on public.homepage_section_products for select to anon, authenticated using ((select private.is_public_homepage_section(section_id)) and (select private.is_public_product(product_id)));
create policy homepage_section_categories_public_read on public.homepage_section_categories for select to anon, authenticated using ((select private.is_public_homepage_section(section_id)) and (select private.is_public_category(category_id)));
create policy homepage_section_bundles_public_read on public.homepage_section_bundles for select to anon, authenticated using ((select private.is_public_homepage_section(section_id)) and (select private.is_public_bundle(bundle_id)));
create policy content_pages_public_read on public.content_pages for select to anon, authenticated using ((select private.is_content_public(publication_status,published_at,starts_at,ends_at,active)));
create policy navigation_menus_public_read on public.navigation_menus for select to anon, authenticated using ((select private.is_public_navigation_menu(id)));
create policy navigation_items_public_read on public.navigation_items for select to anon, authenticated using (active and (select private.is_public_navigation_menu(menu_id)));
create policy footer_columns_public_read on public.footer_columns for select to anon, authenticated using ((select private.is_public_footer_column(id)));
create policy footer_items_public_read on public.footer_items for select to anon, authenticated using (active and (select private.is_public_footer_column(column_id)));
create policy social_links_public_read on public.social_links for select to anon, authenticated using ((select private.is_content_public(publication_status,published_at,starts_at,ends_at,active)));

create policy homepage_sections_staff_all on public.homepage_sections for all to authenticated using ((select private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role]))) with check ((select private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role])));
create policy homepage_section_products_staff_all on public.homepage_section_products for all to authenticated using ((select private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role]))) with check ((select private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role])));
create policy homepage_section_categories_staff_all on public.homepage_section_categories for all to authenticated using ((select private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role]))) with check ((select private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role])));
create policy homepage_section_bundles_staff_all on public.homepage_section_bundles for all to authenticated using ((select private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role]))) with check ((select private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role])));
create policy content_pages_staff_all on public.content_pages for all to authenticated using ((select private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role]))) with check ((select private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role])));
create policy navigation_menus_staff_all on public.navigation_menus for all to authenticated using ((select private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role]))) with check ((select private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role])));
create policy navigation_items_staff_all on public.navigation_items for all to authenticated using ((select private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role]))) with check ((select private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role])));
create policy footer_columns_staff_all on public.footer_columns for all to authenticated using ((select private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role]))) with check ((select private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role])));
create policy footer_items_staff_all on public.footer_items for all to authenticated using ((select private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role]))) with check ((select private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role])));
create policy social_links_staff_all on public.social_links for all to authenticated using ((select private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role]))) with check ((select private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role])));

grant select on public.homepage_sections, public.homepage_section_products, public.homepage_section_categories, public.homepage_section_bundles,
  public.content_pages, public.navigation_menus, public.navigation_items, public.footer_columns, public.footer_items, public.social_links to anon;
grant select, insert, update, delete on public.homepage_sections, public.homepage_section_products, public.homepage_section_categories, public.homepage_section_bundles,
  public.content_pages, public.navigation_menus, public.navigation_items, public.footer_columns, public.footer_items, public.social_links to authenticated;
grant usage, select on sequence public.homepage_sections_id_seq, public.content_pages_id_seq, public.navigation_menus_id_seq,
  public.navigation_items_id_seq, public.footer_columns_id_seq, public.footer_items_id_seq, public.social_links_id_seq to authenticated;

create trigger homepage_sections_set_updated_at before update on public.homepage_sections for each row execute function private.set_updated_at();
create trigger content_pages_set_updated_at before update on public.content_pages for each row execute function private.set_updated_at();
create trigger navigation_menus_set_updated_at before update on public.navigation_menus for each row execute function private.set_updated_at();
create trigger navigation_items_set_updated_at before update on public.navigation_items for each row execute function private.set_updated_at();
create trigger footer_columns_set_updated_at before update on public.footer_columns for each row execute function private.set_updated_at();
create trigger footer_items_set_updated_at before update on public.footer_items for each row execute function private.set_updated_at();
create trigger social_links_set_updated_at before update on public.social_links for each row execute function private.set_updated_at();

create trigger homepage_sections_audit_admin_mutation after insert or update or delete on public.homepage_sections for each row execute function private.audit_admin_mutation();
create trigger homepage_section_products_audit_admin_mutation after insert or update or delete on public.homepage_section_products for each row execute function private.audit_admin_mutation();
create trigger homepage_section_categories_audit_admin_mutation after insert or update or delete on public.homepage_section_categories for each row execute function private.audit_admin_mutation();
create trigger homepage_section_bundles_audit_admin_mutation after insert or update or delete on public.homepage_section_bundles for each row execute function private.audit_admin_mutation();
create trigger content_pages_audit_admin_mutation after insert or update or delete on public.content_pages for each row execute function private.audit_admin_mutation();
create trigger navigation_menus_audit_admin_mutation after insert or update or delete on public.navigation_menus for each row execute function private.audit_admin_mutation();
create trigger navigation_items_audit_admin_mutation after insert or update or delete on public.navigation_items for each row execute function private.audit_admin_mutation();
create trigger footer_columns_audit_admin_mutation after insert or update or delete on public.footer_columns for each row execute function private.audit_admin_mutation();
create trigger footer_items_audit_admin_mutation after insert or update or delete on public.footer_items for each row execute function private.audit_admin_mutation();
create trigger social_links_audit_admin_mutation after insert or update or delete on public.social_links for each row execute function private.audit_admin_mutation();

create or replace function public.reorder_homepage_sections(p_section_ids bigint[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  section_count integer;
begin
  if not private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role]) then
    raise exception using errcode = '42501', message = 'GD_CMS_STAFF_REQUIRED';
  end if;
  if p_section_ids is null or array_length(p_section_ids,1) is null or array_position(p_section_ids,null) is not null
    or (select count(distinct section_id) from unnest(p_section_ids) as requested(section_id)) <> cardinality(p_section_ids) then
    raise exception using errcode = '22023', message = 'GD_HOMEPAGE_SECTION_ID_SET_MISMATCH';
  end if;
  perform 1 from public.homepage_sections order by id for update;
  select count(*)::integer into section_count from public.homepage_sections;
  if section_count <> cardinality(p_section_ids)
    or exists (select 1 from unnest(p_section_ids) as requested(id) left join public.homepage_sections as section on section.id=requested.id where section.id is null) then
    raise exception using errcode = '22023', message = 'GD_HOMEPAGE_SECTION_ID_SET_MISMATCH';
  end if;
  set constraints homepage_sections_sort_order_key deferred;
  with requested as (select id, ordinality - 1 as sort_order from unnest(p_section_ids) with ordinality as item(id,ordinality))
  update public.homepage_sections as section set sort_order=requested.sort_order from requested where section.id=requested.id;
  insert into public.audit_events(actor_user_id,action,entity_type,entity_id,after_state)
  values(actor_id,'content.homepage.reordered','homepage_sections','all',jsonb_build_object('section_ids',to_jsonb(p_section_ids)));
end;
$$;

create or replace function public.publish_homepage_section(p_section_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := (select auth.uid());
begin
  if not private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role]) then
    raise exception using errcode='42501',message='GD_CMS_STAFF_REQUIRED';
  end if;
  perform 1 from public.homepage_sections where id=p_section_id for update;
  if not found then raise exception using errcode='P0002',message='GD_HOMEPAGE_SECTION_NOT_FOUND'; end if;
  update public.homepage_sections set publication_status='published',published_at=now(),active=true where id=p_section_id;
  insert into public.audit_events(actor_user_id,action,entity_type,entity_id,after_state)
  values(actor_id,'content.homepage.published','homepage_sections',p_section_id::text,jsonb_build_object('published',true));
end;
$$;

create or replace function private.insert_navigation_items(p_menu_id bigint,p_parent_id bigint,p_items jsonb,p_depth integer)
returns void language plpgsql security definer set search_path = '' as $$
declare item record; inserted_id bigint; children jsonb;
begin
  if p_depth > 8 or jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode='22023',message='GD_INVALID_NAVIGATION_TREE';
  end if;
  for item in select value, ordinality from jsonb_array_elements(p_items) with ordinality loop
    if jsonb_typeof(item.value) <> 'object'
      or item.value - array['label','href','active','children'] <> '{}'::jsonb
      or nullif(trim(item.value->>'label'),'') is null
      or not private.is_safe_content_link(item.value->>'href') then
      raise exception using errcode='22023',message='GD_INVALID_NAVIGATION_TREE';
    end if;
    children := coalesce(item.value->'children','[]'::jsonb);
    if jsonb_typeof(children) <> 'array' then raise exception using errcode='22023',message='GD_INVALID_NAVIGATION_TREE'; end if;
    insert into public.navigation_items(menu_id,parent_id,label,href,active,sort_order)
    values(p_menu_id,p_parent_id,trim(item.value->>'label'),trim(item.value->>'href'),coalesce((item.value->>'active')::boolean,true),item.ordinality-1)
    returning id into inserted_id;
    perform private.insert_navigation_items(p_menu_id,inserted_id,children,p_depth+1);
  end loop;
end;
$$;
revoke all on function private.insert_navigation_items(bigint,bigint,jsonb,integer) from public, anon, authenticated, service_role;

create or replace function public.save_navigation_tree(p_tree jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := (select auth.uid()); menu jsonb; items jsonb; target_menu_id bigint; normalized_key text; normalized_status public.publication_status;
begin
  if not private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role]) then
    raise exception using errcode='42501',message='GD_CMS_STAFF_REQUIRED';
  end if;
  if jsonb_typeof(p_tree)<>'object' or p_tree-array['menu','items']<>'{}'::jsonb
    or jsonb_typeof(p_tree->'menu')<>'object' or jsonb_typeof(p_tree->'items')<>'array' then
    raise exception using errcode='22023',message='GD_INVALID_NAVIGATION_TREE';
  end if;
  menu:=p_tree->'menu'; items:=p_tree->'items';
  if menu-array['key','label','publication_status','active']<>'{}'::jsonb then raise exception using errcode='22023',message='GD_INVALID_NAVIGATION_TREE'; end if;
  normalized_key:=lower(trim(menu->>'key'));
  normalized_status:=coalesce(nullif(menu->>'publication_status',''),'draft')::public.publication_status;
  if normalized_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or nullif(trim(menu->>'label'),'') is null then
    raise exception using errcode='22023',message='GD_INVALID_NAVIGATION_TREE';
  end if;
  insert into public.navigation_menus(menu_key,label,publication_status,published_at,active)
  values(normalized_key,trim(menu->>'label'),normalized_status,case when normalized_status='published' then now() else null end,coalesce((menu->>'active')::boolean,false))
  on conflict(menu_key) do update set label=excluded.label,publication_status=excluded.publication_status,published_at=case when excluded.publication_status='published' then coalesce(public.navigation_menus.published_at,now()) else null end,active=excluded.active
  returning id into target_menu_id;
  delete from public.navigation_items where menu_id=target_menu_id;
  perform private.insert_navigation_items(target_menu_id,null,items,0);
  insert into public.audit_events(actor_user_id,action,entity_type,entity_id,after_state)
  values(actor_id,'content.navigation.saved','navigation_menus',target_menu_id::text,jsonb_build_object('menu_key',normalized_key));
  return target_menu_id;
exception when invalid_text_representation then
  raise exception using errcode='22023',message='GD_INVALID_NAVIGATION_TREE';
end;
$$;

revoke all on function public.reorder_homepage_sections(bigint[]) from public, anon, authenticated, service_role;
revoke all on function public.publish_homepage_section(bigint) from public, anon, authenticated, service_role;
revoke all on function public.save_navigation_tree(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.reorder_homepage_sections(bigint[]) to authenticated;
grant execute on function public.publish_homepage_section(bigint) to authenticated;
grant execute on function public.save_navigation_tree(jsonb) to authenticated;
