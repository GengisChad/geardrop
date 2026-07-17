create or replace function private.bootstrap_initial_owners(p_emails text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_emails text[];
  matched_users integer;
  inserted_owners integer;
begin
  if p_emails is null or cardinality(p_emails) <> 2 then
    raise exception using errcode = '22023', message = 'GD_OWNER_BOOTSTRAP_REQUIRES_TWO_EMAILS';
  end if;

  select array_agg(lower(trim(candidate_email)) order by lower(trim(candidate_email)))
  into normalized_emails
  from unnest(p_emails) as candidate(candidate_email);

  if exists (
    select 1
    from unnest(normalized_emails) as normalized(email)
    where email = ''
  ) or (
    select count(distinct email)
    from unnest(normalized_emails) as normalized(email)
  ) <> 2 then
    raise exception using errcode = '22023', message = 'GD_OWNER_BOOTSTRAP_REQUIRES_TWO_DISTINCT_EMAILS';
  end if;

  lock table public.staff_profiles in exclusive mode;

  if exists (select 1 from public.staff_profiles) then
    raise exception using errcode = 'P0001', message = 'GD_OWNER_BOOTSTRAP_ALREADY_USED';
  end if;

  select count(*)::integer
  into matched_users
  from auth.users
  where lower(email) = any (normalized_emails)
    and email_confirmed_at is not null;

  if matched_users <> 2 then
    raise exception using errcode = 'P0002', message = 'GD_OWNER_BOOTSTRAP_USERS_NOT_READY';
  end if;

  insert into public.staff_profiles (user_id, role, display_name, active)
  select
    auth_user.id,
    'owner'::public.staff_role,
    coalesce(
      nullif(trim(auth_user.raw_user_meta_data ->> 'display_name'), ''),
      split_part(auth_user.email, '@', 1)
    ),
    true
  from auth.users as auth_user
  where lower(auth_user.email) = any (normalized_emails)
  order by lower(auth_user.email);

  get diagnostics inserted_owners = row_count;

  if inserted_owners <> 2 then
    raise exception using errcode = 'P0001', message = 'GD_OWNER_BOOTSTRAP_INCOMPLETE';
  end if;

  insert into public.audit_events (action, entity_type, entity_id, after_state)
  select
    'initial_owner_bootstrap',
    'staff_profile',
    staff.user_id::text,
    jsonb_build_object('role', staff.role, 'active', staff.active)
  from public.staff_profiles as staff;

  return inserted_owners;
end;
$$;

comment on function private.bootstrap_initial_owners(text[]) is
  'One-shot, direct-database bootstrap for exactly two confirmed initial owners.';

revoke all on function private.bootstrap_initial_owners(text[]) from public, anon, authenticated, service_role;
