-- Demand forecast per product: how fast it sells, how long the shelf lasts, what to reorder.
--
-- Units sold are read from the stock movements of paid orders (bundles count through their
-- components, cancellations give the units back), over 7, 30 and 90 days. The daily rate
-- weighs the recent week most, so a product that starts selling shows it at once; the trend
-- compares the last week with the month. Reorder quantities cover the supplier's lead time and
-- a target number of days, minus the stock and the goods already on a draft goods receipt.
-- Owners and admins only: it carries costs.

create function public.get_inventory_forecast(
  p_organization_id bigint,
  p_lead_days integer default 14,
  p_target_days integer default 45
)
returns table (
  product_id bigint,
  sku text,
  name text,
  publication_status public.publication_status,
  price_cents integer,
  stock_quantity integer,
  unlimited_stock boolean,
  preorder_backlog integer,
  incoming_quantity integer,
  sold_7 integer,
  sold_30 integer,
  sold_90 integer,
  daily_rate numeric,
  trend numeric,
  days_of_cover numeric,
  stockout_date date,
  reorder_point integer,
  suggested_reorder integer,
  average_cost_cents integer,
  reorder_cost_cents bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_org_role(p_organization_id,
    array['owner'::public.staff_role, 'admin'::public.staff_role], 'GD_WAREHOUSE_MANAGER_REQUIRED');
  if p_lead_days is null or p_lead_days not between 0 and 365 or p_target_days is null or p_target_days not between 1 and 365 then
    raise exception using errcode = '22023', message = 'GD_INVALID_FORECAST_WINDOW';
  end if;

  return query
  with sales as (
    select movement.product_id,
      coalesce(sum(-movement.delta) filter (where movement.created_at >= now() - interval '7 days'), 0)::integer as sold_7,
      coalesce(sum(-movement.delta) filter (where movement.created_at >= now() - interval '30 days'), 0)::integer as sold_30,
      coalesce(sum(-movement.delta), 0)::integer as sold_90
    from public.inventory_movements as movement
    where movement.organization_id = p_organization_id
      and movement.order_id is not null
      and movement.reason in ('order_reserved', 'order_cancelled')
      and movement.created_at >= now() - interval '90 days'
    group by movement.product_id
  ),
  backlog as (
    select item.product_id, sum(item.preorder_quantity)::integer as units
    from public.order_items as item
    join public.orders as orders on orders.id = item.order_id
    where item.organization_id = p_organization_id
      and item.product_id is not null
      and orders.payment_status = 'paid'
      and orders.status in ('confirmed', 'processing')
      and item.preorder_quantity > 0
    group by item.product_id
  ),
  incoming as (
    select receipt_line.product_id, sum(receipt_line.quantity)::integer as units
    from public.supplier_receipt_lines as receipt_line
    join public.supplier_receipts as receipt on receipt.id = receipt_line.receipt_id
    where receipt_line.organization_id = p_organization_id and receipt.status = 'draft'
    group by receipt_line.product_id
  ),
  rates as (
    select
      product.id,
      product.sku,
      product.name,
      product.publication_status,
      product.price_cents,
      product.stock_quantity,
      (product.stock_quantity >= 1000 and product.availability_override is distinct from 'preorder') as unlimited,
      coalesce(backlog.units, 0) as backlog_units,
      coalesce(incoming.units, 0) as incoming_units,
      greatest(coalesce(sales.sold_7, 0), 0) as s7,
      greatest(coalesce(sales.sold_30, 0), 0) as s30,
      greatest(coalesce(sales.sold_90, 0), 0) as s90,
      state.average_cost_cents as average_cost
    from public.products as product
    left join sales on sales.product_id = product.id
    left join backlog on backlog.product_id = product.id
    left join incoming on incoming.product_id = product.id
    left join public.inventory_cost_state as state on state.product_id = product.id
    where product.organization_id = p_organization_id
      and product.publication_status <> 'archived'
  ),
  weighted as (
    select rates.*,
      round((0.5 * rates.s7 / 7.0 + 0.3 * rates.s30 / 30.0 + 0.2 * rates.s90 / 90.0)::numeric, 3) as rate
    from rates
  )
  select
    weighted.id,
    weighted.sku,
    weighted.name,
    weighted.publication_status,
    weighted.price_cents,
    weighted.stock_quantity,
    weighted.unlimited,
    weighted.backlog_units,
    weighted.incoming_units,
    weighted.s7,
    weighted.s30,
    weighted.s90,
    weighted.rate,
    case when weighted.s30 > 0 then round(((weighted.s7 / 7.0) / (weighted.s30 / 30.0))::numeric, 2) end,
    case when weighted.unlimited or weighted.rate = 0 then null
      else round((greatest(weighted.stock_quantity, 0) / weighted.rate)::numeric, 1) end,
    case when weighted.unlimited or weighted.rate = 0 then null
      else (current_date + floor(greatest(weighted.stock_quantity, 0) / weighted.rate)::integer) end,
    case when weighted.unlimited then null else ceil(weighted.rate * p_lead_days)::integer end,
    case when weighted.unlimited then 0
      else greatest(ceil(weighted.rate * (p_lead_days + p_target_days))::integer + weighted.backlog_units
        - greatest(weighted.stock_quantity, 0) - weighted.incoming_units, 0) end,
    weighted.average_cost,
    case when weighted.unlimited or weighted.average_cost is null then null
      else greatest(ceil(weighted.rate * (p_lead_days + p_target_days))::integer + weighted.backlog_units
        - greatest(weighted.stock_quantity, 0) - weighted.incoming_units, 0)::bigint * weighted.average_cost end
  from weighted
  order by
    (case when weighted.unlimited or weighted.rate = 0 then null
      else greatest(weighted.stock_quantity, 0) / weighted.rate end) asc nulls last,
    weighted.s30 desc,
    weighted.name;
end;
$$;
revoke all on function public.get_inventory_forecast(bigint, integer, integer) from public, anon, authenticated;
grant execute on function public.get_inventory_forecast(bigint, integer, integer) to authenticated;
