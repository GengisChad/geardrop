-- The dashboard used to answer three questions from three different populations: it counted every
-- order ever created, summed only the ones still marked paid, and averaged that same paid subset.
-- The three cards therefore drifted apart as soon as an order went unpaid or came back refunded,
-- and a partial refund was never subtracted at all, so the panel claimed money that had already
-- gone back to the buyer.
--
-- One population now answers all three: the orders Stripe actually charged, each counted at what
-- it is still worth after refunds. Revenue is net, the average is revenue divided by that same
-- count, and what is pending or refunded is reported next to them instead of hiding inside them.
create or replace function public.get_admin_dashboard_metrics()
returns jsonb language plpgsql security definer stable set search_path = '' as $$
declare actor_role public.staff_role; manager boolean; products jsonb; commerce jsonb; movements jsonb; activity jsonb; coupon_count integer; promotion_count integer;
begin
  select role into actor_role from public.staff_profiles where user_id=(select auth.uid()) and active;
  if actor_role is null then raise exception using errcode='42501',message='GD_DASHBOARD_STAFF_REQUIRED'; end if;
  manager:=actor_role in ('owner','admin');
  select jsonb_build_object(
    'total',count(*),'published',count(*) filter(where publication_status='published'),'draft',count(*) filter(where publication_status='draft'),
    'archived',count(*) filter(where publication_status='archived'),
    'sold_out',count(*) filter(where manage_stock and stock_status='esaurito' and publication_status<>'archived'),
    'low_stock',count(*) filter(where manage_stock and stock_quantity>0 and stock_quantity<=low_stock_threshold and publication_status<>'archived'),
    'preorder',count(*) filter(where availability_override='preorder')) into products from public.products;
  select count(*) into coupon_count from public.coupons where active and disabled_at is null and (starts_at is null or starts_at<=now()) and (expires_at is null or expires_at>now());
  select count(*) into promotion_count from public.promotions where active and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now());
  select coalesce(jsonb_agg(jsonb_build_object('id',movement.id,'delta',movement.delta,'stock_after',movement.stock_after,'reason',movement.reason,'note',movement.note,'created_at',movement.created_at,'product_name',product.name,'sku',product.sku) order by movement.created_at desc,movement.id desc),'[]'::jsonb)
    into movements from (select * from public.inventory_movements order by created_at desc,id desc limit 8) movement join public.products product on product.id=movement.product_id;
  if manager then
    -- charged: every order Stripe took money for, refunded ones included — a refund reverses the
    -- amount, not the fact that the payment happened.
    -- net_cents: what the order is still worth. record_order_refund only writes 'refunded' once the
    -- refunds reach the total, so that status is worth nothing even if refunded_cents lags behind.
    select jsonb_build_object(
      'order_count', count(*),
      'revenue_cents', coalesce(sum(settled.net_cents), 0),
      'gross_revenue_cents', coalesce(sum(settled.total_cents), 0),
      'refunded_cents', coalesce(sum(settled.total_cents - settled.net_cents), 0),
      'refunded_order_count', count(*) filter (where settled.net_cents < settled.total_cents),
      'unpaid_order_count', (select count(*) from public.orders where payment_status not in ('paid', 'refunded')),
      'average_order_value_cents',
        case when count(*) = 0 then 0 else round(coalesce(sum(settled.net_cents), 0)::numeric / count(*)) end,
      'latest_orders',(select coalesce(jsonb_agg(jsonb_build_object('id',recent.id,'order_number',recent.order_number,'status',recent.status,'payment_status',recent.payment_status,'total_cents',recent.total_cents,'created_at',recent.created_at) order by recent.created_at desc,recent.id desc),'[]'::jsonb) from (select id,order_number,status,payment_status,total_cents,created_at from public.orders order by created_at desc,id desc limit 5) recent)
    ) into commerce
    from (
      select
        orders.total_cents,
        case when orders.payment_status = 'refunded' then 0
             else greatest(orders.total_cents - greatest(orders.refunded_cents, 0), 0) end as net_cents
      from public.orders
      where orders.payment_status in ('paid', 'refunded')
    ) settled;
    select coalesce(jsonb_agg(jsonb_build_object('id',event.id,'action',event.action,'entity_type',event.entity_type,'entity_id',event.entity_id,'created_at',event.created_at,'actor_name',coalesce(profile.display_name,'Sistema')) order by event.created_at desc,event.id desc),'[]'::jsonb)
      into activity from (select * from public.audit_events order by created_at desc,id desc limit 8) event left join public.staff_profiles profile on profile.user_id=event.actor_user_id;
  else commerce:=null;activity:=null;end if;
  return jsonb_build_object('products',products,'active_coupons',coupon_count,'active_promotions',promotion_count,'commerce',commerce,'stock_movements',movements,'staff_activity',activity);
end;
$$;
revoke all on function public.get_admin_dashboard_metrics() from public,anon,authenticated,service_role;
grant execute on function public.get_admin_dashboard_metrics() to authenticated;

comment on function public.get_admin_dashboard_metrics() is
  'Operational dashboard aggregate. Commerce figures cover the orders Stripe charged (paid and refunded) and report revenue net of refunds, so the panel reconciles with the Stripe payment ledger.';
