begin;

-- The buyer heard from the shop when the parcel left and then never again. Marking an order
-- completed only wrote delivered_at, so "arrivato" was a fact the shop knew and the customer was
-- never told. complete_order closes the order the way ship_order opens it — repeatable, because
-- confirming an arrival a second time is not a new event — and delivery_notified_at records that
-- the confirmation email went out, so it is never sent twice and the panel can list who is still
-- waiting for one.

alter table public.orders
  add column if not exists delivery_notified_at timestamptz;

comment on column public.orders.delivery_notified_at is
  'When the buyer was emailed that the parcel arrived. Null on a completed order means nobody told them yet.';

create or replace function public.complete_order(p_order_id bigint, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  current_status public.order_status;
begin
  if not private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role]) then
    raise exception using errcode = '42501', message = 'GD_ORDER_MANAGER_REQUIRED';
  end if;

  select orders.status into current_status from public.orders where orders.id = p_order_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_ORDER_NOT_FOUND';
  end if;

  -- A parcel only arrives after it has left; an order already completed may have its confirmation
  -- sent again without producing a second status event.
  if current_status not in ('shipped', 'completed') then
    raise exception using errcode = '22023', message = 'GD_ORDER_INVALID_TRANSITION';
  end if;

  update public.orders
  set status = 'completed',
      delivered_at = coalesce(delivered_at, now())
  where id = p_order_id;

  if current_status <> 'completed' then
    insert into public.order_status_events(order_id, from_status, to_status, actor_user_id, note)
    values (p_order_id, current_status, 'completed', actor_id, nullif(btrim(p_note), ''));

    insert into public.audit_events(actor_user_id, action, entity_type, entity_id, before_state, after_state)
    values (
      actor_id, 'order.delivered', 'orders', p_order_id::text,
      jsonb_build_object('status', current_status),
      jsonb_build_object('status', 'completed')
    );
  end if;
end;
$$;

create or replace function public.mark_order_delivery_notified(p_order_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if not private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role]) then
    raise exception using errcode = '42501', message = 'GD_ORDER_MANAGER_REQUIRED';
  end if;

  update public.orders
  set delivery_notified_at = now()
  where id = p_order_id
    and status = 'completed';
  if not found then
    raise exception using errcode = '22023', message = 'GD_ORDER_INVALID_TRANSITION';
  end if;

  insert into public.audit_events(actor_user_id, action, entity_type, entity_id, after_state)
  values (actor_id, 'order.delivery_notified', 'orders', p_order_id::text, jsonb_build_object('notified', true));
end;
$$;

revoke all on function public.complete_order(bigint, text) from public, anon, authenticated, service_role;
revoke all on function public.mark_order_delivery_notified(bigint) from public, anon, authenticated, service_role;
grant execute on function public.complete_order(bigint, text) to authenticated;
grant execute on function public.mark_order_delivery_notified(bigint) to authenticated;

comment on function public.complete_order(bigint, text) is
  'Marks a shipped order delivered. Repeatable: a second call keeps delivered_at and adds no status event.';
comment on function public.mark_order_delivery_notified(bigint) is
  'Stamps a completed order once its delivery confirmation email has gone out to the buyer.';

commit;
