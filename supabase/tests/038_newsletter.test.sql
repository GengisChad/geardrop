begin;
select plan(27);

-- Nobody but the server's own key touches the list or the functions -------------------------------
select ok(not has_table_privilege('anon', 'public.newsletter_subscribers', 'SELECT'), 'anon cannot read the newsletter list');
select ok(not has_table_privilege('anon', 'public.newsletter_subscribers', 'INSERT'), 'anon cannot write the newsletter list');
select ok(not has_table_privilege('authenticated', 'public.newsletter_subscribers', 'INSERT'), 'a signed-in user cannot write the newsletter list');
select ok(not has_function_privilege('anon', 'public.newsletter_signup(text,text,text)', 'EXECUTE'), 'anon cannot sign up directly, so it never learns a token');
select ok(not has_function_privilege('authenticated', 'public.newsletter_signup(text,text,text)', 'EXECUTE'), 'a signed-in user cannot sign up directly');
select ok(not has_function_privilege('anon', 'public.newsletter_confirm(uuid)', 'EXECUTE'), 'anon cannot confirm directly');
select ok(not has_function_privilege('anon', 'public.newsletter_unsubscribe(uuid)', 'EXECUTE'), 'anon cannot unsubscribe directly');
select ok(has_function_privilege('service_role', 'public.newsletter_signup(text,text,text)', 'EXECUTE'), 'the server signs visitors up');
select ok(has_function_privilege('service_role', 'public.newsletter_confirm(uuid)', 'EXECUTE'), 'the server confirms');

-- A signup is pending, lower-case, and gets one email a day at most -------------------------------
select isnt(
  public.newsletter_signup('Fan@Example.com', 'home', 'Voglio ricevere le novità di GEAR//DROP'),
  null,
  'a new address gets a token for its confirmation email');
select is(
  (select email from public.newsletter_subscribers where lower(email) = 'fan@example.com'),
  'fan@example.com',
  'the address is stored lower-case');
select ok(
  (select confirmed_at is null from public.newsletter_subscribers where email = 'fan@example.com'),
  'the signup stays pending until the link is used');
select is(
  public.newsletter_signup('fan@example.com', 'home', 'Voglio ricevere le novità di GEAR//DROP'),
  null,
  'a second signup within a day sends no second email');
update public.newsletter_subscribers set confirmation_sent_at = now() - interval '2 days' where email = 'fan@example.com';
select isnt(
  public.newsletter_signup('fan@example.com', 'home', 'Voglio ricevere le novità di GEAR//DROP'),
  null,
  'a day later the pending address may get the email again');

-- Confirm, then unsubscribe, then come back ------------------------------------------------------
create temporary table first_token as select token from public.newsletter_subscribers where email = 'fan@example.com';
select is(public.newsletter_confirm((select token from first_token)), 'done', 'the link confirms the signup');
select is(public.newsletter_confirm((select token from first_token)), 'already', 'a second click says it is already confirmed');
select is(
  public.newsletter_signup('fan@example.com', 'home', 'Voglio ricevere le novità di GEAR//DROP'),
  null,
  'a confirmed address signing up again sends nothing');
select is(public.newsletter_confirm(gen_random_uuid()), 'unknown', 'a made-up token confirms nothing');
select is(public.newsletter_unsubscribe((select token from first_token)), 'done', 'the unsubscribe link works');
select is(public.newsletter_unsubscribe((select token from first_token)), 'already', 'a second unsubscribe says so');
select is(public.newsletter_confirm((select token from first_token)), 'unknown', 'an unsubscribed address cannot be confirmed by the old link');
select isnt(
  public.newsletter_signup('fan@example.com', 'home', 'Voglio ricevere le novità di GEAR//DROP'),
  (select token from first_token),
  'coming back after leaving issues a new token and a new confirmation');
select ok(
  (select confirmed_at is null and unsubscribed_at is null from public.newsletter_subscribers where email = 'fan@example.com'),
  'coming back starts pending again');

-- Bad input -------------------------------------------------------------------------------------
select throws_ok(
  $$select public.newsletter_signup('not-an-email', 'home', 'Voglio ricevere le novità di GEAR//DROP')$$,
  '22023', 'GD_NEWSLETTER_INVALID_EMAIL',
  'an address without a domain is refused');
select throws_ok(
  $$select public.newsletter_signup('someone@example.com', 'home', '')$$,
  '22023', 'GD_NEWSLETTER_CONSENT_REQUIRED',
  'a signup without the consent text is refused');

-- Pending signups older than 30 days are dropped -------------------------------------------------
insert into public.newsletter_subscribers (email, consent_text, created_at, confirmation_sent_at)
values ('stale@example.com', 'Voglio ricevere le novità di GEAR//DROP', now() - interval '40 days', now() - interval '40 days');
select public.newsletter_signup('fresh@example.com', 'home', 'Voglio ricevere le novità di GEAR//DROP');
select is(
  (select count(*)::int from public.newsletter_subscribers where email = 'stale@example.com'),
  0,
  'a signup nobody confirmed in 30 days is deleted');

-- A signed-in shopper without a staff role sees nothing -----------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000099', true);
select is(
  (select count(*)::int from public.newsletter_subscribers),
  0,
  'a signed-in shopper without a staff role sees no subscriber');
reset role;

select * from finish();
rollback;
