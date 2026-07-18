create type public.staff_invite_status as enum('invited','active','revoked');

alter table public.staff_profiles
  add column invite_email text check (invite_email is null or (invite_email=lower(invite_email) and invite_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  add column invite_status public.staff_invite_status not null default 'active',
  add column invited_at timestamptz,
  add column accepted_at timestamptz,
  add column revoked_at timestamptz,
  add column last_login_at timestamptz;
update public.staff_profiles set accepted_at=created_at where active and accepted_at is null;

alter table public.audit_events
  add column request_id text check (request_id is null or char_length(request_id)<=128),
  add column request_method text check (request_method is null or request_method ~ '^[A-Z]{2,16}$'),
  add column request_path text check (request_path is null or char_length(request_path)<=500),
  add column request_user_agent text check (request_user_agent is null or char_length(request_user_agent)<=300);

create or replace function private.sanitize_audit_context()
returns trigger language plpgsql security definer set search_path = '' as $$
declare headers jsonb:='{}'::jsonb;
begin
  begin headers:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb); exception when others then headers:='{}'::jsonb; end;
  new.request_id=left(coalesce(nullif(new.request_id,''),nullif(headers->>'x-request-id','')),128);
  new.request_method=left(upper(coalesce(nullif(new.request_method,''),nullif(current_setting('request.method',true),''))),16);
  new.request_path=left(coalesce(nullif(new.request_path,''),nullif(current_setting('request.path',true),'')),500);
  new.request_user_agent=left(coalesce(nullif(new.request_user_agent,''),nullif(headers->>'user-agent','')),300);
  return new;
end;
$$;
revoke all on function private.sanitize_audit_context() from public,anon,authenticated,service_role;
create trigger audit_events_sanitize_context before insert on public.audit_events for each row execute function private.sanitize_audit_context();

revoke update,delete on public.staff_profiles from authenticated;

create or replace function public.change_staff_role(p_user_id uuid,p_role public.staff_role)
returns void language plpgsql security definer set search_path = '' as $$
declare actor_id uuid:=(select auth.uid()); before_profile public.staff_profiles%rowtype;
begin
  if not private.has_staff_role(array['owner'::public.staff_role]) then raise exception using errcode='42501',message='GD_STAFF_OWNER_REQUIRED'; end if;
  select * into before_profile from public.staff_profiles where user_id=p_user_id for update;
  if not found then raise exception using errcode='P0002',message='GD_STAFF_NOT_FOUND'; end if;
  if before_profile.role='owner' and before_profile.active and p_role<>'owner' and (select count(*) from public.staff_profiles where role='owner' and active)<=1 then raise exception using errcode='55000',message='GD_STAFF_LAST_OWNER'; end if;
  if p_user_id=actor_id then raise exception using errcode='22023',message='GD_STAFF_SELF_CHANGE'; end if;
  update public.staff_profiles set role=p_role,updated_by=actor_id where user_id=p_user_id;
  insert into public.audit_events(actor_user_id,action,entity_type,entity_id,before_state,after_state)
  values(actor_id,'staff.role_changed','staff_profiles',p_user_id::text,jsonb_build_object('role',before_profile.role,'active',before_profile.active),jsonb_build_object('role',p_role,'active',before_profile.active));
end;
$$;

create or replace function public.set_staff_active(p_user_id uuid,p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare actor_id uuid:=(select auth.uid()); before_profile public.staff_profiles%rowtype;
begin
  if not private.has_staff_role(array['owner'::public.staff_role]) then raise exception using errcode='42501',message='GD_STAFF_OWNER_REQUIRED'; end if;
  select * into before_profile from public.staff_profiles where user_id=p_user_id for update;
  if not found then raise exception using errcode='P0002',message='GD_STAFF_NOT_FOUND'; end if;
  if not p_active and before_profile.role='owner' and before_profile.active and (select count(*) from public.staff_profiles where role='owner' and active)<=1 then raise exception using errcode='55000',message='GD_STAFF_LAST_OWNER'; end if;
  if p_user_id=actor_id then raise exception using errcode='22023',message='GD_STAFF_SELF_CHANGE'; end if;
  update public.staff_profiles set active=p_active,invite_status=case when p_active then 'active'::public.staff_invite_status else 'revoked'::public.staff_invite_status end,
    accepted_at=case when p_active then coalesce(accepted_at,now()) else accepted_at end,revoked_at=case when p_active then null else now() end,updated_by=actor_id where user_id=p_user_id;
  insert into public.audit_events(actor_user_id,action,entity_type,entity_id,before_state,after_state)
  values(actor_id,'staff.active_changed','staff_profiles',p_user_id::text,jsonb_build_object('active',before_profile.active,'status',before_profile.invite_status),jsonb_build_object('active',p_active,'status',case when p_active then 'active' else 'revoked' end));
end;
$$;

create or replace function public.revoke_staff_access(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare actor_id uuid:=(select auth.uid()); before_profile public.staff_profiles%rowtype;
begin
  if not private.has_staff_role(array['owner'::public.staff_role]) then raise exception using errcode='42501',message='GD_STAFF_OWNER_REQUIRED'; end if;
  select * into before_profile from public.staff_profiles where user_id=p_user_id for update;
  if not found then raise exception using errcode='P0002',message='GD_STAFF_NOT_FOUND'; end if;
  if before_profile.role='owner' and before_profile.active and (select count(*) from public.staff_profiles where role='owner' and active)<=1 then raise exception using errcode='55000',message='GD_STAFF_LAST_OWNER'; end if;
  if p_user_id=actor_id then raise exception using errcode='22023',message='GD_STAFF_SELF_CHANGE'; end if;
  update public.staff_profiles set active=false,invite_status='revoked',revoked_at=now(),updated_by=actor_id where user_id=p_user_id;
  insert into public.audit_events(actor_user_id,action,entity_type,entity_id,before_state,after_state)
  values(actor_id,'staff.revoked','staff_profiles',p_user_id::text,jsonb_build_object('active',before_profile.active,'status',before_profile.invite_status),jsonb_build_object('active',false,'status','revoked'));
end;
$$;

revoke all on function public.change_staff_role(uuid,public.staff_role) from public,anon,authenticated,service_role;
revoke all on function public.set_staff_active(uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function public.revoke_staff_access(uuid) from public,anon,authenticated,service_role;
grant execute on function public.change_staff_role(uuid,public.staff_role) to authenticated;
grant execute on function public.set_staff_active(uuid,boolean) to authenticated;
grant execute on function public.revoke_staff_access(uuid) to authenticated;
