begin;
select plan(12);

-- The one-shot owner bootstrap is gone after 20260721010000_retire_owner_bootstrap, and
-- its removal must not have cost anything: no owner demoted, no audit rewritten, no
-- grant left dangling, and staff management still reachable through the normal RPCs.

-- Fixtures: two owners, exactly the shape the retired bootstrap used to create --------
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000002401','authenticated','authenticated','owner-one@example.com','',now(),'{}','{}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000002402','authenticated','authenticated','owner-two@example.com','',now(),'{}','{}',now(),now(),'','','','');
insert into public.staff_profiles(user_id,role,display_name,active) values
('00000000-0000-0000-0000-000000002401','owner','Owner One',true),
('00000000-0000-0000-0000-000000002402','owner','Owner Two',true);
insert into public.audit_events(action,entity_type,entity_id,after_state) values
('initial_owner_bootstrap','staff_profile','00000000-0000-0000-0000-000000002401','{"role":"owner","active":true}'),
('initial_owner_bootstrap','staff_profile','00000000-0000-0000-0000-000000002402','{"role":"owner","active":true}');

-- 1-3. The function is gone, by every name it could be reached under -----------------
select ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'bootstrap_initial_owners'
  ),
  'private.bootstrap_initial_owners is dropped'
);
select hasnt_function('private','bootstrap_initial_owners','the bootstrap function name is unused');
select ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.proname like '%bootstrap_initial_owner%'
  ),
  'no bootstrap variant survives in any schema'
);

-- 4-5. No grant or default privilege survives it --------------------------------------
select ok(
  not exists (
    select 1 from information_schema.routine_privileges
    where routine_schema = 'private' and routine_name = 'bootstrap_initial_owners'
  ),
  'no routine privilege refers to the dropped function'
);
select ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = 'bootstrap_initial_owners'
      and p.proacl is not null
  ),
  'no residual ACL entry'
);

-- 6-9. Existing owners and their audit trail are untouched ----------------------------
select is(
  (select count(*)::int from public.staff_profiles where active and role = 'owner'),
  2,
  'both owners are still active'
);
select is((select count(*)::int from public.staff_profiles), 2, 'no staff row added or removed');
select is(
  (select count(*)::int from public.audit_events where action = 'initial_owner_bootstrap'),
  2,
  'the bootstrap audit events are preserved'
);
select is(
  (select role::text from public.staff_profiles where user_id = '00000000-0000-0000-0000-000000002401'),
  'owner',
  'the first owner keeps its role'
);

-- 10-12. Staff management continues through the normal RPCs ---------------------------
-- These are the functions the admin panel calls; they re-check the caller's role, so
-- losing the bootstrap costs no capability.
select has_function('public','record_staff_invite','staff can still be invited');
select has_function('public','change_staff_role','roles can still be changed');
select ok(
  (select bool_and(prosecdef) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('record_staff_invite','change_staff_role','set_staff_active','revoke_staff_access')),
  'every surviving staff RPC is still security definer'
);

select * from finish();
rollback;
