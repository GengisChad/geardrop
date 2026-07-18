begin;
select plan(31);
select has_type('public','staff_invite_status','staff invite status exists');
select has_column('public','staff_profiles','invite_email','invite email exists');
select has_column('public','staff_profiles','invite_status','invite status exists');
select has_column('public','staff_profiles','invited_at','invite timestamp exists');
select has_column('public','staff_profiles','accepted_at','accept timestamp exists');
select has_column('public','staff_profiles','revoked_at','revoke timestamp exists');
select has_column('public','staff_profiles','last_login_at','last login exists');
select has_column('public','audit_events','request_id','audit request id exists');
select has_column('public','audit_events','request_method','audit method exists');
select has_column('public','audit_events','request_path','audit path exists');
select has_column('public','audit_events','request_user_agent','audit user agent exists');
select has_function('public','change_staff_role',array['uuid','staff_role'],'role RPC exists');
select has_function('public','set_staff_active',array['uuid','boolean'],'active RPC exists');
select has_function('public','revoke_staff_access',array['uuid'],'revoke RPC exists');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000001701','authenticated','authenticated','staff-owner-one@example.com','',now(),'{}','{}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000001702','authenticated','authenticated','staff-owner-two@example.com','',now(),'{}','{}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000001703','authenticated','authenticated','staff-admin@example.com','',now(),'{}','{}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000001704','authenticated','authenticated','staff-editor@example.com','',now(),'{}','{}',now(),now(),'','','','');
insert into public.staff_profiles(user_id,role,display_name,invite_email) values
('00000000-0000-0000-0000-000000001701','owner','Owner One','staff-owner-one@example.com'),('00000000-0000-0000-0000-000000001702','owner','Owner Two','staff-owner-two@example.com'),
('00000000-0000-0000-0000-000000001703','admin','Admin','staff-admin@example.com'),('00000000-0000-0000-0000-000000001704','editor','Editor','staff-editor@example.com');

set local role anon;
select throws_ok($$insert into public.staff_profiles(user_id,role,display_name) values('00000000-0000-0000-0000-000000001799','editor','Public')$$,'42501','permission denied for table staff_profiles','public cannot create staff accounts');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001703',true);set local role authenticated;
select throws_ok($$select public.change_staff_role('00000000-0000-0000-0000-000000001704','admin')$$,'42501','GD_STAFF_OWNER_REQUIRED','admin cannot change roles');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001704',true);set local role authenticated;
select throws_ok($$select public.set_staff_active('00000000-0000-0000-0000-000000001703',false)$$,'42501','GD_STAFF_OWNER_REQUIRED','editor cannot change staff status');
reset role;

select set_config('request.headers','{"x-request-id":"req-staff-1","user-agent":"Admin Test Agent","x-secret":"must-not-copy"}',true);
select set_config('request.method','post',true);select set_config('request.path','/admin/team',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001701',true);set local role authenticated;
select throws_ok($$select public.change_staff_role('00000000-0000-0000-0000-000000001701','admin')$$,'22023','GD_STAFF_SELF_CHANGE','owner cannot change own role while another owner exists');
select lives_ok($$select public.change_staff_role('00000000-0000-0000-0000-000000001702','admin')$$,'owner changes another role');
select throws_ok($$select public.set_staff_active('00000000-0000-0000-0000-000000001701',false)$$,'55000','GD_STAFF_LAST_OWNER','last active owner cannot be disabled');
reset role;
select results_eq($$select role::text from public.staff_profiles where user_id='00000000-0000-0000-0000-000000001702'$$,array['admin'::text],'role change persists');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001701',true);set local role authenticated;
select lives_ok($$select public.change_staff_role('00000000-0000-0000-0000-000000001702','owner')$$,'owner role can be restored');
select lives_ok($$select public.revoke_staff_access('00000000-0000-0000-0000-000000001702')$$,'second owner can be revoked safely');
reset role;
select results_eq($$select active,invite_status::text from public.staff_profiles where user_id='00000000-0000-0000-0000-000000001702'$$,$$select false,'revoked'::text$$,'revocation updates active status');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001701',true);set local role authenticated;
select lives_ok($$select public.set_staff_active('00000000-0000-0000-0000-000000001702',true)$$,'owner can reactivate staff');
reset role;
select results_eq($$select active,invite_status::text from public.staff_profiles where user_id='00000000-0000-0000-0000-000000001702'$$,$$select true,'active'::text$$,'reactivation clears revoked status');
select results_eq($$select before_state->>'role',after_state->>'role' from public.audit_events where action='staff.role_changed' and entity_id='00000000-0000-0000-0000-000000001702' order by id limit 1$$,$$select 'owner'::text,'admin'::text$$,'audit stores role before and after');
select results_eq($$select request_id,request_method,request_path,request_user_agent from public.audit_events where action='staff.role_changed' and entity_id='00000000-0000-0000-0000-000000001702' order by id limit 1$$,$$select 'req-staff-1'::text,'POST'::text,'/admin/team'::text,'Admin Test Agent'::text$$,'audit stores sanitized allowlisted request context');
select results_eq($$select count(*)::bigint from public.audit_events where action in ('staff.role_changed','staff.revoked','staff.active_changed')$$,array[4::bigint],'every staff lifecycle change is audited');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001704',true);set local role authenticated;
select results_eq($$select count(*)::bigint from public.staff_profiles$$,array[1::bigint],'editor reads only own staff profile');
select results_eq($$select count(*)::bigint from public.audit_events$$,array[0::bigint],'editor receives no audit events');
reset role;
select * from finish();
rollback;
