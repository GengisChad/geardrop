begin;
select no_plan();

select has_type('public', 'management_feature', 'management enum exists');
select results_eq(
  $$select e.enumlabel::text collate "C" from pg_catalog.pg_enum e join pg_catalog.pg_type t on t.oid=e.enumtypid
    where t.typnamespace='public'::regnamespace and t.typname='management_feature' order by e.enumsortorder$$,
  $$values ('read_access'::text collate "C"), ('inventory_writes'), ('purchasing_writes'), ('fulfillment_writes'), ('pricing_writes'), ('marketing_writes'), ('external_effects')$$,
  'exactly seven management features');
select has_table('public', 'organization_management_features', 'feature table exists');
select results_eq(
  $$select o.slug, count(f.feature)::integer, bool_and(not f.enabled) from public.organizations o
    left join public.organization_management_features f on f.organization_id=o.id where o.active group by o.slug order by o.slug$$,
  $$values ('geardrop'::text,7,true), ('oryvenne'::text,7,true)$$, 'every active organization starts with seven disabled flags');

insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-000000004901','flags-owner@example.test'),
 ('00000000-0000-0000-0000-000000004902','flags-admin@example.test'),
 ('00000000-0000-0000-0000-000000004903','flags-outsider@example.test');
insert into public.staff_profiles (user_id, role, display_name) values
 ('00000000-0000-0000-0000-000000004901','owner','Flags owner'),
 ('00000000-0000-0000-0000-000000004902','admin','Flags admin');
insert into public.organization_members (organization_id,user_id,role)
 select id, '00000000-0000-0000-0000-000000004901', 'owner' from public.organizations where slug='geardrop';
insert into public.organization_members (organization_id,user_id,role)
 select id, '00000000-0000-0000-0000-000000004902', 'admin' from public.organizations where slug='geardrop';
create temporary table fx as select o.id, o.slug, f.updated_at from public.organizations o
 join public.organization_management_features f on f.organization_id=o.id where f.feature='read_access';
grant select on fx to anon, authenticated, management_feature_writer;

select ok(not r.rolcanlogin and not r.rolsuper and not r.rolbypassrls and not r.rolcreaterole, 'writer cannot login, bypass RLS, create roles or act as superuser')
 from pg_catalog.pg_roles r where r.rolname='management_feature_writer';
select ok(c.relrowsecurity and c.relforcerowsecurity and c.relowner <> 'management_feature_writer'::regrole,
 'writer does not own table; RLS is enabled and forced') from pg_catalog.pg_class c where c.oid='public.organization_management_features'::regclass;
select ok(not pg_catalog.pg_has_role(role_name,'management_feature_writer','MEMBER'), role_name || ' cannot assume writer')
from (values ('authenticated'),('authenticator'),('anon'),('service_role')) roles(role_name);
select ok(not pg_catalog.pg_has_role('postgres','management_feature_writer','SET'), 'postgres cannot SET ROLE writer');
select is_empty($$select member from pg_catalog.pg_auth_members where roleid='management_feature_writer'::regrole
 and (member<>'postgres'::regrole or set_option or inherit_option or not admin_option or grantor<>'supabase_admin'::regrole)$$,
 'only the PG17 automatic admin-only membership may remain');
select ok(not pg_catalog.has_schema_privilege('management_feature_writer','private','CREATE'), 'writer cannot create functions');
select ok(not pg_catalog.has_schema_privilege('management_feature_writer','auth','USAGE'), 'writer has no auth schema access');
select ok(not pg_catalog.has_column_privilege('management_feature_writer','public.organization_management_features','feature','UPDATE'), 'writer cannot rename feature');
select ok(not pg_catalog.has_column_privilege('management_feature_writer','public.organization_management_features','organization_id','UPDATE'), 'writer cannot change organization');
select ok(not pg_catalog.has_table_privilege('management_feature_writer','public.audit_events','SELECT,UPDATE,DELETE'), 'writer audit grant is append-only');
select ok(not pg_catalog.has_schema_privilege('authenticated','management_api','CREATE'), 'authenticated cannot create API');
select ok(not pg_catalog.has_schema_privilege('anon','management_api','USAGE'), 'anon has no schema access');
select ok(not pg_catalog.has_schema_privilege('service_role','management_api','USAGE'), 'service role has no management API grant');
select is_empty($$select proname from pg_catalog.pg_proc where pronamespace='management_api'::regnamespace and prosecdef$$,
 'no exposed function is security definer');
select results_eq($$select proname::text collate "C" from pg_catalog.pg_proc where pronamespace='management_api'::regnamespace order by proname$$,
 $$values ('list_management_features'::text collate "C"), ('set_management_read_access')$$, 'only named entrypoints exposed');
select has_function('management_api','list_management_features',array['bigint'],'list has only organization input');
select has_function('management_api','set_management_read_access',array['bigint','boolean','timestamp with time zone','text'],'setter has exact read-only control signature');
select is_empty($$select p.proname from pg_catalog.pg_proc p where p.pronamespace='management_api'::regnamespace
 and (pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') or pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
 or not pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE'))$$,
 'authenticated alone can execute the entire exact API inventory');
select is_empty($$select p.proname from pg_catalog.pg_proc p where p.proname='set_management_feature'$$, 'no generic setter anywhere');
select results_eq($$select policyname::text collate "C",cmd::text collate "C" from pg_catalog.pg_policies
 where schemaname='public' and policyname like 'management_features_%' order by policyname$$,
 $$values ('management_features_member_read'::text collate "C",'SELECT'::text collate "C"),('management_features_writer_audit','INSERT'),('management_features_writer_read','SELECT'),('management_features_writer_update','UPDATE')$$,
 'exactly four named policies with their intended operations');
select is_empty($$select p.proname from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace,
 lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
 where (n.nspname='management_api' or p.proname in ('require_aal2','require_management_feature','management_feature_enabled','set_management_read_access'))
 and a.grantee=0 and a.privilege_type='EXECUTE'$$, 'no PUBLIC execution on new functions');
select is_empty($$select p.proname from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='management_api' or p.proname in ('require_aal2','require_management_feature','management_feature_enabled','set_management_read_access'))
 and not coalesce(p.proconfig @> array['search_path=""'], false)$$, 'all new functions have empty search path');
select ok(not pg_catalog.has_function_privilege('anon','private.set_management_read_access(bigint,boolean,timestamptz,text)','EXECUTE'), 'anon cannot call private writer');
select ok(not pg_catalog.has_function_privilege('service_role','private.set_management_read_access(bigint,boolean,timestamptz,text)','EXECUTE'), 'service role cannot call private writer');

set local role anon;
select throws_ok($$select * from public.organization_management_features$$,'42501',null,'anon cannot read flags');
select throws_ok($$select * from management_api.list_management_features(1)$$,'42501',null,'anon cannot list RPC');
select throws_ok($$insert into public.organization_management_features(organization_id,feature) values(1,'read_access')$$,'42501',null,'anon INSERT denied');
select throws_ok($$update public.organization_management_features set enabled=true$$,'42501',null,'anon UPDATE denied');
select throws_ok($$delete from public.organization_management_features$$,'42501',null,'anon DELETE denied');
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select throws_ok($$select management_api.set_management_read_access((select id from fx where slug='geardrop'),false,now(),'Missing subject')$$,'42501','GD_MANAGEMENT_OWNER_REQUIRED','missing signed subject denies');
reset role;
select set_config('request.jwt.claims','{"sub":"invalid-uuid","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select throws_ok($$select management_api.set_management_read_access((select id from fx where slug='geardrop'),false,now(),'Invalid subject')$$,'42501','GD_MANAGEMENT_OWNER_REQUIRED','malformed subject denies');
reset role;
select set_config('request.jwt.claims','malformed-json',true);
set local role authenticated;
select throws_ok($$select management_api.set_management_read_access((select id from fx where slug='geardrop'),false,now(),'Invalid claims')$$,'42501','GD_MANAGEMENT_OWNER_REQUIRED','malformed signed claims deny');
reset role;

select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000004901","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select count(*) from public.organization_management_features),7::bigint,'member sees only own organization flags');
select is((select count(*) from management_api.list_management_features((select id from fx where slug='geardrop'))),7::bigint,'member lists seven flags');
select throws_ok($$select * from management_api.list_management_features((select id from fx where slug='oryvenne'))$$,'42501','GD_MANAGEMENT_MEMBER_REQUIRED','member cannot list wrong organization');
select throws_ok($$insert into public.organization_management_features(organization_id,feature) values(1,'read_access')$$,'42501',null,'authenticated INSERT denied');
select throws_ok($$update public.organization_management_features set enabled=true$$,'42501',null,'authenticated UPDATE denied');
select throws_ok($$delete from public.organization_management_features$$,'42501',null,'authenticated DELETE denied');
select throws_ok($$select private.require_management_feature((select id from fx where slug='geardrop'),'read_access')$$,'42501','GD_MANAGEMENT_FEATURE_DISABLED','disabled helper denies');
select throws_ok($$select management_api.set_management_read_access((select id from fx where slug='oryvenne'),true,(select updated_at from fx where slug='oryvenne'),'Enable access')$$,'42501','GD_MANAGEMENT_OWNER_REQUIRED','wrong organization owner denied');
select throws_ok($$select management_api.set_management_read_access(null,true,now(),'Enable access')$$,'42501','GD_MANAGEMENT_OWNER_REQUIRED','null organization denied');
select throws_ok($$select management_api.set_management_read_access((select id from fx where slug='geardrop'),true,(select updated_at from fx where slug='geardrop'),'ab')$$,'22023','GD_MANAGEMENT_REASON_INVALID','short reason denied');
select throws_ok($$select management_api.set_management_read_access((select id from fx where slug='geardrop'),true,(select updated_at from fx where slug='geardrop'),repeat('x',501))$$,'22023','GD_MANAGEMENT_REASON_INVALID','long reason denied');
select throws_ok($$select management_api.set_management_read_access((select id from fx where slug='geardrop'),null,now(),'Enable access')$$,'22023','GD_MANAGEMENT_INPUT_INVALID','null boolean denied');
select throws_ok($$select management_api.set_management_read_access((select id from fx where slug='geardrop'),true,null,'Enable access')$$,'22023','GD_MANAGEMENT_INPUT_INVALID','null expected version denied');

-- Each prohibited flag gets independent enable AND disable attempts, not a shared count.
select throws_ok(format('select management_api.set_management_read_access(p_organization_id=>1, p_enabled=>%L::boolean, p_expected_updated_at=>now(), p_reason=>%L, p_feature=>%L::public.management_feature)', desired, 'Forbidden flag change', feature),
 '42883',null,feature || ' cannot be ' || case when desired then 'enabled' else 'disabled' end || ' via exposed setter')
from (values ('inventory_writes'),('purchasing_writes'),('fulfillment_writes'),('pricing_writes'),('marketing_writes'),('external_effects')) f(feature)
cross join (values(true),(false)) b(desired);
select lives_ok($$select management_api.set_management_read_access((select id from fx where slug='geardrop'),true,(select updated_at from fx where slug='geardrop'),'Enable read-only access')$$,'owner AAL2 enables read access');
select lives_ok($$select private.require_management_feature((select id from fx where slug='geardrop'),'read_access')$$,'enabled helper permits');
select throws_ok($$select management_api.set_management_read_access((select id from fx where slug='geardrop'),false,(select updated_at from fx where slug='geardrop'),'Stale update')$$,'PT409','GD_MANAGEMENT_FEATURE_CONFLICT','stale version denied atomically without serialization retries');
select throws_ok($$select private.require_management_feature((select id from fx where slug='geardrop'),'inventory_writes')$$,'42501','GD_MANAGEMENT_FEATURE_DISABLED','read access does not enable writes');
reset role;
select is((select count(*) from public.audit_events where action='management.read_access_changed' and actor_user_id='00000000-0000-0000-0000-000000004901'),1::bigint,'one successful change produces exactly one audit');
select results_eq($$select organization_id=(select id from fx where slug='geardrop'), before_state->>'enabled',after_state->>'enabled',after_state->>'reason' from public.audit_events where action='management.read_access_changed'$$,
 $$values(true,'false'::text,'true'::text,'Enable read-only access'::text)$$,'audit has organization, before/after and reason');
select ok((select updated_by='00000000-0000-0000-0000-000000004901'::uuid and updated_at>(select updated_at from fx where slug='geardrop') from public.organization_management_features where organization_id=(select id from fx where slug='geardrop') and feature='read_access'),'write records actor and advances timestamp');

select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000004901","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok($$select management_api.set_management_read_access((select id from fx where slug='geardrop'),false,now(),'AAL1 denied')$$,'42501','GD_MANAGEMENT_AAL2_REQUIRED','owner AAL1 denied');
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000004901","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select management_api.set_management_read_access((select id from fx where slug='geardrop'),false,now(),'Missing AAL')$$,'42501','GD_MANAGEMENT_AAL2_REQUIRED','missing AAL defaults to aal1');
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000004902","role":"authenticated","aal":"aal2","user_metadata":{"role":"owner"}}',true);
set local role authenticated;
select is((select count(*) from management_api.list_management_features((select id from fx where slug='geardrop'))),7::bigint,'active admin can list');
select throws_ok($$select management_api.set_management_read_access((select id from fx where slug='geardrop'),false,now(),'Admin denied')$$,'42501','GD_MANAGEMENT_OWNER_REQUIRED','admin AAL2 cannot promote using metadata');
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000004903","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is_empty($$select * from public.organization_management_features$$,'non-member reads no flags');
select throws_ok($$select * from management_api.list_management_features((select id from fx where slug='geardrop'))$$,'42501','GD_MANAGEMENT_MEMBER_REQUIRED','non-member RPC denied');
reset role;

select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000004901","role":"authenticated","aal":"aal2"}',true);
update public.organization_members set active=false where user_id='00000000-0000-0000-0000-000000004901';
set local role authenticated;
select is_empty($$select * from public.organization_management_features$$,'inactive membership sees no flags');
select throws_ok($$select management_api.set_management_read_access((select id from fx where slug='geardrop'),false,now(),'Stale owner')$$,'42501','GD_MANAGEMENT_OWNER_REQUIRED','stale membership JWT denied');
select throws_ok($$select private.require_management_feature((select id from fx where slug='geardrop'),'read_access')$$,'42501','GD_MANAGEMENT_FEATURE_DISABLED','enabled flag cannot bypass stale membership');
reset role;
update public.organization_members set active=true where user_id='00000000-0000-0000-0000-000000004901';
update public.staff_profiles set active=false where user_id='00000000-0000-0000-0000-000000004901';
set local role authenticated;
select is_empty($$select * from public.organization_management_features$$,'global inactive staff sees no flags');
select throws_ok($$select management_api.set_management_read_access((select id from fx where slug='geardrop'),false,now(),'Inactive staff')$$,'42501','GD_MANAGEMENT_OWNER_REQUIRED','inactive staff denied');
reset role;
update public.staff_profiles set active=true where user_id='00000000-0000-0000-0000-000000004901';
update public.organizations set active=false where slug='geardrop';
set local role authenticated;
select is_empty($$select * from public.organization_management_features$$,'inactive organization sees no flags');
select throws_ok($$select management_api.set_management_read_access((select id from fx where slug='geardrop'),false,now(),'Inactive company')$$,'42501','GD_MANAGEMENT_OWNER_REQUIRED','inactive organization denied');
reset role;
update public.organizations set active=true where slug='geardrop';

-- Exercise the writer's RLS even when invoked as that role by trusted test setup.
create function pg_temp.affected_rows(statement text) returns bigint language plpgsql security invoker as $$
declare affected bigint;
begin
  execute statement;
  get diagnostics affected = row_count;
  return affected;
end;
$$;
grant management_feature_writer to postgres;
grant usage on schema extensions to management_feature_writer;
set local role management_feature_writer;
select is(pg_temp.affected_rows($$update public.organization_management_features set enabled=true where feature<>'read_access'$$),0::bigint,'writer RLS cannot update other flags');
select is(pg_temp.affected_rows($$update public.organization_management_features set enabled=true where organization_id=(select id from fx where slug='oryvenne')$$),0::bigint,'writer RLS cannot update another organization');
select throws_ok($$insert into public.organization_management_features(organization_id,feature) values(1,'read_access')$$,'42501',null,'writer cannot insert flags');
select throws_ok($$delete from public.organization_management_features$$,'42501',null,'writer cannot delete flags');
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000004901","role":"authenticated","aal":"aal1"}',true);
set local role management_feature_writer;
select is(pg_temp.affected_rows($$update public.organization_management_features set enabled=false$$),0::bigint,'writer RLS independently requires AAL2');
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000004901","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select lives_ok($$select management_api.set_management_read_access((select id from fx where slug='geardrop'),false,(select updated_at from public.organization_management_features where organization_id=(select id from fx where slug='geardrop') and feature='read_access'),'Disable access')$$,'owner can disable read access');
select throws_ok($$select private.require_management_feature((select id from fx where slug='geardrop'),'read_access')$$,'42501','GD_MANAGEMENT_FEATURE_DISABLED','helper closes after disable');
reset role;
select is((select count(*) from public.organization_management_features where feature<>'read_access' and enabled),0::bigint,'all six unavailable flags remain disabled');
-- Provision new companies in the INSERT transaction, including dormant companies.
insert into public.organizations(slug,name,order_number_prefix,active)
values ('flags-new-inactive','New dormant company','NI',false),
       ('flags-new-active','New active company','NA',true);
select results_eq(
 $$select o.slug,count(f.feature)::integer,count(distinct f.feature)::integer,bool_and(not f.enabled)
   from public.organizations o left join public.organization_management_features f on f.organization_id=o.id
   where o.slug in ('flags-new-inactive','flags-new-active') group by o.slug order by o.slug$$,
 $$values ('flags-new-active'::text,7,7,true),('flags-new-inactive'::text,7,7,true)$$,
 'new active and inactive organizations immediately have seven unique disabled flags');
create temporary table dormant_flags as select f.* from public.organization_management_features f
 join public.organizations o on o.id=f.organization_id where o.slug='flags-new-inactive';
update public.organizations set active=true where slug='flags-new-inactive';
update public.organizations set active=false where slug='flags-new-inactive';
update public.organizations set active=true where slug='flags-new-inactive';
select results_eq(
 $$select f.* from public.organization_management_features f join public.organizations o on o.id=f.organization_id
   where o.slug='flags-new-inactive' order by f.feature$$,
 $$select * from dormant_flags order by feature$$,
 'activation cycles preserve all preprovisioned rows and versions without gaps or duplicates');
insert into public.organization_members(organization_id,user_id,role)
 select id,'00000000-0000-0000-0000-000000004901','owner' from public.organizations where slug='flags-new-inactive';
set local role authenticated;
select is((select count(*) from management_api.list_management_features(
 (select id from public.organizations where slug='flags-new-inactive'))),7::bigint,
 'owner lists all flags immediately after company activation');
select lives_ok($$select management_api.set_management_read_access(
 (select id from public.organizations where slug='flags-new-inactive'),true,
 (select f.updated_at from public.organization_management_features f join public.organizations o on o.id=f.organization_id
   where o.slug='flags-new-inactive' and f.feature='read_access'),'Activate new company read access')$$,
 'newly activated company owner can enable read access using its provisioned version');
reset role;
select has_function('private','provision_management_features',array[]::text[],'provisioner has no user parameters');
select ok(exists(select 1 from pg_catalog.pg_proc where pronamespace='private'::regnamespace
 and proname='provision_management_features' and prorettype='trigger'::regtype
 and prosecdef and proowner='postgres'::regrole and proconfig @> array['search_path=""']),
 'provisioner is a private trigger-only definer owned by migration owner with empty search path');
select is_empty($$select p.proname from pg_catalog.pg_proc p where p.pronamespace='private'::regnamespace
 and p.proname='provision_management_features' and (
 pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
 or pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
 or pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
 or pg_catalog.has_function_privilege('management_feature_writer',p.oid,'EXECUTE'))$$,
 'neither application roles nor the RPC writer can execute the provisioner');
select is_empty($$select p.proname from pg_catalog.pg_proc p,
 lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
 where p.pronamespace='private'::regnamespace and p.proname='provision_management_features'
 and a.grantee=0 and a.privilege_type='EXECUTE'$$,'PUBLIC cannot execute the provisioner');
select is((select count(*) from pg_catalog.pg_trigger t join pg_catalog.pg_proc p on p.oid=t.tgfoid
 where p.pronamespace='private'::regnamespace and p.proname='provision_management_features'
 and t.tgrelid='public.organizations'::regclass and t.tgtype=5 and t.tgnargs=0 and t.tgenabled='O'),1::bigint,
 'the only provisioning entrypoint is an enabled row AFTER INSERT trigger on organizations');
select * from finish();
rollback;
