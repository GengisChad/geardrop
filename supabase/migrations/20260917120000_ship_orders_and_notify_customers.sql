begin;

-- Shipping an order and telling the buyer is one step for the owner. ship_order records the
-- courier and tracking code and moves a paid order straight to "shipped" (a confirmed order no
-- longer needs a separate "processing" step first); mark_order_shipping_notified stamps the
-- order once the buyer's shipping email has gone out, so it is never sent twice by mistake and
-- the admin panel can list the shipped orders still waiting for one.

alter table public.orders
  add column shipping_notified_at timestamptz;

create or replace function public.ship_order(
  p_order_id bigint,
  p_carrier text,
  p_code text default null,
  p_url text default null,
  p_note text default null
)
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

  if nullif(btrim(p_carrier), '') is null
    or length(btrim(p_carrier)) > 120
    or length(btrim(coalesce(p_code, ''))) > 240
    or (nullif(btrim(p_url), '') is not null and btrim(p_url) !~ '^https://') then
    raise exception using errcode = '22023', message = 'GD_ORDER_INVALID_TRACKING';
  end if;

  select orders.status into current_status from public.orders where orders.id = p_order_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_ORDER_NOT_FOUND';
  end if;

  -- Only a paid order that is not yet closed can ship; an already shipped one may correct its
  -- tracking without a second status event.
  if current_status not in ('confirmed', 'processing', 'shipped') then
    raise exception using errcode = '22023', message = 'GD_ORDER_INVALID_TRANSITION';
  end if;

  update public.orders
  set status = 'shipped',
      shipped_at = coalesce(shipped_at, now()),
      tracking_carrier = btrim(p_carrier),
      tracking_code = nullif(btrim(p_code), ''),
      tracking_url = nullif(btrim(p_url), '')
  where id = p_order_id;

  if current_status <> 'shipped' then
    insert into public.order_status_events(order_id, from_status, to_status, actor_user_id, note)
    values (p_order_id, current_status, 'shipped', actor_id, nullif(btrim(p_note), ''));
  end if;

  insert into public.audit_events(actor_user_id, action, entity_type, entity_id, before_state, after_state)
  values (
    actor_id, 'order.shipped', 'orders', p_order_id::text,
    jsonb_build_object('status', current_status),
    jsonb_build_object('status', 'shipped', 'carrier', btrim(p_carrier), 'code', nullif(btrim(p_code), ''))
  );
end;
$$;

create or replace function public.mark_order_shipping_notified(p_order_id bigint)
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
  set shipping_notified_at = now()
  where id = p_order_id
    and status in ('shipped', 'completed');
  if not found then
    raise exception using errcode = '22023', message = 'GD_ORDER_INVALID_TRANSITION';
  end if;

  insert into public.audit_events(actor_user_id, action, entity_type, entity_id, after_state)
  values (actor_id, 'order.shipping_notified', 'orders', p_order_id::text, jsonb_build_object('notified', true));
end;
$$;

revoke all on function public.ship_order(bigint, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.mark_order_shipping_notified(bigint) from public, anon, authenticated, service_role;
grant execute on function public.ship_order(bigint, text, text, text, text) to authenticated;
grant execute on function public.mark_order_shipping_notified(bigint) to authenticated;

commit;
