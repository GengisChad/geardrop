-- The pricing agent never decides: it records observations only from approved domains and
-- proposes prices that the policy checks; a partner approves, edits or rejects, and only an
-- approval changes the price. Company by company, owners and admins only.
begin;
select plan(32);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email, '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
from (values
  ('00000000-0000-0000-0000-000000004701'::uuid, 'agent-owner@example.com'),
  ('00000000-0000-0000-0000-000000004702'::uuid, 'agent-editor@example.com'),
  ('00000000-0000-0000-0000-000000004703'::uuid, 'agent-oryvenne@example.com')
) as people(id, email);
insert into public.staff_profiles (user_id, role, display_name) values
  ('00000000-0000-0000-0000-000000004701', 'owner', 'Agent owner'),
  ('00000000-0000-0000-0000-000000004702', 'editor', 'Agent editor'),
  ('00000000-0000-0000-0000-000000004703', 'owner', 'Agent Oryvenne');
insert into public.organization_members (organization_id, user_id, role)
select organization.id, member.user_id, member.role::public.staff_role
from (values
  ('geardrop', '00000000-0000-0000-0000-000000004701'::uuid, 'owner'),
  ('geardrop', '00000000-0000-0000-0000-000000004702'::uuid, 'editor'),
  ('oryvenne', '00000000-0000-0000-0000-000000004703'::uuid, 'owner')
) as member(slug, user_id, role)
join public.organizations as organization on organization.slug = member.slug
on conflict (organization_id, user_id) do update set role = excluded.role, active = true;

create temporary table fx (name text primary key, id bigint not null) on commit drop;
grant select, insert on fx to authenticated;

do $fixture$
declare
  geardrop bigint := (select id from public.organizations where slug = 'geardrop');
  oryvenne bigint := (select id from public.organizations where slug = 'oryvenne');
  v_category bigint;
  v_product bigint;
  v_other bigint;
begin
  insert into public.categories (organization_id, slug, name, tagline, description)
  values (geardrop, 'agent-category', 'Agent', 't', 'd') returning id into v_category;
  insert into public.products (organization_id, category_id, slug, sku, name, tagline, description, price_cents, stock_quantity)
  values (geardrop, v_category, 'agent-starter', 'AGENT-STARTER', 'Agent starter', 't', 'd', 1450, 10) returning id into v_product;
  insert into public.inventory_cost_state (product_id, organization_id, average_cost_cents, source)
  values (v_product, geardrop, 650, 'manual');
  insert into public.categories (organization_id, slug, name, tagline, description)
  values (oryvenne, 'agent-category', 'Agent', 't', 'd') returning id into v_category;
  insert into public.products (organization_id, category_id, slug, sku, name, tagline, description, price_cents)
  values (oryvenne, v_category, 'agent-starter', 'AGENT-STARTER', 'Oryvenne starter', 't', 'd', 1000) returning id into v_other;
  insert into fx values ('geardrop', geardrop), ('oryvenne', oryvenne), ('product', v_product), ('other_product', v_other);
end;
$fixture$;

select is(private.round_price(1450, 'cents_90'), 1490, '14,50 rounds to the nearest ,90: 14,90');
select is(private.round_price(1600, 'cents_90'), 1590, '16,00 rounds to 15,90');
select is(private.round_price(1240, 'cents_90'), 1290, 'a tie goes up');
select is(private.round_price(1234, 'cents_50'), 1250, 'fifty-cent rounding');
select is(private.round_price(1234, 'none'), 1234, 'no rounding keeps the price');

-- ---------------------------------------------------------------------------------------
-- An owner approves a source and starts a run.
-- ---------------------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004701","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$insert into public.market_sources (organization_id, kind, name, domain)
    values ((select id from fx where name = 'geardrop'), 'competitor', 'Negozio concorrente', 'competitor.example')$$,
  'an owner approves a competitor domain'
);
select throws_ok(
  $$insert into public.market_sources (organization_id, kind, name, domain)
    values ((select id from fx where name = 'geardrop'), 'competitor', 'URL', 'https://competitor.example/shop')$$,
  '23514', null, 'a source is a bare domain, not a URL'
);
select lives_ok(
  $$insert into fx select 'run', public.start_agent_run((select id from fx where name = 'geardrop'), 'pricing', array['claude-sonnet-5'])$$,
  'an owner starts a pricing run'
);
select throws_ok(
  $$select public.start_agent_run((select id from fx where name = 'geardrop'), 'pricing', array['claude-sonnet-5'])$$,
  '55000', 'GD_AGENT_ALREADY_RUNNING', 'one pricing run at a time: runs spend money'
);

-- ---------------------------------------------------------------------------------------
-- Observations come only from approved domains of the company.
-- ---------------------------------------------------------------------------------------

select lives_ok(
  $$select public.record_market_observation((select id from fx where name = 'run'), jsonb_build_object(
    'product_id', (select id from fx where name = 'product'), 'url', 'https://shop.competitor.example/p/starter',
    'title', 'Starter concorrente', 'price_cents', 1690, 'availability', 'in_stock', 'item_condition', 'new'))$$,
  'an observation from a subdomain of an approved source is recorded'
);
select is(
  (select source_domain from public.market_observations order by id desc limit 1),
  'competitor.example',
  'the observation is filed under its approved source'
);
select throws_ok(
  $$select public.record_market_observation((select id from fx where name = 'run'), jsonb_build_object(
    'url', 'https://www.amazon.it/dp/B0X', 'title', 'Amazon', 'price_cents', 999))$$,
  '42501', 'GD_MARKET_SOURCE_NOT_APPROVED', 'nothing is recorded from a domain nobody approved'
);
select throws_ok(
  $$select public.record_market_observation((select id from fx where name = 'run'), jsonb_build_object(
    'product_id', (select id from fx where name = 'other_product'), 'url', 'https://competitor.example/x', 'title', 'X'))$$,
  'P0002', 'GD_PRODUCT_NOT_FOUND', 'an observation cannot point at another company''s product'
);

-- ---------------------------------------------------------------------------------------
-- Proposals are rounded and checked, never applied.
-- ---------------------------------------------------------------------------------------

select lives_ok(
  $$insert into fx select 'within', public.propose_price((select id from fx where name = 'run'), (select id from fx where name = 'product'),
    1600, 'Il concorrente principale vende a 16,90: c''è margine per salire.', '[{"url":"https://competitor.example/p/starter"}]', 0.7)$$,
  'the agent proposes a price'
);
select results_eq(
  $$select proposed_price_cents, current_price_cents, average_cost_cents, out_of_policy, status
    from public.pricing_proposals where id = (select id from fx where name = 'within')$$,
  $$values (1590, 1450, 650, false, 'pending')$$,
  'the proposal is rounded to ,90 and within policy'
);
select is((select price_cents from public.products where id = (select id from fx where name = 'product')), 1450, 'a proposal never changes the price');
select lives_ok(
  $$insert into fx select 'jump', public.propose_price((select id from fx where name = 'run'), (select id from fx where name = 'product'),
    2500, 'Prezzo di mercato molto più alto dopo l''uscita.', '[]', 0.4)$$,
  'the agent proposes a large jump'
);
select results_eq(
  $$select status from public.pricing_proposals where id in ((select id from fx where name = 'within'), (select id from fx where name = 'jump')) order by id$$,
  $$values ('superseded'), ('pending')$$,
  'a new proposal replaces the one still waiting'
);
select results_eq(
  $$select out_of_policy, policy_notes from public.pricing_proposals where id = (select id from fx where name = 'jump')$$,
  $$values (true, array['variazione oltre il 15%'])$$,
  'a jump beyond the maximum change is flagged, not refused'
);
select lives_ok(
  $$insert into fx select 'floor', public.propose_price((select id from fx where name = 'run'), (select id from fx where name = 'product'),
    700, 'Svendita per liberare magazzino prima del nuovo arrivo.', '[]', 0.3)$$,
  'the agent proposes a price under the floor'
);
select is(
  (select policy_notes[1] from public.pricing_proposals where id = (select id from fx where name = 'floor')),
  'margine sotto il minimo del 25%',
  'a price under the margin floor is flagged'
);

-- ---------------------------------------------------------------------------------------
-- Editors and other companies are out.
-- ---------------------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004702","role":"authenticated"}', true);
select is(
  (select count(*)::integer from public.pricing_proposals) + (select count(*)::integer from public.market_observations)
    + (select count(*)::integer from public.market_sources) + (select count(*)::integer from public.agent_runs),
  0,
  'an editor sees no source, run, observation or proposal'
);
select throws_ok(
  $$select public.decide_pricing_proposal((select id from fx where name = 'floor'), 'approve')$$,
  '42501', 'GD_PRICING_MANAGER_REQUIRED', 'an editor cannot decide a price'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004703","role":"authenticated"}', true);
select throws_ok(
  $$select public.record_market_observation((select id from fx where name = 'run'), jsonb_build_object('url', 'https://competitor.example/y', 'title', 'Y'))$$,
  '42501', 'GD_AGENT_MANAGER_REQUIRED', 'another company''s run takes nothing from outside'
);

-- ---------------------------------------------------------------------------------------
-- A partner decides.
-- ---------------------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004701","role":"authenticated"}', true);
select is(
  public.decide_pricing_proposal((select id from fx where name = 'floor'), 'approve', 1590, 'Meglio 15,90 che 6,90'),
  1590,
  'approving with an edited price applies the partner''s price'
);
select results_eq(
  $$select product.price_cents, proposal.status, proposal.applied_price_cents
    from public.pricing_proposals proposal join public.products product on product.id = proposal.product_id
    where proposal.id = (select id from fx where name = 'floor')$$,
  $$values (1590, 'approved', 1590)$$,
  'the approval changes the price and records what was applied'
);
select is(
  (select count(*)::integer from public.audit_events where action = 'pricing.proposal_approved'
    and after_state ->> 'proposal_id' = (select id from fx where name = 'floor')::text),
  1,
  'the price change is audited with the proposal it came from'
);
select throws_ok(
  $$select public.decide_pricing_proposal((select id from fx where name = 'floor'), 'reject')$$,
  '55000', 'GD_PROPOSAL_ALREADY_DECIDED', 'a proposal is decided once'
);
select throws_ok(
  $$select public.decide_pricing_proposal((select id from fx where name = 'jump'), 'approve')$$,
  '55000', 'GD_PROPOSAL_ALREADY_DECIDED', 'a superseded proposal cannot be approved'
);
select throws_ok(
  $$select public.propose_price((select id from fx where name = 'run'), (select id from fx where name = 'product'), 1600, 'Nessuna variazione reale del prezzo.', '[]', 0.5)$$,
  '22023', 'GD_PROPOSAL_NO_CHANGE', 'a proposal that rounds to the current price is not a proposal'
);

select lives_ok(
  $$select public.finish_agent_run((select id from fx where name = 'run'), jsonb_build_object('status', 'succeeded',
    'input_tokens', 1200, 'output_tokens', 300, 'web_searches', 2, 'cost_estimate_cents', 3, 'summary', 'Due prodotti analizzati'))$$,
  'the run is closed with its usage'
);
select throws_ok(
  $$select public.propose_price((select id from fx where name = 'run'), (select id from fx where name = 'product'), 1790, 'Troppo tardi per questa esecuzione.', '[]', 0.5)$$,
  '55000', 'GD_AGENT_RUN_FINISHED', 'a finished run proposes nothing more'
);

select * from finish();
rollback;
