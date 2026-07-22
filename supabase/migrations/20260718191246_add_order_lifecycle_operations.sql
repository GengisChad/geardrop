alter table public.orders
  add column tracking_carrier text,
  add column tracking_code text,
  add column tracking_url text,
  add column shipped_at timestamptz,
  add column delivered_at timestamptz,
  add column refund_prepared_at timestamptz,
  add column refund_amount_cents integer check (refund_amount_cents is null or refund_amount_cents > 0),
  add column refund_reason text;

alter table public.order_items
  add column reservation_kind text not null default 'stock'
    check (reservation_kind in ('stock','preorder'));

create table public.order_notes (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders(id) on delete restrict,
  author_user_id uuid references auth.users(id) on delete set null,
  note text not null check (char_length(trim(note)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index order_notes_order_created_idx on public.order_notes(order_id,created_at desc);

create table public.order_status_events (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders(id) on delete restrict,
  from_status public.order_status,
  to_status public.order_status not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index order_status_events_order_created_idx on public.order_status_events(order_id,created_at,id);

create or replace function private.prevent_order_history_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception using errcode='55000',message='GD_ORDER_HISTORY_IMMUTABLE';
end;
$$;
revoke all on function private.prevent_order_history_mutation() from public,anon,authenticated,service_role;
create trigger order_items_immutable before update or delete on public.order_items for each row execute function private.prevent_order_history_mutation();
create trigger order_notes_immutable before update or delete on public.order_notes for each row execute function private.prevent_order_history_mutation();
create trigger order_status_events_immutable before update or delete on public.order_status_events for each row execute function private.prevent_order_history_mutation();

alter table public.order_notes enable row level security;
alter table public.order_status_events enable row level security;
create policy order_notes_staff_read on public.order_notes for select to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role])));
create policy order_status_events_staff_read on public.order_status_events for select to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role])));
grant select on public.order_notes,public.order_status_events to authenticated;
grant usage,select on sequence public.order_notes_id_seq,public.order_status_events_id_seq to authenticated;

create or replace function public.create_order(
  p_email text,
  p_phone text,
  p_shipping_address jsonb,
  p_billing_address jsonb,
  p_lines jsonb,
  p_coupon_code text,
  p_shipping_code text,
  p_idempotency_key uuid
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  normalized_email text := lower(trim(p_email));
  existing_order_id bigint;
  target_order_id bigint;
  pricing jsonb;
  line_record record;
  next_stock integer;
  applied_coupon_id bigint;
begin
  if normalized_email is null
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_idempotency_key is null
    or jsonb_typeof(p_shipping_address) is distinct from 'object'
    or jsonb_typeof(p_billing_address) is distinct from 'object'
    or jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception using errcode='22023',message='GD_ORDER_INVALID_PAYLOAD';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text,0));
  select orders.id into existing_order_id from public.orders
  where idempotency_key=p_idempotency_key and (
    (actor_id is not null and customer_id=actor_id)
    or (actor_id is null and customer_id is null and lower(email)=normalized_email)
  );
  if found then return existing_order_id; end if;

  perform 1 from public.products
  where id in (select (line.value->>'product_id')::bigint from jsonb_array_elements(p_lines) as line(value))
  order by id for update;
  if nullif(trim(p_coupon_code),'') is not null then
    perform 1 from public.coupons where lower(code)=lower(trim(p_coupon_code)) for update;
  end if;
  pricing:=public.calculate_cart_pricing(p_lines,p_coupon_code,actor_id,p_shipping_code);
  applied_coupon_id:=nullif(pricing->>'coupon_id','')::bigint;

  insert into public.orders(
    order_number,customer_id,email,phone,status,payment_status,currency,
    subtotal_cents,discount_cents,shipping_cents,total_cents,shipping_method_code,coupon_code,
    shipping_address_snapshot,billing_address_snapshot,idempotency_key
  ) values (
    'PENDING-'||p_idempotency_key::text,actor_id,normalized_email,nullif(trim(p_phone),''),'pending','pending','EUR',
    (pricing->>'subtotal_cents')::integer,(pricing->>'discount_cents')::integer,
    (pricing->>'shipping_cents')::integer,(pricing->>'total_cents')::integer,
    lower(trim(p_shipping_code)),pricing->>'coupon_code',p_shipping_address,p_billing_address,p_idempotency_key
  ) returning id into target_order_id;
  update public.orders set order_number='GD-'||lpad(target_order_id::text,8,'0') where id=target_order_id;

  for line_record in
    select product.*,(line.value->>'quantity')::integer as requested_quantity
    from jsonb_array_elements(p_lines) as line(value)
    join public.products as product on product.id=(line.value->>'product_id')::bigint
    order by product.id
  loop
    insert into public.order_items(
      order_id,product_id,quantity,unit_price_cents,line_total_cents,product_name_snapshot,sku_snapshot,image_src_snapshot,reservation_kind
    ) values (
      target_order_id,line_record.id,line_record.requested_quantity,line_record.price_cents,
      line_record.price_cents*line_record.requested_quantity,line_record.name,line_record.sku,
      coalesce((select image.src from public.product_images as image where image.product_id=line_record.id and image.published order by image.is_primary desc,image.sort_order,image.id limit 1),''),
      case when line_record.availability_override='preorder'::public.availability_override then 'preorder' else 'stock' end
    );
    if line_record.availability_override='preorder'::public.availability_override then
      update public.products set preorder_allocation=preorder_allocation-line_record.requested_quantity where id=line_record.id returning stock_quantity into next_stock;
    else
      update public.products set stock_quantity=stock_quantity-line_record.requested_quantity where id=line_record.id returning stock_quantity into next_stock;
    end if;
    insert into public.inventory_movements(product_id,delta,stock_after,reason,order_id,actor_user_id,note)
    values(line_record.id,-line_record.requested_quantity,next_stock,'order_reserved',target_order_id,actor_id,'Riserva ordine');
  end loop;

  if applied_coupon_id is not null then
    insert into public.coupon_redemptions(coupon_id,order_id,customer_id,email_normalized,discount_cents)
    values(applied_coupon_id,target_order_id,actor_id,normalized_email,(pricing->>'coupon_discount_cents')::integer);
    update public.coupons set used_count=used_count+1 where id=applied_coupon_id;
  end if;
  insert into public.order_status_events(order_id,from_status,to_status,actor_user_id,note)
  values(target_order_id,null,'pending',actor_id,'Ordine creato');
  insert into public.audit_events(actor_user_id,action,entity_type,entity_id,after_state)
  values(actor_id,'order.created','orders',target_order_id::text,jsonb_build_object('total_cents',pricing->'total_cents'));
  return target_order_id;
end;
$$;

create or replace function public.transition_order_status(p_order_id bigint,p_to_status public.order_status,p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare actor_id uuid:=(select auth.uid()); current_status public.order_status;
begin
  if not private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role]) then raise exception using errcode='42501',message='GD_ORDER_MANAGER_REQUIRED'; end if;
  select status into current_status from public.orders where id=p_order_id for update;
  if not found then raise exception using errcode='P0002',message='GD_ORDER_NOT_FOUND'; end if;
  if not ((current_status='pending' and p_to_status='confirmed') or (current_status='confirmed' and p_to_status='processing') or (current_status='processing' and p_to_status='shipped') or (current_status='shipped' and p_to_status='completed')) then
    raise exception using errcode='22023',message='GD_ORDER_INVALID_TRANSITION';
  end if;
  update public.orders set status=p_to_status,
    shipped_at=case when p_to_status='shipped' then now() else shipped_at end,
    delivered_at=case when p_to_status='completed' then now() else delivered_at end where id=p_order_id;
  insert into public.order_status_events(order_id,from_status,to_status,actor_user_id,note) values(p_order_id,current_status,p_to_status,actor_id,nullif(trim(p_note),''));
  insert into public.audit_events(actor_user_id,action,entity_type,entity_id,before_state,after_state) values(actor_id,'order.status_changed','orders',p_order_id::text,jsonb_build_object('status',current_status),jsonb_build_object('status',p_to_status));
end;
$$;

create or replace function public.cancel_order_and_restore_stock(p_order_id bigint,p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare actor_id uuid:=(select auth.uid()); current_status public.order_status; item record; next_stock integer;
begin
  if not private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role]) then raise exception using errcode='42501',message='GD_ORDER_MANAGER_REQUIRED'; end if;
  select status into current_status from public.orders where id=p_order_id for update;
  if not found then raise exception using errcode='P0002',message='GD_ORDER_NOT_FOUND'; end if;
  if current_status not in ('pending','confirmed','processing') then raise exception using errcode='22023',message='GD_ORDER_INVALID_TRANSITION'; end if;
  perform 1 from public.products where id in (select product_id from public.order_items where order_id=p_order_id) order by id for update;
  for item in select * from public.order_items where order_id=p_order_id order by id loop
    if item.reservation_kind='preorder' then update public.products set preorder_allocation=preorder_allocation+item.quantity where id=item.product_id returning stock_quantity into next_stock;
    else update public.products set stock_quantity=stock_quantity+item.quantity where id=item.product_id returning stock_quantity into next_stock; end if;
    insert into public.inventory_movements(product_id,delta,stock_after,reason,order_id,actor_user_id,note)
    values(item.product_id,item.quantity,next_stock,'order_cancelled',p_order_id,actor_id,'Ripristino annullamento');
  end loop;
  update public.orders set status='cancelled' where id=p_order_id;
  insert into public.order_status_events(order_id,from_status,to_status,actor_user_id,note) values(p_order_id,current_status,'cancelled',actor_id,nullif(trim(p_note),''));
  insert into public.audit_events(actor_user_id,action,entity_type,entity_id,after_state) values(actor_id,'order.cancelled','orders',p_order_id::text,jsonb_build_object('stock_restored',true));
end;
$$;

create or replace function public.set_order_tracking(p_order_id bigint,p_carrier text,p_code text,p_url text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare actor_id uuid:=(select auth.uid());
begin
  if not private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role]) then raise exception using errcode='42501',message='GD_ORDER_MANAGER_REQUIRED'; end if;
  if nullif(trim(p_carrier),'') is null or nullif(trim(p_code),'') is null or (p_url is not null and p_url !~ '^https://') then raise exception using errcode='22023',message='GD_ORDER_INVALID_TRACKING'; end if;
  update public.orders set tracking_carrier=trim(p_carrier),tracking_code=trim(p_code),tracking_url=nullif(trim(p_url),'') where id=p_order_id;
  if not found then raise exception using errcode='P0002',message='GD_ORDER_NOT_FOUND'; end if;
  insert into public.audit_events(actor_user_id,action,entity_type,entity_id,after_state) values(actor_id,'order.tracking_set','orders',p_order_id::text,jsonb_build_object('carrier',trim(p_carrier),'code',trim(p_code)));
end;
$$;

create or replace function public.add_order_note(p_order_id bigint,p_note text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare actor_id uuid:=(select auth.uid()); note_id bigint;
begin
  if not private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role]) then raise exception using errcode='42501',message='GD_ORDER_STAFF_REQUIRED'; end if;
  insert into public.order_notes(order_id,author_user_id,note) values(p_order_id,actor_id,trim(p_note)) returning id into note_id;
  insert into public.audit_events(actor_user_id,action,entity_type,entity_id,after_state) values(actor_id,'order.note_added','orders',p_order_id::text,jsonb_build_object('note_id',note_id));
  return note_id;
end;
$$;

create or replace function public.prepare_order_refund(p_order_id bigint,p_amount_cents integer,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor_id uuid:=(select auth.uid()); order_total integer; payment public.payment_status;
begin
  if not private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role]) then raise exception using errcode='42501',message='GD_ORDER_MANAGER_REQUIRED'; end if;
  select total_cents,payment_status into order_total,payment from public.orders where id=p_order_id for update;
  if not found then raise exception using errcode='P0002',message='GD_ORDER_NOT_FOUND'; end if;
  if payment not in ('authorized','paid') or p_amount_cents<=0 or p_amount_cents>order_total or nullif(trim(p_reason),'') is null then raise exception using errcode='22023',message='GD_ORDER_REFUND_INVALID'; end if;
  update public.orders set refund_prepared_at=now(),refund_amount_cents=p_amount_cents,refund_reason=trim(p_reason) where id=p_order_id;
  insert into public.audit_events(actor_user_id,action,entity_type,entity_id,after_state) values(actor_id,'order.refund_prepared','orders',p_order_id::text,jsonb_build_object('amount_cents',p_amount_cents));
end;
$$;

revoke all on function public.create_order(text,text,jsonb,jsonb,jsonb,text,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.transition_order_status(bigint,public.order_status,text) from public,anon,authenticated,service_role;
revoke all on function public.cancel_order_and_restore_stock(bigint,text) from public,anon,authenticated,service_role;
revoke all on function public.set_order_tracking(bigint,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.add_order_note(bigint,text) from public,anon,authenticated,service_role;
revoke all on function public.prepare_order_refund(bigint,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.create_order(text,text,jsonb,jsonb,jsonb,text,text,uuid) to anon,authenticated;
grant execute on function public.transition_order_status(bigint,public.order_status,text) to authenticated;
grant execute on function public.cancel_order_and_restore_stock(bigint,text) to authenticated;
grant execute on function public.set_order_tracking(bigint,text,text,text) to authenticated;
grant execute on function public.add_order_note(bigint,text) to authenticated;
grant execute on function public.prepare_order_refund(bigint,integer,text) to authenticated;
