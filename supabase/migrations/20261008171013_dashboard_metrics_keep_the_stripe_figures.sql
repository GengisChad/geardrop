-- After the merge of main into feat/gestionale-cloud the migration order became:
-- 1. all of main's history (up to 20261008170000), including
--    20261002120000_dashboard_revenue_matches_stripe.sql which rewrote
--    get_admin_dashboard_metrics() to count only settled orders and to expose
--    gross_revenue_cents / refunded_cents / refunded_order_count / unpaid_order_count;
-- 2. our scoped migrations (20261008171001–20261008171012), where
--    20261008171005_scope_order_rpcs.sql drops the no-arg form and creates
--    get_admin_dashboard_metrics(p_organization_id bigint) — but carried the OLD
--    revenue logic that counted every order and ignored partial refunds.
--
-- Result: the Stripe-accurate fields are absent and the counts are wrong.
-- This migration re-applies main's revenue logic inside the scoped form so that
-- both concerns are met: one organisation per call AND correct Stripe figures.
begin;

create or replace function public.get_admin_dashboard_metrics(p_organization_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_role  public.staff_role := private.org_role(p_organization_id);
  manager     boolean;
  products    jsonb;
  commerce    jsonb;
  movements   jsonb;
  activity    jsonb;
  coupon_count    integer;
  promotion_count integer;
begin
  if actor_role is null then
    raise exception using errcode = '42501', message = 'GD_DASHBOARD_STAFF_REQUIRED';
  end if;
  manager := actor_role in ('owner', 'admin');

  -- Catalogue summary ---------------------------------------------------------
  select jsonb_build_object(
    'total',      count(*),
    'published',  count(*) filter (where publication_status = 'published'),
    'draft',      count(*) filter (where publication_status = 'draft'),
    'archived',   count(*) filter (where publication_status = 'archived'),
    'sold_out',   count(*) filter (where manage_stock and stock_status = 'esaurito'
                                     and publication_status <> 'archived'),
    'low_stock',  count(*) filter (where manage_stock and stock_quantity > 0
                                     and stock_quantity <= low_stock_threshold
                                     and publication_status <> 'archived'),
    'preorder',   count(*) filter (where availability_override = 'preorder')
  ) into products
  from public.products
  where organization_id = p_organization_id;

  -- Active pricing rules ------------------------------------------------------
  select count(*) into coupon_count
  from public.coupons
  where organization_id = p_organization_id
    and active
    and disabled_at is null
    and (starts_at is null or starts_at <= now())
    and (expires_at is null or expires_at > now());

  select count(*) into promotion_count
  from public.promotions
  where organization_id = p_organization_id
    and active
    and (starts_at is null or starts_at <= now())
    and (ends_at   is null or ends_at   > now());

  -- Recent stock movements ----------------------------------------------------
  select coalesce(jsonb_agg(jsonb_build_object(
      'id',           movement.id,
      'delta',        movement.delta,
      'stock_after',  movement.stock_after,
      'reason',       movement.reason,
      'note',         movement.note,
      'created_at',   movement.created_at,
      'product_name', product.name,
      'sku',          product.sku
    ) order by movement.created_at desc, movement.id desc), '[]'::jsonb)
  into movements
  from (
    select * from public.inventory_movements
    where organization_id = p_organization_id
    order by created_at desc, id desc
    limit 8
  ) movement
  join public.products product on product.id = movement.product_id;

  -- Commerce block (admin/owner only) ----------------------------------------
  if manager then
    -- "settled" = every order Stripe actually took money for; payment_status
    -- 'refunded' means fully reversed but the charge still happened.
    -- net_cents = what the order is still worth after partial or full refunds:
    --   fully refunded → 0; partially refunded → total minus the returned slice.
    select jsonb_build_object(
      'order_count',            count(*),
      'gross_revenue_cents',    coalesce(sum(settled.total_cents), 0),
      'refunded_cents',         coalesce(sum(settled.total_cents - settled.net_cents), 0),
      'revenue_cents',          coalesce(sum(settled.net_cents), 0),
      'refunded_order_count',   count(*) filter (where settled.net_cents < settled.total_cents),
      'unpaid_order_count', (
        select count(*)
        from public.orders
        where organization_id = p_organization_id
          and payment_status not in ('paid', 'refunded')
      ),
      'average_order_value_cents',
        case when count(*) = 0 then 0
             else round(coalesce(sum(settled.net_cents), 0)::numeric / count(*))
        end,
      'latest_orders', (
        select coalesce(jsonb_agg(jsonb_build_object(
            'id',             recent.id,
            'order_number',   recent.order_number,
            'status',         recent.status,
            'payment_status', recent.payment_status,
            'total_cents',    recent.total_cents,
            'created_at',     recent.created_at
          ) order by recent.created_at desc, recent.id desc), '[]'::jsonb)
        from (
          select id, order_number, status, payment_status, total_cents, created_at
          from public.orders
          where organization_id = p_organization_id
          order by created_at desc, id desc
          limit 5
        ) recent
      )
    ) into commerce
    from (
      select
        orders.total_cents,
        case when orders.payment_status = 'refunded'
             then 0
             else greatest(orders.total_cents - greatest(orders.refunded_cents, 0), 0)
        end as net_cents
      from public.orders
      where organization_id = p_organization_id
        and payment_status in ('paid', 'refunded')
    ) settled;

    -- Recent staff activity ---------------------------------------------------
    select coalesce(jsonb_agg(jsonb_build_object(
        'id',          event.id,
        'action',      event.action,
        'entity_type', event.entity_type,
        'entity_id',   event.entity_id,
        'created_at',  event.created_at,
        'actor_name',  coalesce(profile.display_name, 'Sistema')
      ) order by event.created_at desc, event.id desc), '[]'::jsonb)
    into activity
    from (
      select * from public.audit_events
      where organization_id = p_organization_id
      order by created_at desc, id desc
      limit 8
    ) event
    left join public.staff_profiles profile on profile.user_id = event.actor_user_id;

  else
    commerce := null;
    activity := null;
  end if;

  return jsonb_build_object(
    'products',          products,
    'active_coupons',    coupon_count,
    'active_promotions', promotion_count,
    'commerce',          commerce,
    'stock_movements',   movements,
    'staff_activity',    activity
  );
end;
$$;

revoke all on function public.get_admin_dashboard_metrics(bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.get_admin_dashboard_metrics(bigint) to authenticated;

comment on function public.get_admin_dashboard_metrics(bigint) is
  'Operational dashboard aggregate scoped to one organisation. '
  'Commerce figures cover the orders Stripe charged (paid and refunded) and report revenue '
  'net of refunds, so the panel reconciles with the Stripe payment ledger.';

commit;
