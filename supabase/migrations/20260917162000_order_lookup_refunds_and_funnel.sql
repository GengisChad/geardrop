-- Package D: public order tracking, Stripe refunds, and anonymous funnel statistics.
--
-- 1. public.lookup_order_status           — anon-callable, returns only safe fields
-- 2. stripe_refund_id on orders           — records the Stripe refund object id
-- 3. public.record_order_refund           — manager-only, writes refund outcome + audit
-- 4. public.storefront_daily_events       — append-only funnel counters, no PII
-- 5. public.track_storefront_event        — anon-callable, whitelisted event names only
-- 6. public.read_funnel_stats             — manager-only, last 30 days

-- ── 1. ORDER LOOKUP ──────────────────────────────────────────────────────────────────────

create or replace function public.lookup_order_status(
  p_order_number text,
  p_email        text
)
returns table (
  order_number      text,
  status            text,
  created_at        timestamptz,
  shipped_at        timestamptz,
  tracking_carrier  text,
  tracking_code     text,
  tracking_url      text,
  items             jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  -- Basic input check — not an error that leaks existence.
  if p_order_number is null or btrim(p_order_number) = ''
     or p_email is null or btrim(p_email) = '' then
    return;
  end if;

  select *
    into v_order
    from public.orders as o
   where o.order_number = btrim(p_order_number)
     and lower(btrim(o.email)) = lower(btrim(p_email));

  if not found then
    return;
  end if;

  return query
    select
      v_order.order_number,
      v_order.status::text,
      v_order.created_at,
      v_order.shipped_at,
      v_order.tracking_carrier,
      v_order.tracking_code,
      v_order.tracking_url,
      coalesce(
        (
          select jsonb_agg(
                   jsonb_build_object(
                     'product_name_snapshot', oi.product_name_snapshot,
                     'quantity',              oi.quantity,
                     'preorder_quantity',     oi.preorder_quantity
                   )
                   order by oi.id
                 )
          from public.order_items as oi
         where oi.order_id = v_order.id
        ),
        '[]'::jsonb
      ) as items;
end;
$$;

revoke all on function public.lookup_order_status(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.lookup_order_status(text, text)
  to anon, authenticated;

comment on function public.lookup_order_status(text, text) is
  'Returns the safe tracking fields of a single order matched by number and email (case-insensitive). Returns no rows—not an error—on a mismatch so as not to reveal existence.';

-- ── 2. STRIPE REFUND ID ON ORDERS ────────────────────────────────────────────────────────

alter table public.orders
  add column if not exists stripe_refund_id text;

comment on column public.orders.stripe_refund_id is
  'Stripe refund object id (re_…) written by record_order_refund once the API call succeeds.';

-- ── 3. RECORD ORDER REFUND ───────────────────────────────────────────────────────────────

create or replace function public.record_order_refund(
  p_order_id        bigint,
  p_amount_cents    integer,
  p_reason          text,
  p_stripe_refund_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id   uuid := (current_setting('request.jwt.claim.sub', true))::uuid;
  v_order    public.orders%rowtype;
  fully_paid boolean;
begin
  -- Manager gate: owner or admin only.
  if not exists (
    select 1 from public.staff_profiles
     where user_id = actor_id
       and role in ('owner', 'admin')
  ) then
    raise exception using errcode = '42501', message = 'GD_ORDER_MANAGER_REQUIRED';
  end if;

  select * into v_order
    from public.orders
   where id = p_order_id;

  if not found then
    raise exception using errcode = '22023', message = 'GD_ORDER_NOT_FOUND';
  end if;

  if v_order.payment_status not in ('authorized', 'paid') then
    raise exception using errcode = '22023', message = 'GD_ORDER_REFUND_INVALID';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception using errcode = '22023', message = 'GD_ORDER_REFUND_INVALID';
  end if;

  if p_stripe_refund_id is null or btrim(p_stripe_refund_id) = '' then
    raise exception using errcode = '22023', message = 'GD_ORDER_REFUND_INVALID';
  end if;

  -- A full refund is when the refund equals or exceeds the total paid.
  fully_paid := p_amount_cents >= v_order.total_cents;

  update public.orders
     set refund_prepared_at  = coalesce(refund_prepared_at, now()),
         refund_amount_cents  = p_amount_cents,
         refund_reason        = btrim(p_reason),
         stripe_refund_id     = btrim(p_stripe_refund_id),
         payment_status       = case when fully_paid
                                     then 'refunded'::public.payment_status
                                     else payment_status
                                end,
         updated_at           = now()
   where id = p_order_id;

  insert into public.audit_events(
    actor_user_id, action, entity_type, entity_id, after_state
  ) values (
    actor_id,
    'order.refunded',
    'orders',
    p_order_id::text,
    jsonb_build_object(
      'amount_cents',       p_amount_cents,
      'reason',             btrim(p_reason),
      'stripe_refund_id',   btrim(p_stripe_refund_id),
      'fully_refunded',     fully_paid
    )
  );
end;
$$;

revoke all on function public.record_order_refund(bigint, integer, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.record_order_refund(bigint, integer, text, text)
  to authenticated;

comment on function public.record_order_refund(bigint, integer, text, text) is
  'Writes the Stripe refund outcome onto an order. Sets payment_status to refunded when the amount covers the total. Manager-only.';

-- ── 4. STOREFRONT DAILY EVENTS TABLE ────────────────────────────────────────────────────

create table if not exists public.storefront_daily_events (
  day    date    not null,
  event  text    not null,
  count  integer not null default 0,
  constraint storefront_daily_events_pkey primary key (day, event),
  constraint storefront_daily_events_count_positive check (count >= 0)
);

comment on table public.storefront_daily_events is
  'Anonymous daily funnel event counters. No user ids, no cookies — just (day, event, count).';

-- RLS on, no direct grants — only the security-definer functions may touch this table.
alter table public.storefront_daily_events enable row level security;
-- Supabase's default privileges would still grant the API roles table access; take it back.
revoke all on table public.storefront_daily_events from anon, authenticated;

-- No policies: anon and authenticated can never read or write directly.
-- service_role always bypasses RLS, so the track function (security definer) can upsert.

-- ── 5. TRACK STOREFRONT EVENT ───────────────────────────────────────────────────────────

create or replace function public.track_storefront_event(p_event text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date;
begin
  -- Whitelist guard: only known funnel events are accepted.
  if p_event not in (
    'product_view', 'add_to_cart', 'cart_view', 'checkout_view', 'checkout_submit'
  ) then
    return;  -- silently drop unknown events; never raise to the client
  end if;

  -- current_date in Europe/Rome so the daily buckets match Italian midnight.
  today := (now() at time zone 'Europe/Rome')::date;

  insert into public.storefront_daily_events(day, event, count)
       values (today, p_event, 1)
  on conflict (day, event) do update
     set count = public.storefront_daily_events.count + 1;
end;
$$;

revoke all on function public.track_storefront_event(text)
  from public, anon, authenticated, service_role;
grant execute on function public.track_storefront_event(text)
  to anon, authenticated;

comment on function public.track_storefront_event(text) is
  'Increments the daily counter for an allowed storefront funnel event. Unknown events are silently ignored. Callable by anyone; no PII stored.';

-- ── 6. READ FUNNEL STATS ────────────────────────────────────────────────────────────────

create or replace function public.read_funnel_stats(p_days integer default 30)
returns table (
  day    date,
  event  text,
  count  integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (current_setting('request.jwt.claim.sub', true))::uuid;
begin
  -- Manager gate: owner or admin only.
  if not exists (
    select 1 from public.staff_profiles
     where user_id = actor_id
       and role in ('owner', 'admin')
  ) then
    raise exception using errcode = '42501', message = 'GD_ORDER_MANAGER_REQUIRED';
  end if;

  return query
    select e.day, e.event, e.count
      from public.storefront_daily_events as e
     where e.day >= (now() at time zone 'Europe/Rome')::date - (p_days - 1)
     order by e.day desc, e.event;
end;
$$;

revoke all on function public.read_funnel_stats(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.read_funnel_stats(integer)
  to authenticated;

comment on function public.read_funnel_stats(integer) is
  'Returns daily funnel event counts for the last p_days days (default 30). Manager-only.';
