-- Two admin functions from 20260917162000 read the signed-in user from
-- current_setting('request.jwt.claim.sub'), which Supabase's API no longer sets (the claims now
-- arrive as one JSON, request.jwt.claims). Every call therefore looked anonymous:
-- record_order_refund refused the owner with GD_ORDER_MANAGER_REQUIRED (found 2026-09-21 when
-- the owner recorded the GD-ML6E4UEE refund made in the Stripe dashboard), and the funnel stats
-- could not be read. auth.uid() reads either form, as every other admin function already does.
-- The bodies are otherwise unchanged; create or replace keeps their grants.

begin;

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
  actor_id   uuid := (select auth.uid());
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
   where id = p_order_id
   for update;

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

  -- Partial refunds add up and can never return more than the order took.
  if v_order.refunded_cents + p_amount_cents > v_order.total_cents then
    raise exception using errcode = '22023', message = 'GD_ORDER_REFUND_EXCEEDS_TOTAL';
  end if;
  fully_paid := v_order.refunded_cents + p_amount_cents >= v_order.total_cents;

  update public.orders
     set refund_prepared_at  = coalesce(refund_prepared_at, now()),
         refunded_cents       = refunded_cents + p_amount_cents,
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
      'refunded_cents',     v_order.refunded_cents + p_amount_cents,
      'reason',             btrim(p_reason),
      'stripe_refund_id',   btrim(p_stripe_refund_id),
      'fully_refunded',     fully_paid
    )
  );
end;
$$;

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
  actor_id uuid := (select auth.uid());
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

commit;
