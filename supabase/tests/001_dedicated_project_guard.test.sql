begin;
select plan(3);

select has_schema('auth', 'managed auth schema is present');
select has_table('auth', 'users', 'auth users table is present');
select results_eq(
  $$select count(*)::bigint from public.staff_profiles$$,
  array[0::bigint],
  'no staff privilege is created automatically'
);

select * from finish();
rollback;
