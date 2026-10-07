-- The pricing agent: approved market sources, what the agent observed there, the price changes
-- it proposes, the policy that bounds them, and a record of every run.
--
-- The agent is never an authority. It reads the catalogue and writes only observations and
-- proposals, through these functions; a partner approves, edits or rejects each proposal, and
-- only an approval changes a price, audited with the proposal it came from. Observations are
-- accepted only from the company's approved domains. Everything belongs to one company, and
-- only owners and admins see it.

-- ---------------------------------------------------------------------------------------
-- Approved sources (tier A).
-- ---------------------------------------------------------------------------------------

create table public.market_sources (
  id bigint generated always as identity primary key,
  organization_id bigint not null references public.organizations (id),
  kind text not null constraint market_sources_kind_check check (kind in ('competitor', 'marketplace', 'release_calendar', 'other')),
  name text not null constraint market_sources_name_check check (length(btrim(name)) between 1 and 120),
  -- A bare host name: the agent's web tools are restricted to these domains.
  domain text not null constraint market_sources_domain_check
    check (domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' and length(domain) <= 253),
  notes text constraint market_sources_notes_check check (notes is null or length(notes) <= 1000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint market_sources_id_organization_key unique (id, organization_id),
  constraint market_sources_organization_domain_key unique (organization_id, domain)
);

comment on table public.market_sources is
  'Domains a partner approved for market research. The agent searches and reads only these; Amazon is excluded by decision.';

-- ---------------------------------------------------------------------------------------
-- The pricing policy of a company (tier A, one row per company).
-- ---------------------------------------------------------------------------------------

create table public.pricing_policies (
  organization_id bigint primary key references public.organizations (id),
  -- Minimum margin on the price net of VAT, over the average cost: the floor.
  min_margin_bp integer not null default 2500 constraint pricing_policies_margin_check check (min_margin_bp between 0 and 9000),
  -- Largest change one proposal may make, either way.
  max_change_bp integer not null default 1500 constraint pricing_policies_change_check check (max_change_bp between 100 and 10000),
  -- Days between two decided proposals on the same product.
  cooldown_days integer not null default 7 constraint pricing_policies_cooldown_check check (cooldown_days between 0 and 365),
  rounding text not null default 'cents_90' constraint pricing_policies_rounding_check check (rounding in ('none', 'cents_90', 'cents_99', 'cents_50')),
  products_per_run integer not null default 8 constraint pricing_policies_batch_check check (products_per_run between 1 and 40),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.pricing_policies (organization_id) select id from public.organizations on conflict do nothing;

-- ---------------------------------------------------------------------------------------
-- Agent runs, observations, proposals (tier A).
-- ---------------------------------------------------------------------------------------

create table public.agent_runs (
  id bigint generated always as identity primary key,
  organization_id bigint not null references public.organizations (id),
  agent text not null constraint agent_runs_agent_check check (agent in ('pricing', 'copilot')),
  status text not null default 'running' constraint agent_runs_status_check check (status in ('running', 'succeeded', 'failed')),
  models text[] not null default '{}',
  requested_by uuid references auth.users (id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  web_searches integer not null default 0,
  cost_estimate_cents integer not null default 0,
  summary text constraint agent_runs_summary_check check (summary is null or length(summary) <= 20000),
  error text constraint agent_runs_error_check check (error is null or length(error) <= 2000),
  constraint agent_runs_id_organization_key unique (id, organization_id),
  constraint agent_runs_finish_check check ((status = 'running') = (finished_at is null))
);

create index agent_runs_organization_idx on public.agent_runs (organization_id, started_at desc);

create table public.market_observations (
  id bigint generated always as identity primary key,
  organization_id bigint not null references public.organizations (id),
  agent_run_id bigint not null,
  product_id bigint,
  source_domain text not null,
  url text not null constraint market_observations_url_check check (url ~ '^https?://' and length(url) <= 2000),
  title text not null constraint market_observations_title_check check (length(btrim(title)) between 1 and 300),
  price_cents integer constraint market_observations_price_check check (price_cents between 0 and 100000000),
  currency text not null default 'EUR' constraint market_observations_currency_check check (currency ~ '^[A-Z]{3}$'),
  availability text constraint market_observations_availability_check check (availability in ('in_stock', 'out_of_stock', 'preorder', 'unknown')),
  item_condition text constraint market_observations_condition_check check (item_condition in ('new', 'used', 'unknown')),
  notes text constraint market_observations_notes_check check (notes is null or length(notes) <= 1000),
  observed_at timestamptz not null default now(),
  constraint market_observations_id_organization_key unique (id, organization_id),
  constraint market_observations_run_fkey foreign key (agent_run_id, organization_id)
    references public.agent_runs (id, organization_id) on delete cascade,
  constraint market_observations_product_fkey foreign key (product_id, organization_id)
    references public.products (id, organization_id) on delete set null (product_id)
);

create index market_observations_organization_idx on public.market_observations (organization_id, observed_at desc);
create index market_observations_product_idx on public.market_observations (product_id, observed_at desc) where product_id is not null;

create table public.pricing_proposals (
  id bigint generated always as identity primary key,
  organization_id bigint not null references public.organizations (id),
  agent_run_id bigint not null,
  product_id bigint not null,
  current_price_cents integer not null constraint pricing_proposals_current_check check (current_price_cents >= 0),
  proposed_price_cents integer not null constraint pricing_proposals_proposed_check check (proposed_price_cents between 1 and 100000000),
  average_cost_cents integer,
  rationale text not null constraint pricing_proposals_rationale_check check (length(btrim(rationale)) between 10 and 4000),
  evidence jsonb not null default '[]' constraint pricing_proposals_evidence_check check (jsonb_typeof(evidence) = 'array'),
  confidence numeric(3, 2) not null constraint pricing_proposals_confidence_check check (confidence between 0 and 1),
  out_of_policy boolean not null default false,
  policy_notes text[] not null default '{}',
  status text not null default 'pending' constraint pricing_proposals_status_check
    check (status in ('pending', 'approved', 'rejected', 'superseded')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_note text constraint pricing_proposals_note_check check (decision_note is null or length(decision_note) <= 1000),
  applied_price_cents integer,
  created_at timestamptz not null default now(),
  constraint pricing_proposals_id_organization_key unique (id, organization_id),
  constraint pricing_proposals_run_fkey foreign key (agent_run_id, organization_id)
    references public.agent_runs (id, organization_id),
  constraint pricing_proposals_product_fkey foreign key (product_id, organization_id)
    references public.products (id, organization_id) on delete cascade,
  constraint pricing_proposals_decision_check check ((status in ('pending', 'superseded')) = (decided_at is null)),
  constraint pricing_proposals_applied_check check ((status = 'approved') = (applied_price_cents is not null))
);

create index pricing_proposals_organization_idx on public.pricing_proposals (organization_id, created_at desc);
create unique index pricing_proposals_one_pending_idx on public.pricing_proposals (product_id) where status = 'pending';

-- ---------------------------------------------------------------------------------------
-- Scoping, timestamps, row level security.
-- ---------------------------------------------------------------------------------------

create trigger market_sources_prevent_organization_change before update of organization_id on public.market_sources
  for each row execute function private.prevent_organization_change();
create trigger pricing_policies_prevent_organization_change before update of organization_id on public.pricing_policies
  for each row execute function private.prevent_organization_change();
create trigger agent_runs_prevent_organization_change before update of organization_id on public.agent_runs
  for each row execute function private.prevent_organization_change();
create trigger market_observations_prevent_organization_change before update of organization_id on public.market_observations
  for each row execute function private.prevent_organization_change();
create trigger pricing_proposals_prevent_organization_change before update of organization_id on public.pricing_proposals
  for each row execute function private.prevent_organization_change();

create trigger market_sources_set_updated_at before update on public.market_sources
  for each row execute function private.set_updated_at();
create trigger market_sources_audit_admin_mutation after insert or update or delete on public.market_sources
  for each row execute function private.audit_admin_mutation();

alter table public.market_sources enable row level security;
alter table public.pricing_policies enable row level security;
alter table public.agent_runs enable row level security;
alter table public.market_observations enable row level security;
alter table public.pricing_proposals enable row level security;

revoke all on table public.market_sources, public.pricing_policies, public.agent_runs,
  public.market_observations, public.pricing_proposals from anon, authenticated;
grant select, insert, update, delete on table public.market_sources to authenticated;
grant select on table public.pricing_policies, public.agent_runs, public.market_observations,
  public.pricing_proposals to authenticated;

create policy market_sources_manager_all on public.market_sources
  for all to authenticated
  using (organization_id = any ((select private.member_organization_ids(array['owner'::public.staff_role, 'admin'::public.staff_role]))::bigint[]))
  with check (organization_id = any ((select private.member_organization_ids(array['owner'::public.staff_role, 'admin'::public.staff_role]))::bigint[]));
create policy pricing_policies_manager_read on public.pricing_policies
  for select to authenticated
  using (organization_id = any ((select private.member_organization_ids(array['owner'::public.staff_role, 'admin'::public.staff_role]))::bigint[]));
create policy agent_runs_manager_read on public.agent_runs
  for select to authenticated
  using (organization_id = any ((select private.member_organization_ids(array['owner'::public.staff_role, 'admin'::public.staff_role]))::bigint[]));
create policy market_observations_manager_read on public.market_observations
  for select to authenticated
  using (organization_id = any ((select private.member_organization_ids(array['owner'::public.staff_role, 'admin'::public.staff_role]))::bigint[]));
create policy pricing_proposals_manager_read on public.pricing_proposals
  for select to authenticated
  using (organization_id = any ((select private.member_organization_ids(array['owner'::public.staff_role, 'admin'::public.staff_role]))::bigint[]));

-- ---------------------------------------------------------------------------------------
-- Runs.
-- ---------------------------------------------------------------------------------------

create function public.start_agent_run(p_organization_id bigint, p_agent text, p_models text[])
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_id bigint;
begin
  perform private.require_org_role(p_organization_id,
    array['owner'::public.staff_role, 'admin'::public.staff_role], 'GD_AGENT_MANAGER_REQUIRED');
  -- One pricing run at a time per company: runs spend money.
  if p_agent = 'pricing' and exists (
    select 1 from public.agent_runs as run
    where run.organization_id = p_organization_id and run.agent = 'pricing' and run.status = 'running'
      and run.started_at > now() - interval '30 minutes'
  ) then
    raise exception using errcode = '55000', message = 'GD_AGENT_ALREADY_RUNNING';
  end if;
  insert into public.agent_runs (organization_id, agent, models, requested_by)
  values (p_organization_id, p_agent, coalesce(p_models, '{}'), (select auth.uid()))
  returning id into run_id;
  return run_id;
end;
$$;
revoke all on function public.start_agent_run(bigint, text, text[]) from public, anon, authenticated;
grant execute on function public.start_agent_run(bigint, text, text[]) to authenticated;

create function public.finish_agent_run(p_run_id bigint, p_outcome jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.agent_runs%rowtype;
begin
  select run.* into target from public.agent_runs as run where run.id = p_run_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_AGENT_RUN_NOT_FOUND';
  end if;
  perform private.require_org_role(target.organization_id,
    array['owner'::public.staff_role, 'admin'::public.staff_role], 'GD_AGENT_MANAGER_REQUIRED');
  if target.status <> 'running' then
    raise exception using errcode = '55000', message = 'GD_AGENT_RUN_FINISHED';
  end if;
  update public.agent_runs as run set
    status = case when p_outcome ->> 'status' = 'succeeded' then 'succeeded' else 'failed' end,
    finished_at = now(),
    input_tokens = greatest(coalesce((p_outcome ->> 'input_tokens')::bigint, 0), 0),
    output_tokens = greatest(coalesce((p_outcome ->> 'output_tokens')::bigint, 0), 0),
    web_searches = greatest(coalesce((p_outcome ->> 'web_searches')::integer, 0), 0),
    cost_estimate_cents = greatest(coalesce((p_outcome ->> 'cost_estimate_cents')::integer, 0), 0),
    summary = left(nullif(btrim(p_outcome ->> 'summary'), ''), 20000),
    error = left(nullif(btrim(p_outcome ->> 'error'), ''), 2000)
  where run.id = target.id;
end;
$$;
revoke all on function public.finish_agent_run(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.finish_agent_run(bigint, jsonb) to authenticated;

-- A run that never finished (a crashed request) is closed as failed after half an hour.
create function private.running_agent_run(p_run_id bigint)
returns public.agent_runs
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target public.agent_runs%rowtype;
begin
  select run.* into target from public.agent_runs as run where run.id = p_run_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_AGENT_RUN_NOT_FOUND';
  end if;
  perform private.require_org_role(target.organization_id,
    array['owner'::public.staff_role, 'admin'::public.staff_role], 'GD_AGENT_MANAGER_REQUIRED');
  if target.status <> 'running' or target.started_at < now() - interval '30 minutes' then
    raise exception using errcode = '55000', message = 'GD_AGENT_RUN_FINISHED';
  end if;
  return target;
end;
$$;
revoke all on function private.running_agent_run(bigint) from public;

-- ---------------------------------------------------------------------------------------
-- Observations: only from an approved, active domain of the company.
-- ---------------------------------------------------------------------------------------

create function public.record_market_observation(p_run_id bigint, p_observation jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  run public.agent_runs;
  host text;
  source_domain text;
  target_product bigint := nullif(p_observation ->> 'product_id', '')::bigint;
  observation_id bigint;
begin
  run := private.running_agent_run(p_run_id);
  host := lower(substring(p_observation ->> 'url' from '^https?://([^/:?#]+)'));
  select source.domain into source_domain
  from public.market_sources as source
  where source.organization_id = run.organization_id and source.active
    and (host = source.domain or host like '%.' || source.domain)
  order by length(source.domain) desc
  limit 1;
  if source_domain is null then
    raise exception using errcode = '42501', message = 'GD_MARKET_SOURCE_NOT_APPROVED';
  end if;
  if target_product is not null and not exists (
    select 1 from public.products as product where product.id = target_product and product.organization_id = run.organization_id
  ) then
    raise exception using errcode = 'P0002', message = 'GD_PRODUCT_NOT_FOUND';
  end if;
  insert into public.market_observations (organization_id, agent_run_id, product_id, source_domain, url, title, price_cents,
    currency, availability, item_condition, notes)
  values (
    run.organization_id, run.id, target_product, source_domain, p_observation ->> 'url',
    left(btrim(p_observation ->> 'title'), 300),
    nullif(p_observation ->> 'price_cents', '')::integer,
    coalesce(nullif(upper(p_observation ->> 'currency'), ''), 'EUR'),
    coalesce(nullif(p_observation ->> 'availability', ''), 'unknown'),
    coalesce(nullif(p_observation ->> 'item_condition', ''), 'unknown'),
    left(nullif(btrim(p_observation ->> 'notes'), ''), 1000)
  )
  returning id into observation_id;
  return observation_id;
end;
$$;
revoke all on function public.record_market_observation(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.record_market_observation(bigint, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------
-- Proposals: checked against the policy, never applied by the agent.
-- ---------------------------------------------------------------------------------------

-- The nearest psychological price ending: 14,50 → 14,90; 16,00 → 15,90; a tie (12,40, halfway
-- between 11,90 and 12,90) goes up. Never below one ending.
create function private.round_price(p_cents integer, p_rounding text)
returns integer
language sql
immutable
set search_path = ''
as $$
  with base as (select (p_cents / 100) * 100 as whole)
  select case p_rounding
    when 'cents_90' then greatest(case when abs(p_cents - (base.whole - 10)) < abs(base.whole + 90 - p_cents)
      then base.whole - 10 else base.whole + 90 end, 90)
    when 'cents_99' then greatest(case when abs(p_cents - (base.whole - 1)) < abs(base.whole + 99 - p_cents)
      then base.whole - 1 else base.whole + 99 end, 99)
    when 'cents_50' then greatest(round(p_cents / 50.0)::integer * 50, 50)
    else p_cents
  end
  from base;
$$;
revoke all on function private.round_price(integer, text) from public;

create function public.propose_price(
  p_run_id bigint,
  p_product_id bigint,
  p_proposed_price_cents integer,
  p_rationale text,
  p_evidence jsonb,
  p_confidence numeric
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  run public.agent_runs;
  target public.products%rowtype;
  policy public.pricing_policies%rowtype;
  average_cost integer;
  vat_rate integer;
  proposed integer;
  net_proposed numeric;
  notes text[] := '{}';
  last_decision timestamptz;
  proposal_id bigint;
begin
  run := private.running_agent_run(p_run_id);
  select product.* into target from public.products as product
  where product.id = p_product_id and product.organization_id = run.organization_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_PRODUCT_NOT_FOUND';
  end if;
  if p_proposed_price_cents is null or p_proposed_price_cents < 1 then
    raise exception using errcode = '22023', message = 'GD_INVALID_PROPOSED_PRICE';
  end if;
  select pricing.* into policy from public.pricing_policies as pricing where pricing.organization_id = run.organization_id;
  select organization.default_vat_rate_bp into vat_rate from public.organizations as organization where organization.id = run.organization_id;
  select state.average_cost_cents into average_cost from public.inventory_cost_state as state where state.product_id = target.id;

  proposed := private.round_price(p_proposed_price_cents, policy.rounding);
  if proposed = target.price_cents then
    raise exception using errcode = '22023', message = 'GD_PROPOSAL_NO_CHANGE';
  end if;

  net_proposed := proposed * 10000.0 / (10000 + vat_rate);
  if average_cost is null then
    notes := array_append(notes, 'costo medio sconosciuto: margine non verificabile');
  elsif net_proposed < average_cost * (10000 + policy.min_margin_bp) / 10000.0 then
    notes := notes || format('margine sotto il minimo del %s%%', trim_scale(policy.min_margin_bp / 100.0));
  end if;
  if target.price_cents > 0 and abs(proposed - target.price_cents) * 10000.0 / target.price_cents > policy.max_change_bp then
    notes := notes || format('variazione oltre il %s%%', trim_scale(policy.max_change_bp / 100.0));
  end if;
  select max(proposal.decided_at) into last_decision
  from public.pricing_proposals as proposal
  where proposal.product_id = target.id and proposal.decided_at is not null;
  if last_decision is not null and last_decision > now() - make_interval(days => policy.cooldown_days) then
    notes := notes || format('ultima decisione meno di %s giorni fa', policy.cooldown_days);
  end if;

  -- A new proposal replaces the one still waiting on the same product.
  update public.pricing_proposals as proposal set status = 'superseded'
  where proposal.product_id = target.id and proposal.status = 'pending';

  insert into public.pricing_proposals (organization_id, agent_run_id, product_id, current_price_cents, proposed_price_cents,
    average_cost_cents, rationale, evidence, confidence, out_of_policy, policy_notes)
  values (run.organization_id, run.id, target.id, target.price_cents, proposed, average_cost,
    left(btrim(p_rationale), 4000), coalesce(p_evidence, '[]'::jsonb),
    least(greatest(coalesce(p_confidence, 0), 0), 1), cardinality(notes) > 0, notes)
  returning id into proposal_id;
  return proposal_id;
end;
$$;
revoke all on function public.propose_price(bigint, bigint, integer, text, jsonb, numeric) from public, anon, authenticated;
grant execute on function public.propose_price(bigint, bigint, integer, text, jsonb, numeric) to authenticated;

-- A partner decides. Approving applies the price (the proposed one, or the one they typed).
create function public.decide_pricing_proposal(
  p_proposal_id bigint,
  p_decision text,
  p_price_cents integer default null,
  p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target public.pricing_proposals%rowtype;
  product public.products%rowtype;
  applied integer;
begin
  select proposal.* into target from public.pricing_proposals as proposal where proposal.id = p_proposal_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_PROPOSAL_NOT_FOUND';
  end if;
  perform private.require_org_role(target.organization_id,
    array['owner'::public.staff_role, 'admin'::public.staff_role], 'GD_PRICING_MANAGER_REQUIRED');
  if target.status <> 'pending' then
    raise exception using errcode = '55000', message = 'GD_PROPOSAL_ALREADY_DECIDED';
  end if;

  if p_decision = 'reject' then
    update public.pricing_proposals set status = 'rejected', decided_by = actor_id, decided_at = now(),
      decision_note = left(nullif(btrim(p_note), ''), 1000)
    where id = target.id;
    insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, after_state)
    values (target.organization_id, actor_id, 'pricing.proposal_rejected', 'pricing_proposals', target.id::text,
      jsonb_build_object('product_id', target.product_id, 'proposed_price_cents', target.proposed_price_cents,
        'note', nullif(btrim(p_note), '')));
    return null;
  elsif p_decision <> 'approve' then
    raise exception using errcode = '22023', message = 'GD_INVALID_DECISION';
  end if;

  applied := coalesce(p_price_cents, target.proposed_price_cents);
  if applied < 1 or applied > 100000000 then
    raise exception using errcode = '22023', message = 'GD_INVALID_PROPOSED_PRICE';
  end if;
  select existing.* into product from public.products as existing where existing.id = target.product_id for update;
  update public.products set price_cents = applied where id = product.id;
  update public.pricing_proposals set status = 'approved', decided_by = actor_id, decided_at = now(),
    applied_price_cents = applied, decision_note = left(nullif(btrim(p_note), ''), 1000)
  where id = target.id;
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, before_state, after_state)
  values (target.organization_id, actor_id, 'pricing.proposal_approved', 'products', product.id::text,
    jsonb_build_object('price_cents', product.price_cents),
    jsonb_build_object('price_cents', applied, 'proposal_id', target.id, 'proposed_price_cents', target.proposed_price_cents));
  return applied;
end;
$$;
revoke all on function public.decide_pricing_proposal(bigint, text, integer, text) from public, anon, authenticated;
grant execute on function public.decide_pricing_proposal(bigint, text, integer, text) to authenticated;

create function public.save_pricing_policy(p_organization_id bigint, p_policy jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_org_role(p_organization_id, array['owner'::public.staff_role], 'GD_PRICING_OWNER_REQUIRED');
  insert into public.pricing_policies (organization_id, min_margin_bp, max_change_bp, cooldown_days, rounding,
    products_per_run, updated_at, updated_by)
  values (
    p_organization_id,
    (p_policy ->> 'min_margin_bp')::integer,
    (p_policy ->> 'max_change_bp')::integer,
    (p_policy ->> 'cooldown_days')::integer,
    p_policy ->> 'rounding',
    (p_policy ->> 'products_per_run')::integer,
    now(),
    (select auth.uid())
  )
  on conflict (organization_id) do update set
    min_margin_bp = excluded.min_margin_bp,
    max_change_bp = excluded.max_change_bp,
    cooldown_days = excluded.cooldown_days,
    rounding = excluded.rounding,
    products_per_run = excluded.products_per_run,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;
end;
$$;
revoke all on function public.save_pricing_policy(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.save_pricing_policy(bigint, jsonb) to authenticated;
