-- Returns and supplier orders (owner, 2026-11-18: "magazzino completo", taken from what a WMS
-- does and the shop did not).
--
-- 1. A return puts the pieces a buyer sent back into stock, or records them as damaged, in one
--    transaction. The audit log is the record of every return, so a piece can never come back
--    twice; the movements carry the order number in their note but no order_id, because a
--    movement with an order_id is read as a reservation of that order (annotate_balance).
-- 2. A receipt draft can be marked "ordinato" with the day the goods are expected, so what has
--    been ordered from a supplier shows as on its way until it arrives and is confirmed.

-- 1. Returns ---------------------------------------------------------------------------------

create function public.record_order_return(
  p_order_id bigint,
  p_lines jsonb,
  p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_order public.orders%rowtype;
  target_product public.products%rowtype;
  line jsonb;
  line_product_id bigint;
  line_quantity integer;
  line_restock boolean;
  sold integer;
  returned integer;
  next_stock integer;
  restocked integer := 0;
  damaged integer := 0;
  movement_note text;
  clean_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select orders.* into target_order from public.orders as orders where orders.id = p_order_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_ORDER_NOT_FOUND';
  end if;
  perform private.require_org_role(target_order.organization_id,
    array['owner'::public.staff_role, 'admin'::public.staff_role], 'GD_ORDER_MANAGER_REQUIRED');
  if target_order.status not in ('shipped'::public.order_status, 'completed'::public.order_status) then
    raise exception using errcode = '55000', message = 'GD_RETURN_NOT_SHIPPED';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception using errcode = '22023', message = 'GD_RETURN_EMPTY';
  end if;
  if clean_note is not null and char_length(clean_note) > 500 then
    raise exception using errcode = '22023', message = 'GD_RETURN_INVALID_LINE';
  end if;
  movement_note := 'Reso ' || target_order.order_number || coalesce(': ' || clean_note, '');

  for line in select value from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(line) <> 'object'
      or jsonb_typeof(line -> 'product_id') <> 'number'
      or jsonb_typeof(line -> 'quantity') <> 'number' then
      raise exception using errcode = '22023', message = 'GD_RETURN_INVALID_LINE';
    end if;
    line_product_id := (line ->> 'product_id')::bigint;
    line_quantity := (line ->> 'quantity')::integer;
    line_restock := coalesce((line ->> 'restock')::boolean, true);
    if line_quantity is null or line_quantity <= 0 then
      raise exception using errcode = '22023', message = 'GD_RETURN_INVALID_LINE';
    end if;

    select coalesce(sum(item.quantity), 0)::integer into sold
    from public.order_items as item
    where item.order_id = target_order.id and item.product_id = line_product_id;
    select coalesce(sum((event.after_state ->> 'quantity')::integer), 0)::integer into returned
    from public.audit_events as event
    where event.organization_id = target_order.organization_id
      and event.action = 'order.return_recorded'
      and event.entity_type = 'orders'
      and event.entity_id = target_order.id::text
      and (event.after_state ->> 'product_id')::bigint = line_product_id;
    if returned + line_quantity > sold then
      raise exception using errcode = '23514', message = 'GD_RETURN_TOO_MANY';
    end if;

    select product.* into target_product from public.products as product
    where product.id = line_product_id and product.organization_id = target_order.organization_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'GD_PRODUCT_NOT_FOUND';
    end if;

    next_stock := target_product.stock_quantity + line_quantity;
    update public.products set stock_quantity = next_stock where id = target_product.id;
    insert into public.inventory_movements (product_id, delta, stock_after, reason, actor_user_id, note)
    values (target_product.id, line_quantity, next_stock, 'return', actor_id, movement_note);
    if line_restock then
      restocked := restocked + line_quantity;
    else
      -- Back in the shop's hands but not sellable: in and straight out as damage, so the
      -- movements tell the whole story and the stock does not move.
      next_stock := next_stock - line_quantity;
      update public.products set stock_quantity = next_stock where id = target_product.id;
      insert into public.inventory_movements (product_id, delta, stock_after, reason, actor_user_id, note)
      values (target_product.id, -line_quantity, next_stock, 'damage', actor_id, movement_note);
      damaged := damaged + line_quantity;
    end if;

    insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, after_state)
    values (target_order.organization_id, actor_id, 'order.return_recorded', 'orders', target_order.id::text,
      jsonb_build_object('product_id', target_product.id, 'sku', target_product.sku, 'quantity', line_quantity,
        'restocked', line_restock, 'note', clean_note));
  end loop;

  insert into public.order_notes (order_id, author_user_id, note)
  values (target_order.id, actor_id,
    'Reso registrato: ' || restocked || ' rimessi in vendita, ' || damaged || ' non vendibili'
      || coalesce('. ' || clean_note, '') || '.');
  return restocked;
end;
$$;
revoke all on function public.record_order_return(bigint, jsonb, text) from public, anon, authenticated;
grant execute on function public.record_order_return(bigint, jsonb, text) to authenticated;

-- 2. Supplier orders -------------------------------------------------------------------------

alter table public.supplier_receipts
  add column ordered_at timestamptz,
  add column expected_on date;

comment on column public.supplier_receipts.ordered_at is
  'When the draft was sent to the supplier as an order; null for a draft not ordered yet.';
comment on column public.supplier_receipts.expected_on is
  'The day the supplier said the goods arrive; only meaningful while the order is open.';

create function public.mark_supplier_receipt_ordered(
  p_receipt_id bigint,
  p_expected_on date default null,
  p_ordered boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target public.supplier_receipts%rowtype;
begin
  select receipt.* into target from public.supplier_receipts as receipt where receipt.id = p_receipt_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_RECEIPT_NOT_FOUND';
  end if;
  perform private.require_org_role(target.organization_id,
    array['owner'::public.staff_role, 'admin'::public.staff_role], 'GD_WAREHOUSE_MANAGER_REQUIRED');
  if target.status <> 'draft' then
    raise exception using errcode = '55000', message = 'GD_RECEIPT_NOT_DRAFT';
  end if;

  update public.supplier_receipts set
    ordered_at = case when p_ordered then coalesce(target.ordered_at, now()) else null end,
    expected_on = case when p_ordered then p_expected_on else null end
  where id = target.id;

  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, before_state, after_state)
  values (target.organization_id, actor_id,
    case when p_ordered then 'supplier_receipt.ordered' else 'supplier_receipt.order_withdrawn' end,
    'supplier_receipts', target.id::text,
    jsonb_build_object('ordered_at', target.ordered_at, 'expected_on', target.expected_on),
    jsonb_build_object('ordered', p_ordered, 'expected_on', case when p_ordered then p_expected_on end));
end;
$$;
revoke all on function public.mark_supplier_receipt_ordered(bigint, date, boolean) from public, anon, authenticated;
grant execute on function public.mark_supplier_receipt_ordered(bigint, date, boolean) to authenticated;
