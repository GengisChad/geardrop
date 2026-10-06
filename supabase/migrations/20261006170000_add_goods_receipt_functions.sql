-- Goods receipts, product costs and order profit.
--
-- Owners and admins save a supplier document as a draft, then confirm it: the stock rises,
-- every line is valued at its landed cost (its share of freight and duties included) and the
-- weighted average cost moves. A confirmed document is reversed, never edited. An owner can
-- give a product its cost directly (the opening load of goods already on the shelf). Orders
-- get their courier, packaging and payment costs; order_profit puts it all together.

-- A stock counter of a thousand or more on a product that is not a pre-order means "no
-- limit" (made to order): it is not a quantity of goods, so it never weighs on an average.
create or replace function private.stock_on_hand_for_cost(p_product public.products)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_product.stock_quantity >= 1000 and p_product.availability_override is distinct from 'preorder' then 0
    else greatest(p_product.stock_quantity, 0)
  end;
$$;
revoke all on function private.stock_on_hand_for_cost(public.products) from public;
grant execute on function private.stock_on_hand_for_cost(public.products) to authenticated;

-- ---------------------------------------------------------------------------------------
-- Draft documents.
-- ---------------------------------------------------------------------------------------

create function public.save_supplier_receipt(
  p_organization_id bigint,
  p_receipt jsonb,
  p_lines jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_receipt_id bigint := nullif(p_receipt ->> 'id', '')::bigint;
  target_supplier public.suppliers%rowtype;
  line record;
begin
  perform private.require_org_role(p_organization_id,
    array['owner'::public.staff_role, 'admin'::public.staff_role], 'GD_WAREHOUSE_MANAGER_REQUIRED');

  select supplier.* into target_supplier from public.suppliers as supplier
  where supplier.id = nullif(p_receipt ->> 'supplier_id', '')::bigint
    and supplier.organization_id = p_organization_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_SUPPLIER_NOT_FOUND';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception using errcode = '22023', message = 'GD_RECEIPT_LINES_REQUIRED';
  end if;

  if target_receipt_id is null then
    insert into public.supplier_receipts (
      organization_id, supplier_id, document_kind, document_number, document_date, vat_regime,
      freight_cents, duties_cents, notes, created_by
    )
    values (
      p_organization_id, target_supplier.id,
      (p_receipt ->> 'document_kind')::public.supplier_document_kind,
      btrim(p_receipt ->> 'document_number'),
      (p_receipt ->> 'document_date')::date,
      coalesce(nullif(p_receipt ->> 'vat_regime', '')::public.vat_regime, target_supplier.vat_regime),
      coalesce(nullif(p_receipt ->> 'freight_cents', '')::integer, 0),
      coalesce(nullif(p_receipt ->> 'duties_cents', '')::integer, 0),
      nullif(btrim(p_receipt ->> 'notes'), ''),
      actor_id
    )
    returning id into target_receipt_id;
  else
    update public.supplier_receipts as receipt set
      supplier_id = target_supplier.id,
      document_kind = (p_receipt ->> 'document_kind')::public.supplier_document_kind,
      document_number = btrim(p_receipt ->> 'document_number'),
      document_date = (p_receipt ->> 'document_date')::date,
      vat_regime = coalesce(nullif(p_receipt ->> 'vat_regime', '')::public.vat_regime, target_supplier.vat_regime),
      freight_cents = coalesce(nullif(p_receipt ->> 'freight_cents', '')::integer, 0),
      duties_cents = coalesce(nullif(p_receipt ->> 'duties_cents', '')::integer, 0),
      notes = nullif(btrim(p_receipt ->> 'notes'), '')
    where receipt.id = target_receipt_id
      and receipt.organization_id = p_organization_id
      and receipt.status = 'draft';
    if not found then
      raise exception using errcode = '55000', message = 'GD_RECEIPT_NOT_DRAFT';
    end if;
    delete from public.supplier_receipt_lines as receipt_line where receipt_line.receipt_id = target_receipt_id;
  end if;

  for line in
    select value, ordinality from jsonb_array_elements(p_lines) with ordinality
  loop
    -- The composite key refuses a product of another company.
    insert into public.supplier_receipt_lines (organization_id, receipt_id, product_id, quantity, unit_cost_cents, sort_order)
    values (
      p_organization_id, target_receipt_id,
      (line.value ->> 'product_id')::bigint,
      (line.value ->> 'quantity')::integer,
      (line.value ->> 'unit_cost_cents')::integer,
      line.ordinality - 1
    );
  end loop;

  return target_receipt_id;
end;
$$;
revoke all on function public.save_supplier_receipt(bigint, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_supplier_receipt(bigint, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------
-- Confirmation: stock in, landed cost, weighted average.
-- ---------------------------------------------------------------------------------------

create function public.confirm_supplier_receipt(p_receipt_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target public.supplier_receipts%rowtype;
  line_count integer;
  goods_total numeric;
  total_quantity numeric;
  extra_costs bigint;
  allocated_so_far bigint := 0;
  line_position integer := 0;
  line record;
  share bigint;
  landed bigint;
  landed_unit integer;
  current_product public.products%rowtype;
  current_average integer;
  on_hand integer;
  next_average integer;
  next_stock integer;
  new_movement_id bigint;
  document_value bigint := 0;
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

  select count(*), coalesce(sum(receipt_line.quantity::numeric * receipt_line.unit_cost_cents), 0),
    coalesce(sum(receipt_line.quantity), 0)
  into line_count, goods_total, total_quantity
  from public.supplier_receipt_lines as receipt_line
  where receipt_line.receipt_id = target.id;
  if line_count = 0 then
    raise exception using errcode = '22023', message = 'GD_RECEIPT_LINES_REQUIRED';
  end if;
  extra_costs := target.freight_cents + target.duties_cents;

  for line in
    select receipt_line.* from public.supplier_receipt_lines as receipt_line
    where receipt_line.receipt_id = target.id
    order by receipt_line.sort_order, receipt_line.id
  loop
    line_position := line_position + 1;
    -- Freight and duties follow the value of each line (the quantity when nothing has a
    -- value); the last line takes the rounding, so the document adds up to the cent.
    if line_position = line_count then
      share := extra_costs - allocated_so_far;
    elsif goods_total > 0 then
      share := floor(extra_costs * (line.quantity::numeric * line.unit_cost_cents) / goods_total);
    else
      share := floor(extra_costs * line.quantity::numeric / total_quantity);
    end if;
    allocated_so_far := allocated_so_far + share;
    landed := line.quantity::bigint * line.unit_cost_cents + share;
    landed_unit := round(landed::numeric / line.quantity);

    update public.supplier_receipt_lines as receipt_line set
      allocated_costs_cents = share,
      landed_total_cents = landed,
      landed_unit_cost_cents = landed_unit
    where receipt_line.id = line.id;

    select product.* into current_product from public.products as product where product.id = line.product_id for update;
    select state.average_cost_cents into current_average
    from public.inventory_cost_state as state where state.product_id = line.product_id for update;

    -- Goods already on the shelf without a known cost count as bought at this price.
    on_hand := private.stock_on_hand_for_cost(current_product);
    if current_average is null or on_hand = 0 then
      next_average := landed_unit;
    else
      next_average := round((on_hand::numeric * current_average + landed) / (on_hand + line.quantity));
    end if;

    next_stock := current_product.stock_quantity + line.quantity;
    update public.products set stock_quantity = next_stock where id = current_product.id;
    insert into public.inventory_movements (product_id, delta, stock_after, reason, actor_user_id, note, receipt_line_id)
    values (current_product.id, line.quantity, next_stock, 'receipt', actor_id,
      left(format('%s %s', case target.document_kind when 'invoice' then 'Fattura' else 'DDT' end, target.document_number), 500),
      line.id)
    returning id into new_movement_id;
    insert into public.inventory_movement_costs (movement_id, unit_cost_cents, source)
    values (new_movement_id, landed_unit, 'receipt');

    insert into public.inventory_cost_state (product_id, organization_id, average_cost_cents, last_cost_cents,
      last_receipt_id, source, updated_at, updated_by)
    values (current_product.id, target.organization_id, next_average, landed_unit, target.id, 'receipt', now(), actor_id)
    on conflict (product_id) do update set
      average_cost_cents = excluded.average_cost_cents,
      last_cost_cents = excluded.last_cost_cents,
      last_receipt_id = excluded.last_receipt_id,
      source = excluded.source,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;

    document_value := document_value + landed;
  end loop;

  update public.supplier_receipts as receipt set
    status = 'confirmed', confirmed_at = now(), confirmed_by = actor_id
  where receipt.id = target.id;

  return jsonb_build_object('receipt_id', target.id, 'lines', line_count, 'value_cents', document_value);
end;
$$;
revoke all on function public.confirm_supplier_receipt(bigint) from public, anon, authenticated;
grant execute on function public.confirm_supplier_receipt(bigint) to authenticated;

-- ---------------------------------------------------------------------------------------
-- Reversal: the goods leave at the cost they entered with.
-- ---------------------------------------------------------------------------------------

create function public.reverse_supplier_receipt(p_receipt_id bigint, p_reason text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target public.supplier_receipts%rowtype;
  line record;
  current_product public.products%rowtype;
  current_average integer;
  on_hand integer;
  remaining integer;
  next_stock integer;
  new_movement_id bigint;
  unlimited boolean;
begin
  select receipt.* into target from public.supplier_receipts as receipt where receipt.id = p_receipt_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_RECEIPT_NOT_FOUND';
  end if;
  perform private.require_org_role(target.organization_id,
    array['owner'::public.staff_role, 'admin'::public.staff_role], 'GD_WAREHOUSE_MANAGER_REQUIRED');
  if target.status <> 'confirmed' then
    raise exception using errcode = '55000', message = 'GD_RECEIPT_NOT_CONFIRMED';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception using errcode = '22023', message = 'GD_RECEIPT_REVERSAL_REASON_REQUIRED';
  end if;

  for line in
    select receipt_line.* from public.supplier_receipt_lines as receipt_line
    where receipt_line.receipt_id = target.id
    order by receipt_line.sort_order, receipt_line.id
  loop
    select product.* into current_product from public.products as product where product.id = line.product_id for update;
    unlimited := current_product.stock_quantity >= 1000 and current_product.availability_override is distinct from 'preorder';
    if not unlimited and current_product.stock_quantity < line.quantity then
      raise exception using errcode = '23514', message = 'GD_RECEIPT_STOCK_ALREADY_SOLD';
    end if;

    select state.average_cost_cents into current_average
    from public.inventory_cost_state as state where state.product_id = line.product_id for update;
    on_hand := private.stock_on_hand_for_cost(current_product);
    remaining := on_hand - line.quantity;
    if current_average is not null and not unlimited and remaining > 0 then
      update public.inventory_cost_state as state set
        average_cost_cents = greatest(round((on_hand::numeric * current_average - line.landed_total_cents) / remaining), 0),
        source = 'receipt',
        updated_at = now(),
        updated_by = actor_id
      where state.product_id = line.product_id;
    end if;

    next_stock := current_product.stock_quantity - line.quantity;
    update public.products set stock_quantity = next_stock where id = current_product.id;
    insert into public.inventory_movements (product_id, delta, stock_after, reason, actor_user_id, note, receipt_line_id)
    values (current_product.id, -line.quantity, next_stock, 'receipt_reversal', actor_id,
      left(format('Storno %s: %s', target.document_number, btrim(p_reason)), 500), line.id)
    returning id into new_movement_id;
    insert into public.inventory_movement_costs (movement_id, unit_cost_cents, source)
    values (new_movement_id, line.landed_unit_cost_cents, 'receipt');
  end loop;

  update public.supplier_receipts as receipt set
    status = 'reversed', reversed_at = now(), reversed_by = actor_id, reversal_reason = btrim(p_reason)
  where receipt.id = target.id;
  return target.id;
end;
$$;
revoke all on function public.reverse_supplier_receipt(bigint, text) from public, anon, authenticated;
grant execute on function public.reverse_supplier_receipt(bigint, text) to authenticated;

-- ---------------------------------------------------------------------------------------
-- A product's cost set by an owner: the opening load, or a correction. Optionally values
-- the product's past movements that had no cost, so earlier orders get their profit.
-- ---------------------------------------------------------------------------------------

create function public.set_product_cost(
  p_organization_id bigint,
  p_product_id bigint,
  p_unit_cost_cents integer,
  p_reason text,
  p_value_unvalued_movements boolean default true
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_product public.products%rowtype;
  previous_average integer;
  valued integer := 0;
begin
  perform private.require_org_role(p_organization_id, array['owner'::public.staff_role], 'GD_COST_OWNER_REQUIRED');
  if p_unit_cost_cents is null or p_unit_cost_cents < 0 or p_unit_cost_cents > 100000000 then
    raise exception using errcode = '22023', message = 'GD_INVALID_UNIT_COST';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception using errcode = '22023', message = 'GD_COST_REASON_REQUIRED';
  end if;
  select product.* into target_product from public.products as product
  where product.id = p_product_id and product.organization_id = p_organization_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_PRODUCT_NOT_FOUND';
  end if;

  select state.average_cost_cents into previous_average
  from public.inventory_cost_state as state where state.product_id = p_product_id;

  insert into public.inventory_cost_state (product_id, organization_id, average_cost_cents, last_cost_cents,
    source, updated_at, updated_by)
  values (p_product_id, p_organization_id, p_unit_cost_cents, p_unit_cost_cents, 'manual', now(), actor_id)
  on conflict (product_id) do update set
    average_cost_cents = excluded.average_cost_cents,
    last_cost_cents = excluded.last_cost_cents,
    source = excluded.source,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;

  if coalesce(p_value_unvalued_movements, true) then
    insert into public.inventory_movement_costs (movement_id, unit_cost_cents, source)
    select movement.id, p_unit_cost_cents, 'manual'
    from public.inventory_movements as movement
    where movement.product_id = p_product_id
      and not exists (select 1 from public.inventory_movement_costs as cost where cost.movement_id = movement.id);
    get diagnostics valued = row_count;
  end if;

  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, before_state, after_state)
  values (p_organization_id, actor_id, 'inventory.cost_set', 'products', p_product_id::text,
    jsonb_build_object('sku', target_product.sku, 'average_cost_cents', previous_average),
    jsonb_build_object('sku', target_product.sku, 'average_cost_cents', p_unit_cost_cents,
      'valued_movements', valued, 'reason', btrim(p_reason)));
  return valued;
end;
$$;
revoke all on function public.set_product_cost(bigint, bigint, integer, text, boolean) from public, anon, authenticated;
grant execute on function public.set_product_cost(bigint, bigint, integer, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------
-- Order costs: the payment fee Stripe charged (webhook), and what staff know.
-- ---------------------------------------------------------------------------------------

create function public.record_order_payment_fee(p_order_id bigint, p_fee_cents integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_fee_cents is null or p_fee_cents < 0 then
    raise exception using errcode = '22023', message = 'GD_INVALID_PAYMENT_FEE';
  end if;
  -- A fee typed by staff wins over a later webhook retry.
  update public.orders as target set payment_fee_cents = p_fee_cents, payment_fee_source = 'stripe'
  where target.id = p_order_id and target.payment_fee_source is distinct from 'manual';
end;
$$;
revoke all on function public.record_order_payment_fee(bigint, integer) from public, anon, authenticated;
grant execute on function public.record_order_payment_fee(bigint, integer) to service_role;

-- p_costs holds only the keys to change; a null value goes back to the default.
create function public.set_order_costs(p_order_id bigint, p_costs jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target public.orders%rowtype;
  next_row public.orders%rowtype;
begin
  select existing.* into target from public.orders as existing where existing.id = p_order_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_ORDER_NOT_FOUND';
  end if;
  perform private.require_org_role(target.organization_id,
    array['owner'::public.staff_role, 'admin'::public.staff_role], 'GD_ORDER_MANAGER_REQUIRED');
  if jsonb_typeof(p_costs) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'GD_INVALID_ORDER_COSTS';
  end if;

  update public.orders as existing set
    shipping_cost_cents = case when p_costs ? 'shipping_cost_cents'
      then (p_costs ->> 'shipping_cost_cents')::integer else existing.shipping_cost_cents end,
    packaging_cost_cents = case when p_costs ? 'packaging_cost_cents'
      then (p_costs ->> 'packaging_cost_cents')::integer else existing.packaging_cost_cents end,
    payment_fee_cents = case when p_costs ? 'payment_fee_cents'
      then (p_costs ->> 'payment_fee_cents')::integer else existing.payment_fee_cents end,
    payment_fee_source = case
      when p_costs ? 'payment_fee_cents' and p_costs ->> 'payment_fee_cents' is not null then 'manual'
      when p_costs ? 'payment_fee_cents' then null
      else existing.payment_fee_source end
  where existing.id = target.id
  returning existing.* into next_row;

  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, before_state, after_state)
  values (target.organization_id, actor_id, 'order.costs_set', 'orders', target.id::text,
    jsonb_build_object('shipping_cost_cents', target.shipping_cost_cents, 'packaging_cost_cents', target.packaging_cost_cents,
      'payment_fee_cents', target.payment_fee_cents),
    jsonb_build_object('shipping_cost_cents', next_row.shipping_cost_cents, 'packaging_cost_cents', next_row.packaging_cost_cents,
      'payment_fee_cents', next_row.payment_fee_cents));
end;
$$;
revoke all on function public.set_order_costs(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.set_order_costs(bigint, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------
-- Profit per paid order, and the value of the warehouse. Both run with the reader's rights:
-- only owners and admins see orders and costs.
-- ---------------------------------------------------------------------------------------

create view public.order_profit
with (security_invoker = true)
as
with goods as (
  select
    movement.order_id,
    sum(-movement.delta::bigint * cost.unit_cost_cents)::bigint as cost_cents,
    count(*) filter (where cost.movement_id is null) as unvalued
  from public.inventory_movements as movement
  left join public.inventory_movement_costs as cost on cost.movement_id = movement.id
  where movement.order_id is not null
  group by movement.order_id
),
parts as (
  select
    orders.id as order_id,
    orders.organization_id,
    orders.order_number,
    orders.created_at,
    orders.status,
    orders.payment_status,
    orders.vat_rate_bp,
    orders.total_cents - orders.refunded_cents as revenue_gross_cents,
    round((orders.total_cents - orders.refunded_cents) * 10000.0 / (10000 + orders.vat_rate_bp))::bigint as revenue_net_cents,
    case when goods.order_id is not null and goods.unvalued = 0 then goods.cost_cents end as cost_of_goods_cents,
    coalesce(orders.shipping_cost_cents, method.cost_cents) as shipping_cost_cents,
    orders.payment_fee_cents,
    coalesce(orders.packaging_cost_cents, organization.packaging_cost_cents) as packaging_cost_cents
  from public.orders as orders
  join public.organizations as organization on organization.id = orders.organization_id
  left join public.shipping_methods as method
    on method.organization_id = orders.organization_id and method.code = orders.shipping_method_code
  left join goods on goods.order_id = orders.id
  where orders.payment_status in ('paid', 'refunded')
)
select
  parts.*,
  array_remove(array[
    case when parts.cost_of_goods_cents is null then 'cost_of_goods' end,
    case when parts.shipping_cost_cents is null then 'shipping_cost' end,
    case when parts.payment_fee_cents is null then 'payment_fee' end
  ], null) as missing,
  parts.revenue_net_cents - parts.cost_of_goods_cents - parts.shipping_cost_cents
    - parts.payment_fee_cents - parts.packaging_cost_cents as profit_cents
from parts;

comment on view public.order_profit is
  'Management profit of each paid order, net of VAT: revenue minus goods, courier, payment fee and packaging. profit_cents is null while any cost is missing (see missing).';

create view public.inventory_valuation
with (security_invoker = true)
as
select
  product.organization_id,
  product.id as product_id,
  product.sku,
  product.name,
  product.stock_quantity,
  private.stock_on_hand_for_cost(product) as valued_quantity,
  (product.stock_quantity >= 1000 and product.availability_override is distinct from 'preorder') as unlimited_stock,
  state.average_cost_cents,
  state.last_cost_cents,
  state.source as cost_source,
  state.updated_at as cost_updated_at,
  private.stock_on_hand_for_cost(product)::bigint * state.average_cost_cents as value_cents
from public.products as product
left join public.inventory_cost_state as state on state.product_id = product.id;

comment on view public.inventory_valuation is
  'Stock of each product at its weighted average cost. value_cents is null while the cost is unknown.';

revoke all on public.order_profit, public.inventory_valuation from anon, authenticated;
grant select on public.order_profit, public.inventory_valuation to authenticated;

-- ---------------------------------------------------------------------------------------
-- The warehouse figures of the overview.
-- ---------------------------------------------------------------------------------------

create function public.get_warehouse_summary(p_organization_id bigint, p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform private.require_org_role(p_organization_id,
    array['owner'::public.staff_role, 'admin'::public.staff_role], 'GD_WAREHOUSE_MANAGER_REQUIRED');
  if p_days is null or p_days not between 1 and 366 then
    raise exception using errcode = '22023', message = 'GD_INVALID_PERIOD';
  end if;

  with valuation as (
    select
      coalesce(sum(private.stock_on_hand_for_cost(product)::bigint * state.average_cost_cents), 0) as stock_value_cents,
      count(*) filter (where state.product_id is null and product.publication_status <> 'archived') as products_without_cost
    from public.products as product
    left join public.inventory_cost_state as state on state.product_id = product.id
    where product.organization_id = p_organization_id
  ),
  goods as (
    select movement.order_id,
      sum(-movement.delta::bigint * cost.unit_cost_cents) as cost_cents,
      count(*) filter (where cost.movement_id is null) as unvalued
    from public.inventory_movements as movement
    left join public.inventory_movement_costs as cost on cost.movement_id = movement.id
    where movement.organization_id = p_organization_id and movement.order_id is not null
    group by movement.order_id
  ),
  recent as (
    select
      round((orders.total_cents - orders.refunded_cents) * 10000.0 / (10000 + orders.vat_rate_bp))::bigint
        - goods.cost_cents
        - coalesce(orders.shipping_cost_cents, method.cost_cents)
        - orders.payment_fee_cents
        - coalesce(orders.packaging_cost_cents, organization.packaging_cost_cents) as profit_cents,
      round((orders.total_cents - orders.refunded_cents) * 10000.0 / (10000 + orders.vat_rate_bp))::bigint as revenue_net_cents
    from public.orders as orders
    join public.organizations as organization on organization.id = orders.organization_id
    left join public.shipping_methods as method
      on method.organization_id = orders.organization_id and method.code = orders.shipping_method_code
    left join goods on goods.order_id = orders.id and goods.unvalued = 0
    where orders.organization_id = p_organization_id
      and orders.payment_status in ('paid', 'refunded')
      and orders.created_at >= now() - make_interval(days => p_days)
  )
  select jsonb_build_object(
    'stock_value_cents', valuation.stock_value_cents,
    'products_without_cost', valuation.products_without_cost,
    'draft_receipts', (select count(*) from public.supplier_receipts as receipt
      where receipt.organization_id = p_organization_id and receipt.status = 'draft'),
    'period_days', p_days,
    'complete_orders', (select count(*) from recent where recent.profit_cents is not null),
    'incomplete_orders', (select count(*) from recent where recent.profit_cents is null),
    'profit_cents', (select coalesce(sum(recent.profit_cents), 0) from recent where recent.profit_cents is not null),
    'revenue_net_cents', (select coalesce(sum(recent.revenue_net_cents), 0) from recent where recent.profit_cents is not null)
  )
  into result
  from valuation;
  return result;
end;
$$;
revoke all on function public.get_warehouse_summary(bigint, integer) from public, anon, authenticated;
grant execute on function public.get_warehouse_summary(bigint, integer) to authenticated;

-- ---------------------------------------------------------------------------------------
-- The company's profit defaults: VAT rate of its sales and packaging cost per order.
-- ---------------------------------------------------------------------------------------

create function public.set_organization_cost_defaults(
  p_organization_id bigint,
  p_default_vat_rate_bp integer,
  p_packaging_cost_cents integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  previous public.organizations%rowtype;
begin
  perform private.require_org_role(p_organization_id, array['owner'::public.staff_role], 'GD_COST_OWNER_REQUIRED');
  if p_default_vat_rate_bp is null or p_default_vat_rate_bp not between 0 and 10000 then
    raise exception using errcode = '22023', message = 'GD_INVALID_VAT_RATE';
  end if;
  if p_packaging_cost_cents is null or p_packaging_cost_cents not between 0 and 100000 then
    raise exception using errcode = '22023', message = 'GD_INVALID_PACKAGING_COST';
  end if;
  select organization.* into previous from public.organizations as organization where organization.id = p_organization_id for update;
  update public.organizations set
    default_vat_rate_bp = p_default_vat_rate_bp,
    packaging_cost_cents = p_packaging_cost_cents,
    updated_at = now()
  where id = p_organization_id;
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, before_state, after_state)
  values (p_organization_id, actor_id, 'organization.cost_defaults_set', 'organizations', p_organization_id::text,
    jsonb_build_object('default_vat_rate_bp', previous.default_vat_rate_bp, 'packaging_cost_cents', previous.packaging_cost_cents),
    jsonb_build_object('default_vat_rate_bp', p_default_vat_rate_bp, 'packaging_cost_cents', p_packaging_cost_cents));
end;
$$;
revoke all on function public.set_organization_cost_defaults(bigint, integer, integer) from public, anon, authenticated;
grant execute on function public.set_organization_cost_defaults(bigint, integer, integer) to authenticated;
