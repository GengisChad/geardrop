-- Scope the meta tier-list tables to organizations.
--
-- 20261005090000_meta_attuale_tier_lists.sql (main branch) created three tables:
--
--   meta_snapshots  – the monthly tier snapshot, standalone root    → tier A
--   meta_rankings   – one ranking entry per snapshot, single parent → tier C
--   meta_videos     – curated YouTube links, standalone root        → tier A
--
-- All three missed the organization scoping that our branch introduced, producing two
-- test failures:
--
--   042 test 12  "no company data is authorized through the global staff role"
--     meta_snapshots_staff_all and meta_rankings_staff_all and meta_videos_staff_all
--     still gate on private.has_staff_role (global).
--
--   044 test 1   "every public table is registered in the organization tier registry"
--     None of the three tables appear in the expected_tiers set.
--
-- This migration is purely additive:
--   • adds organization_id to meta_snapshots and meta_videos (tier A roots only),
--   • back-fills every existing row to Gear Drop (the only company with meta data),
--   • adds the (id, organization_id) unique key, the organization_id index, and the
--     prevent_organization_change trigger that tier A requires,
--   • replaces the three *_staff_all policies with membership-based ones.
--
-- meta_rankings is tier C: organization is read through its parent snapshot.  No column
-- is added; the policy joins to meta_snapshots instead.
--
-- Policy count (test 002 asserts 118):
--   removed  3  (meta_snapshots_staff_all, meta_rankings_staff_all, meta_videos_staff_all)
--   added    3  (same names, new expressions)
--   net      0  → count remains 118, 002_commerce_schema.test.sql needs no change.

begin;

-- ---------------------------------------------------------------------------------------
-- Add organization_id to the two tier A roots.
-- ---------------------------------------------------------------------------------------

do $scope$
declare
  geardrop bigint := (select id from public.organizations where slug = 'geardrop');
begin
  if geardrop is null then
    raise exception using errcode = 'P0002', message = 'GD_GEARDROP_ORGANIZATION_MISSING';
  end if;

  -- meta_snapshots ----------------------------------------------------------------
  execute format(
    'alter table public.meta_snapshots add column organization_id bigint not null'
    ' default %s references public.organizations(id) on delete restrict',
    geardrop
  );
  alter table public.meta_snapshots alter column organization_id drop default;
  alter table public.meta_snapshots
    add constraint meta_snapshots_id_org_key unique (id, organization_id);
  create index meta_snapshots_organization_idx on public.meta_snapshots (organization_id);
  create trigger meta_snapshots_organization_immutable
    before update of organization_id on public.meta_snapshots
    for each row execute function private.prevent_organization_change();

  -- meta_videos -------------------------------------------------------------------
  execute format(
    'alter table public.meta_videos add column organization_id bigint not null'
    ' default %s references public.organizations(id) on delete restrict',
    geardrop
  );
  alter table public.meta_videos alter column organization_id drop default;
  alter table public.meta_videos
    add constraint meta_videos_id_org_key unique (id, organization_id);
  create index meta_videos_organization_idx on public.meta_videos (organization_id);
  create trigger meta_videos_organization_immutable
    before update of organization_id on public.meta_videos
    for each row execute function private.prevent_organization_change();
end;
$scope$;

-- ---------------------------------------------------------------------------------------
-- Replace the global *_staff_all policies with membership-based ones.
-- ---------------------------------------------------------------------------------------

-- meta_snapshots: tier A, check own organization_id.
drop policy "meta_snapshots_staff_all" on public.meta_snapshots;
create policy meta_snapshots_staff_all on public.meta_snapshots
as permissive for all to authenticated
using (
  (organization_id = any (
    (select private.member_organization_ids(
      array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role]
    ))::bigint[]
  ))
)
with check (
  (organization_id = any (
    (select private.member_organization_ids(
      array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role]
    ))::bigint[]
  ))
);

-- meta_rankings: tier C, join to parent snapshot to check its organization_id.
drop policy "meta_rankings_staff_all" on public.meta_rankings;
create policy meta_rankings_staff_all on public.meta_rankings
as permissive for all to authenticated
using (
  (exists (
    select 1 from public.meta_snapshots parent_row
    where parent_row.id = meta_rankings.snapshot_id
      and parent_row.organization_id = any (
        (select private.member_organization_ids(
          array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role]
        ))::bigint[]
      )
  ))
)
with check (
  (exists (
    select 1 from public.meta_snapshots parent_row
    where parent_row.id = meta_rankings.snapshot_id
      and parent_row.organization_id = any (
        (select private.member_organization_ids(
          array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role]
        ))::bigint[]
      )
  ))
);

-- meta_videos: tier A, check own organization_id.
drop policy "meta_videos_staff_all" on public.meta_videos;
create policy meta_videos_staff_all on public.meta_videos
as permissive for all to authenticated
using (
  (organization_id = any (
    (select private.member_organization_ids(
      array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role]
    ))::bigint[]
  ))
)
with check (
  (organization_id = any (
    (select private.member_organization_ids(
      array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role]
    ))::bigint[]
  ))
);

commit;
