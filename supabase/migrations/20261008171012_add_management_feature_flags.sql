begin;

create type public.management_feature as enum (
  'read_access', 'inventory_writes', 'purchasing_writes', 'fulfillment_writes',
  'pricing_writes', 'marketing_writes', 'external_effects'
);

create table public.organization_management_features (
  organization_id bigint not null references public.organizations(id) on delete restrict,
  feature public.management_feature not null,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (organization_id, feature)
);
create index organization_management_features_updated_by_idx
  on public.organization_management_features(updated_by) where updated_by is not null;
create trigger organization_management_features_immutable_organization
  before update on public.organization_management_features
  for each row execute function private.prevent_organization_change();

insert into public.organization_management_features(organization_id, feature)
select organization.id, feature
from public.organizations organization cross join unnest(enum_range(null::public.management_feature)) feature
on conflict do nothing;

alter table public.organization_management_features enable row level security;
alter table public.organization_management_features force row level security;
revoke all on public.organization_management_features from public, anon, authenticated, service_role;
grant select on public.organization_management_features to authenticated;
create policy management_features_member_read on public.organization_management_features
for select to authenticated using (
  organization_id = any ((select private.member_organization_ids(
    array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role]
  ))::bigint[])
);

create function private.require_aal2(p_message text)
returns void language plpgsql stable security invoker set search_path = '' as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'aal','aal1') <> 'aal2' then
    raise exception using errcode='42501', message=p_message;
  end if;
end;
$$;

create function private.management_feature_enabled(p_organization_id bigint, p_feature public.management_feature)
returns boolean language sql stable security invoker set search_path = '' as $$
  select coalesce(private.org_role(p_organization_id) is not null and exists (
    select 1 from public.organization_management_features f
    where f.organization_id=p_organization_id and f.feature=p_feature and f.enabled
  ), false);
$$;

create function private.require_management_feature(p_organization_id bigint, p_feature public.management_feature)
returns void language plpgsql stable security invoker set search_path = '' as $$
begin
  if not private.management_feature_enabled(p_organization_id,p_feature) then
    raise exception using errcode='42501',message='GD_MANAGEMENT_FEATURE_DISABLED';
  end if;
end;
$$;

revoke all on function private.require_aal2(text) from public, anon, authenticated, service_role;
revoke all on function private.management_feature_enabled(bigint,public.management_feature) from public, anon, authenticated, service_role;
revoke all on function private.require_management_feature(bigint,public.management_feature) from public, anon, authenticated, service_role;
grant execute on function private.management_feature_enabled(bigint,public.management_feature) to authenticated;
grant execute on function private.require_management_feature(bigint,public.management_feature) to authenticated;

-- Roles outlive a local database reset. Reuse only this dedicated, unprivileged role.
do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname='management_feature_writer') then
    create role management_feature_writer nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
  elsif exists (select 1 from pg_catalog.pg_roles where rolname='management_feature_writer'
    and (rolcanlogin or rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls or rolinherit)) then
    raise exception 'GD_MANAGEMENT_WRITER_ROLE_UNSAFE';
  end if;
end;
$$;
grant usage on schema public, private to management_feature_writer;
-- The writer has no auth schema privilege. Signed request claims supply identity/AAL;
-- private.org_role still reads the fresh membership, organization and staff tables.
grant execute on function private.org_role(bigint), private.require_aal2(text) to management_feature_writer;
grant select on public.organization_management_features to management_feature_writer;
grant update(enabled,updated_at,updated_by) on public.organization_management_features to management_feature_writer;
create policy management_features_writer_read on public.organization_management_features
for select to management_feature_writer using (
  feature='read_access' and (select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub') is not null
  and private.org_role(organization_id)='owner'
  and coalesce((select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'aal'),'aal1')='aal2'
);
create policy management_features_writer_update on public.organization_management_features
for update to management_feature_writer using (
  feature='read_access' and (select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub') is not null
  and private.org_role(organization_id)='owner'
  and coalesce((select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'aal'),'aal1')='aal2'
) with check (
  feature='read_access' and (select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub') is not null
  and private.org_role(organization_id)='owner'
  and coalesce((select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'aal'),'aal1')='aal2'
  and updated_by=(select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid)
);

-- Append-only, organization-scoped audit; no read/update/delete grant on audit data.
grant insert(actor_user_id,action,entity_type,entity_id,before_state,after_state,organization_id)
  on public.audit_events to management_feature_writer;
grant usage on sequence public.audit_events_id_seq to management_feature_writer;
create policy management_features_writer_audit on public.audit_events
for insert to management_feature_writer with check (
  actor_user_id=(select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid)
  and private.org_role(organization_id)='owner'
  and coalesce((select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'aal'),'aal1')='aal2'
  and action='management.read_access_changed' and entity_type='organization_management_features'
  and entity_id=organization_id::text || ':read_access'
  and before_state->>'feature'='read_access' and after_state->>'feature'='read_access'
);

create function private.set_management_read_access(
  p_organization_id bigint, p_enabled boolean, p_expected_updated_at timestamptz, p_reason text
) returns public.organization_management_features
language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid;
  previous public.organization_management_features;
  changed public.organization_management_features;
begin
  begin
    actor_id := (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode='42501',message='GD_MANAGEMENT_OWNER_REQUIRED';
  end;
  if actor_id is null or private.org_role(p_organization_id) is distinct from 'owner'::public.staff_role then
    raise exception using errcode='42501',message='GD_MANAGEMENT_OWNER_REQUIRED';
  end if;
  perform private.require_aal2('GD_MANAGEMENT_AAL2_REQUIRED');
  if p_enabled is null or p_expected_updated_at is null then
    raise exception using errcode='22023',message='GD_MANAGEMENT_INPUT_INVALID';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 500 then
    raise exception using errcode='22023',message='GD_MANAGEMENT_REASON_INVALID';
  end if;
  select f.* into previous from public.organization_management_features f
    where f.organization_id=p_organization_id and f.feature='read_access';
  update public.organization_management_features f
    set enabled=p_enabled, updated_at=greatest(clock_timestamp(), f.updated_at + interval '1 microsecond'), updated_by=actor_id
    where f.organization_id=p_organization_id and f.feature='read_access' and f.updated_at=p_expected_updated_at
    returning f.* into changed;
  if not found then
    -- An application version conflict is final, not a retryable serialization failure.
    raise exception using errcode='PT409',message='GD_MANAGEMENT_FEATURE_CONFLICT';
  end if;
  insert into public.audit_events(actor_user_id,action,entity_type,entity_id,before_state,after_state,organization_id)
  values(actor_id,'management.read_access_changed','organization_management_features',p_organization_id::text || ':read_access',
    to_jsonb(previous), to_jsonb(changed) || jsonb_build_object('reason',btrim(p_reason)),p_organization_id);
  return changed;
end;
$$;
-- PostgreSQL ownership transfer requires CREATE for the new owner. It is revoked
-- inside this same transaction, before the NOLOGIN role is ever usable by an RPC.
revoke all on function private.set_management_read_access(bigint,boolean,timestamptz,text) from public, anon, authenticated, service_role;
grant execute on function private.set_management_read_access(bigint,boolean,timestamptz,text) to authenticated;
grant create on schema private to management_feature_writer;
grant management_feature_writer to postgres;
alter function private.set_management_read_access(bigint,boolean,timestamptz,text) owner to management_feature_writer;
revoke management_feature_writer from postgres;
revoke create on schema private from management_feature_writer;

create schema management_api;
revoke all on schema management_api from public, anon, authenticated, service_role;
-- A schema-local default REVOKE cannot cancel PostgreSQL's global PUBLIC default.
-- Revoke each routine explicitly below; the pgTAP inventory locks down future additions.
grant usage on schema management_api to authenticated;

create function management_api.list_management_features(p_organization_id bigint)
returns table(feature public.management_feature, enabled boolean, updated_at timestamptz)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if (select auth.uid()) is null or private.org_role(p_organization_id) is null then
    raise exception using errcode='42501',message='GD_MANAGEMENT_MEMBER_REQUIRED';
  end if;
  return query select f.feature,f.enabled,f.updated_at from public.organization_management_features f
    where f.organization_id=p_organization_id order by f.feature;
end;
$$;

create function management_api.set_management_read_access(
  p_organization_id bigint, p_enabled boolean, p_expected_updated_at timestamptz, p_reason text
) returns public.organization_management_features
language sql security invoker set search_path = '' as $$
  select private.set_management_read_access(p_organization_id,p_enabled,p_expected_updated_at,p_reason);
$$;
revoke all on function management_api.list_management_features(bigint) from public, anon, authenticated, service_role;
revoke all on function management_api.set_management_read_access(bigint,boolean,timestamptz,text) from public, anon, authenticated, service_role;
grant execute on function management_api.list_management_features(bigint) to authenticated;
grant execute on function management_api.set_management_read_access(bigint,boolean,timestamptz,text) to authenticated;

-- Provision even inactive organizations in their INSERT transaction. Only trusted
-- organization creation can invoke this trigger; it grants no writer/API capability.
create function private.provision_management_features()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op <> 'INSERT' or tg_when <> 'AFTER' or tg_level <> 'ROW'
    or tg_table_schema <> 'public' or tg_table_name <> 'organizations' or tg_nargs <> 0 then
    raise exception using errcode='42501',message='GD_MANAGEMENT_PROVISION_TRIGGER_ONLY';
  end if;
  insert into public.organization_management_features(organization_id,feature,enabled)
    select new.id, feature, false
    from pg_catalog.unnest(pg_catalog.enum_range(null::public.management_feature)) feature
    on conflict do nothing;
  return new;
end;
$$;
alter function private.provision_management_features() owner to postgres;
revoke all on function private.provision_management_features()
  from public, anon, authenticated, service_role, management_feature_writer;
create trigger organizations_provision_management_features
  after insert on public.organizations
  for each row execute function private.provision_management_features();

commit;
