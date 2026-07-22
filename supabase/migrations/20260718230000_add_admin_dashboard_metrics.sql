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
    select jsonb_build_object(
      'order_count',count(*),'revenue_cents',coalesce(sum(total_cents) filter(where payment_status='paid'),0),
      'average_order_value_cents',coalesce(round(avg(total_cents) filter(where payment_status='paid')),0),
      'latest_orders',(select coalesce(jsonb_agg(jsonb_build_object('id',recent.id,'order_number',recent.order_number,'status',recent.status,'payment_status',recent.payment_status,'total_cents',recent.total_cents,'created_at',recent.created_at) order by recent.created_at desc,recent.id desc),'[]'::jsonb) from (select id,order_number,status,payment_status,total_cents,created_at from public.orders order by created_at desc,id desc limit 5) recent)
    ) into commerce from public.orders;
    select coalesce(jsonb_agg(jsonb_build_object('id',event.id,'action',event.action,'entity_type',event.entity_type,'entity_id',event.entity_id,'created_at',event.created_at,'actor_name',coalesce(profile.display_name,'Sistema')) order by event.created_at desc,event.id desc),'[]'::jsonb)
      into activity from (select * from public.audit_events order by created_at desc,id desc limit 8) event left join public.staff_profiles profile on profile.user_id=event.actor_user_id;
  else commerce:=null;activity:=null;end if;
  return jsonb_build_object('products',products,'active_coupons',coupon_count,'active_promotions',promotion_count,'commerce',commerce,'stock_movements',movements,'staff_activity',activity);
end;
$$;
revoke all on function public.get_admin_dashboard_metrics() from public,anon,authenticated,service_role;
grant execute on function public.get_admin_dashboard_metrics() to authenticated;
