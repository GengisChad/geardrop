-- Expand step of the organizations rollout: the app running in production keeps working on this schema.
--
-- The database is migrated before the new app is deployed, so for a few minutes the app built
-- from main before this branch runs against the schema with companies. Without this migration
-- that app breaks: every storefront page and the whole /admin filter site_settings on the
-- dropped singleton column, its admin RPC calls name signatures that no longer exist, and its
-- direct inserts leave out organization_id, which tier-A tables require without a default.
-- The reverse order is worse (the new app needs public.organizations to serve at all), so the
-- rollout is database first, then app; see docs/operations/multi-organization-foundation.md.
--
-- Everything here is transitional. It assumes the old app's single shop, the one organization
-- with a public storefront (private.single_storefront_organization()), and it is removed by a
-- contract migration once the new app is live everywhere. The new app does not depend on any of
-- it: it passes organization_id itself, never reads singleton, and calls the scoped signatures.

begin;

-- 1. site_settings.singleton, readable again for the old app's .eq("singleton", true).
--    True only on the row of the company with the public storefront, so the old app finds
--    exactly that row; the trigger keeps it so for rows inserted later (a fresh seed included).
alter table public.site_settings add column singleton boolean;

comment on column public.site_settings.singleton is
  'Transitional, for the app built before organizations: true on the storefront company''s row. Removed by the contract migration.';

create function private.mark_storefront_site_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organization_id = (
    select min(organization.id) from public.organizations as organization
    where organization.storefront_public and organization.active
  ) then
    new.singleton := true;
  else
    new.singleton := null;
  end if;
  return new;
end;
$$;

revoke all on function private.mark_storefront_site_settings() from public, anon, authenticated, service_role;

create trigger site_settings_mark_singleton
before insert or update of organization_id, singleton on public.site_settings
for each row execute function private.mark_storefront_site_settings();

-- Recomputed by the trigger above; the audit trigger records nothing without a request actor.
update public.site_settings set singleton = true;

create unique index site_settings_one_singleton on public.site_settings (singleton) where singleton;

grant select (singleton) on public.site_settings to anon, authenticated, service_role;

-- 2. A company for the old app's inserts. Tier-A tables keep organization_id NOT NULL without a
--    default, so the generated types still make the new app name the company; this BEFORE
--    INSERT trigger fills it only when a row arrives without one, which only the old app does.
--    Named with a leading underscore so it fires before every other BEFORE trigger on these
--    tables (they fire in name order), some of which read organization_id.
create function private.fill_storefront_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organization_id is null then
    new.organization_id := private.single_storefront_organization();
  end if;
  return new;
end;
$$;

revoke all on function private.fill_storefront_organization() from public, anon, authenticated, service_role;

-- Every tier-A table that already existed before organizations: the old app knows no other.
do $fill$
declare
  table_name text;
begin
  foreach table_name in array array[
    'bundles', 'categories', 'content_pages', 'coupons', 'customer_profiles', 'footer_columns',
    'homepage_sections', 'media_assets', 'meta_snapshots', 'meta_videos', 'navigation_menus',
    'order_enablement_checks', 'orders', 'products', 'promotions', 'restock_requests',
    'shipping_methods', 'site_settings', 'social_links', 'storefront_daily_events'
  ] loop
    execute format(
      'create trigger _fill_storefront_organization before insert on public.%I '
      'for each row execute function private.fill_storefront_organization()',
      table_name
    );
  end loop;
end;
$fill$;

-- 3. The old app's RPC signatures. Each one forwards to the scoped function with the storefront
--    company, which still checks the caller's role in that company, so staff of another company
--    gain nothing. Parameter names are the old ones: PostgREST matches a call by them. The three
--    storefront RPCs (track_storefront_event, request_restock_notice,
--    record_stripe_checkout_order) need nothing here: their p_organization_id has a default.
create function public.adjust_inventory(
  p_sku text, p_delta integer, p_reason public.inventory_reason, p_note text default null
)
returns integer language sql security definer set search_path = '' as $$
  select public.adjust_inventory(private.single_storefront_organization(), p_sku, p_delta, p_reason, p_note);
$$;

create function public.change_staff_role(p_user_id uuid, p_role public.staff_role)
returns void language sql security definer set search_path = '' as $$
  select public.change_staff_role(private.single_storefront_organization(), p_user_id, p_role);
$$;

create function public.get_admin_dashboard_metrics()
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.get_admin_dashboard_metrics(private.single_storefront_organization());
$$;

create function public.get_inventory_restock_demand(p_slugs text[])
returns table (product_slug text, pending_notices bigint, preorder_demand bigint)
language sql stable security definer set search_path = '' as $$
  select * from public.get_inventory_restock_demand(private.single_storefront_organization(), p_slugs);
$$;

create function public.read_funnel_stats(p_days integer default 30)
returns table (day date, event text, count integer)
language sql security definer set search_path = '' as $$
  select * from public.read_funnel_stats(private.single_storefront_organization(), p_days);
$$;

create function public.record_staff_invite(
  p_user_id uuid, p_email text, p_display_name text, p_role public.staff_role
)
returns void language sql security definer set search_path = '' as $$
  select public.record_staff_invite(private.single_storefront_organization(), p_user_id, p_email, p_display_name, p_role);
$$;

create function public.save_bundle_with_items(p_bundle jsonb, p_items jsonb)
returns bigint language sql security definer set search_path = '' as $$
  select public.save_bundle_with_items(private.single_storefront_organization(), p_bundle, p_items);
$$;

create function public.save_coupon_with_targets(
  p_coupon jsonb, p_product_ids bigint[], p_category_ids bigint[], p_bundle_ids bigint[]
)
returns bigint language sql security definer set search_path = '' as $$
  select public.save_coupon_with_targets(private.single_storefront_organization(), p_coupon, p_product_ids, p_category_ids, p_bundle_ids);
$$;

create function public.save_footer_configuration(p_configuration jsonb)
returns void language sql security definer set search_path = '' as $$
  select public.save_footer_configuration(private.single_storefront_organization(), p_configuration);
$$;

create function public.save_homepage_section(p_section jsonb, p_target_ids bigint[])
returns bigint language sql security definer set search_path = '' as $$
  select public.save_homepage_section(private.single_storefront_organization(), p_section, p_target_ids);
$$;

create function public.save_navigation_tree(p_tree jsonb)
returns bigint language sql security definer set search_path = '' as $$
  select public.save_navigation_tree(private.single_storefront_organization(), p_tree);
$$;

create function public.save_promotion_with_targets(
  p_promotion jsonb, p_product_ids bigint[], p_category_ids bigint[], p_bundle_ids bigint[]
)
returns bigint language sql security definer set search_path = '' as $$
  select public.save_promotion_with_targets(private.single_storefront_organization(), p_promotion, p_product_ids, p_category_ids, p_bundle_ids);
$$;

create function public.set_manual_order_enablement_check(
  p_key text, p_status public.enablement_check_status, p_evidence text
)
returns void language sql security definer set search_path = '' as $$
  select public.set_manual_order_enablement_check(private.single_storefront_organization(), p_key, p_status, p_evidence);
$$;

create function public.set_order_acceptance(p_enabled boolean, p_confirmation text)
returns void language sql security definer set search_path = '' as $$
  select public.set_order_acceptance(private.single_storefront_organization(), p_enabled, p_confirmation);
$$;

create function public.set_staff_active(p_user_id uuid, p_active boolean)
returns void language sql security definer set search_path = '' as $$
  select public.set_staff_active(private.single_storefront_organization(), p_user_id, p_active);
$$;

-- Same grants the old signatures had: staff only, through their session.
do $grants$
declare
  signature text;
begin
  foreach signature in array array[
    'public.adjust_inventory(text, integer, public.inventory_reason, text)',
    'public.change_staff_role(uuid, public.staff_role)',
    'public.get_admin_dashboard_metrics()',
    'public.get_inventory_restock_demand(text[])',
    'public.read_funnel_stats(integer)',
    'public.record_staff_invite(uuid, text, text, public.staff_role)',
    'public.save_bundle_with_items(jsonb, jsonb)',
    'public.save_coupon_with_targets(jsonb, bigint[], bigint[], bigint[])',
    'public.save_footer_configuration(jsonb)',
    'public.save_homepage_section(jsonb, bigint[])',
    'public.save_navigation_tree(jsonb)',
    'public.save_promotion_with_targets(jsonb, bigint[], bigint[], bigint[])',
    'public.set_manual_order_enablement_check(text, public.enablement_check_status, text)',
    'public.set_order_acceptance(boolean, text)',
    'public.set_staff_active(uuid, boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', signature);
    execute format('grant execute on function %s to authenticated', signature);
    execute format('comment on function %s is %L', signature,
      'Transitional signature for the app built before organizations; removed by the contract migration.');
  end loop;
end;
$grants$;

commit;
