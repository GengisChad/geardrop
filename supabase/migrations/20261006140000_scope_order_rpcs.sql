-- Orders, checkout pricing, Stripe intake and reporting act inside one company.
--
-- - Order lifecycle RPCs read the order's company and require the caller's role there. This
--   also closes the audit finding on record_order_refund and read_funnel_stats, which read the
--   staff role directly and ignored a disabled account.
-- - Cart pricing and order intake take the company from the cart lines: shipping methods,
--   promotions, coupons and first-purchase checks are looked up in that company only, and a
--   cart spanning two companies is invalid. Anonymous buyers can price only a public shop.
-- - Stripe intake records the order in the shop named by the webhook (default: the one public
--   shop) and reads its catalogue only.
-- - New order numbers carry the company prefix.
-- - The dashboard and the funnel report one company, named by the caller.
begin;

-- ---------------------------------------------------------------------------------------
-- Order lifecycle.
-- ---------------------------------------------------------------------------------------

create or replace function public.add_order_note(p_order_id bigint, p_note text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  note_id bigint;
  company bigint := private.organization_of_order(p_order_id);
begin
  perform private.require_org_role(company, array['owner'::public.staff_role, 'admin'::public.staff_role], 'GD_ORDER_MANAGER_REQUIRED');
  insert into public.order_notes (order_id, author_user_id, note)
  values (p_order_id, actor_id, trim(p_note)) returning id into note_id;
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, after_state)
  values (company, actor_id, 'order.note_added', 'orders', p_order_id::text, jsonb_build_object('note_id', note_id));
  return note_id;
end;
$$;

create or replace function public.cancel_order_and_restore_stock(p_order_id bigint, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  current_status public.order_status;
  paid_on_stripe boolean;
  item record;
  restock record;
  next_stock integer;
  company bigint := private.organization_of_order(p_order_id);
begin
  perform private.require_org_role(company, array['owner'::public.staff_role, 'admin'::public.staff_role], 'GD_ORDER_MANAGER_REQUIRED');

  select orders.status, orders.stripe_checkout_session_id is not null
  into current_status, paid_on_stripe
  from public.orders where orders.id = p_order_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_ORDER_NOT_FOUND';
  end if;
  if current_status not in ('pending', 'confirmed', 'processing') then
    raise exception using errcode = '22023', message = 'GD_ORDER_INVALID_TRANSITION';
  end if;

  perform 1 from public.products
  where id in (
    select order_items.product_id from public.order_items where order_items.order_id = p_order_id
    union
    select inventory_movements.product_id from public.inventory_movements where inventory_movements.order_id = p_order_id
  )
  order by id for update;

  perform set_config('geardrop.preorder_movement_managed', 'on', true);

  for item in
    select * from public.order_items
    where order_items.order_id = p_order_id
      and order_items.product_id is not null
      and (order_items.reservation_kind = 'preorder' or not paid_on_stripe)
    order by order_items.id
  loop
    if item.reservation_kind = 'preorder' then
      update public.products set preorder_allocation = preorder_allocation + item.quantity
      where id = item.product_id returning stock_quantity into next_stock;
    else
      update public.products set stock_quantity = stock_quantity + item.quantity
      where id = item.product_id returning stock_quantity into next_stock;
    end if;
    insert into public.inventory_movements (product_id, delta, stock_after, reason, order_id, actor_user_id, note)
    values (item.product_id, item.quantity, next_stock, 'order_cancelled', p_order_id, actor_id, 'Ripristino annullamento');
  end loop;

  if paid_on_stripe then
    for restock in
      select inventory_movements.product_id, (-sum(inventory_movements.delta))::integer as pieces
      from public.inventory_movements
      where inventory_movements.order_id = p_order_id
        and inventory_movements.reason = 'order_reserved'::public.inventory_reason
      group by inventory_movements.product_id
      having -sum(inventory_movements.delta) > 0
      order by inventory_movements.product_id
    loop
      update public.products set stock_quantity = stock_quantity + restock.pieces
      where id = restock.product_id returning stock_quantity into next_stock;
      insert into public.inventory_movements (product_id, delta, stock_after, reason, order_id, actor_user_id, note)
      values (restock.product_id, restock.pieces, next_stock, 'order_cancelled', p_order_id, actor_id, 'Ripristino annullamento');
    end loop;
  end if;

  perform set_config('geardrop.preorder_movement_managed', 'off', true);

  update public.orders set status = 'cancelled' where id = p_order_id;
  insert into public.order_status_events (order_id, from_status, to_status, actor_user_id, note)
  values (p_order_id, current_status, 'cancelled', actor_id, nullif(trim(p_note), ''));
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, after_state)
  values (company, actor_id, 'order.cancelled', 'orders', p_order_id::text, jsonb_build_object('stock_restored', true));
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
  company bigint := private.organization_of_order(p_order_id);
begin
  perform private.require_org_role(company, array['owner'::public.staff_role, 'admin'::public.staff_role], 'GD_ORDER_MANAGER_REQUIRED');
  update public.orders set shipping_notified_at = now()
  where id = p_order_id and status in ('shipped', 'completed');
  if not found then
    raise exception using errcode = '22023', message = 'GD_ORDER_INVALID_TRANSITION';
  end if;
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, after_state)
  values (company, actor_id, 'order.shipping_notified', 'orders', p_order_id::text, jsonb_build_object('notified', true));
end;
$$;

create or replace function public.prepare_order_refund(p_order_id bigint, p_amount_cents integer, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  order_total integer;
  payment public.payment_status;
  company bigint := private.organization_of_order(p_order_id);
begin
  perform private.require_org_role(company, array['owner'::public.staff_role, 'admin'::public.staff_role], 'GD_ORDER_MANAGER_REQUIRED');
  select total_cents, payment_status into order_total, payment from public.orders where id = p_order_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_ORDER_NOT_FOUND';
  end if;
  if payment not in ('authorized', 'paid') or p_amount_cents <= 0 or p_amount_cents > order_total
    or nullif(trim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'GD_ORDER_REFUND_INVALID';
  end if;
  update public.orders set refund_prepared_at = now(), refund_amount_cents = p_amount_cents, refund_reason = trim(p_reason)
  where id = p_order_id;
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, after_state)
  values (company, actor_id, 'order.refund_prepared', 'orders', p_order_id::text, jsonb_build_object('amount_cents', p_amount_cents));
end;
$$;

create or replace function public.record_order_refund(p_order_id bigint, p_amount_cents integer, p_reason text, p_stripe_refund_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  v_order public.orders%rowtype;
  fully_paid boolean;
  company bigint := private.organization_of_order(p_order_id);
begin
  -- Owner or admin of the order's company, with an active account.
  perform private.require_org_role(company, array['owner'::public.staff_role, 'admin'::public.staff_role], 'GD_ORDER_MANAGER_REQUIRED');

  select * into v_order from public.orders where id = p_order_id for update;
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
  set refund_prepared_at = coalesce(refund_prepared_at, now()),
      refunded_cents = refunded_cents + p_amount_cents,
      refund_reason = btrim(p_reason),
      stripe_refund_id = btrim(p_stripe_refund_id),
      payment_status = case when fully_paid then 'refunded'::public.payment_status else payment_status end,
      updated_at = now()
  where id = p_order_id;

  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, after_state)
  values (company, actor_id, 'order.refunded', 'orders', p_order_id::text,
    jsonb_build_object(
      'amount_cents', p_amount_cents,
      'refunded_cents', v_order.refunded_cents + p_amount_cents,
      'reason', btrim(p_reason),
      'stripe_refund_id', btrim(p_stripe_refund_id),
      'fully_refunded', fully_paid
    ));
end;
$$;

create or replace function public.set_order_tracking(p_order_id bigint, p_carrier text, p_code text, p_url text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  company bigint := private.organization_of_order(p_order_id);
begin
  perform private.require_org_role(company, array['owner'::public.staff_role, 'admin'::public.staff_role], 'GD_ORDER_MANAGER_REQUIRED');
  if nullif(trim(p_carrier), '') is null or nullif(trim(p_code), '') is null or (p_url is not null and p_url !~ '^https://') then
    raise exception using errcode = '22023', message = 'GD_ORDER_INVALID_TRACKING';
  end if;
  update public.orders set tracking_carrier = trim(p_carrier), tracking_code = trim(p_code), tracking_url = nullif(trim(p_url), '')
  where id = p_order_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_ORDER_NOT_FOUND';
  end if;
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, after_state)
  values (company, actor_id, 'order.tracking_set', 'orders', p_order_id::text,
    jsonb_build_object('carrier', trim(p_carrier), 'code', trim(p_code)));
end;
$$;

create or replace function public.ship_order(p_order_id bigint, p_carrier text, p_code text default null, p_url text default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  current_status public.order_status;
  company bigint := private.organization_of_order(p_order_id);
begin
  perform private.require_org_role(company, array['owner'::public.staff_role, 'admin'::public.staff_role], 'GD_ORDER_MANAGER_REQUIRED');

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
    insert into public.order_status_events (order_id, from_status, to_status, actor_user_id, note)
    values (p_order_id, current_status, 'shipped', actor_id, nullif(btrim(p_note), ''));
  end if;

  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, before_state, after_state)
  values (
    company, actor_id, 'order.shipped', 'orders', p_order_id::text,
    jsonb_build_object('status', current_status),
    jsonb_build_object('status', 'shipped', 'carrier', btrim(p_carrier), 'code', nullif(btrim(p_code), ''))
  );
end;
$$;

create or replace function public.transition_order_status(p_order_id bigint, p_to_status public.order_status, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  current_status public.order_status;
  company bigint := private.organization_of_order(p_order_id);
begin
  perform private.require_org_role(company, array['owner'::public.staff_role, 'admin'::public.staff_role], 'GD_ORDER_MANAGER_REQUIRED');
  select status into current_status from public.orders where id = p_order_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_ORDER_NOT_FOUND';
  end if;
  if not ((current_status = 'pending' and p_to_status = 'confirmed')
    or (current_status = 'confirmed' and p_to_status = 'processing')
    or (current_status = 'processing' and p_to_status = 'shipped')
    or (current_status = 'shipped' and p_to_status = 'completed')) then
    raise exception using errcode = '22023', message = 'GD_ORDER_INVALID_TRANSITION';
  end if;
  update public.orders set status = p_to_status,
    shipped_at = case when p_to_status = 'shipped' then now() else shipped_at end,
    delivered_at = case when p_to_status = 'completed' then now() else delivered_at end
  where id = p_order_id;
  insert into public.order_status_events (order_id, from_status, to_status, actor_user_id, note)
  values (p_order_id, current_status, p_to_status, actor_id, nullif(trim(p_note), ''));
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, before_state, after_state)
  values (company, actor_id, 'order.status_changed', 'orders', p_order_id::text,
    jsonb_build_object('status', current_status), jsonb_build_object('status', p_to_status));
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Cart pricing: the company is the one every line belongs to.
-- ---------------------------------------------------------------------------------------

create or replace function public.calculate_cart_pricing(
  p_lines jsonb,
  p_coupon_code text default null,
  p_customer_id uuid default null,
  p_shipping_code text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cart_subtotal bigint;
  cart_quantity bigint;
  shipping_amount bigint;
  promotion_discount bigint := 0;
  current_discount bigint;
  eligible_subtotal bigint;
  coupon_discount bigint := 0;
  applied_promotions jsonb := '[]'::jsonb;
  priced_lines jsonb;
  promotion_record public.promotions%rowtype;
  coupon_record public.coupons%rowtype;
  shipping_record public.shipping_methods%rowtype;
  companies bigint[];
  company bigint;
begin
  if p_customer_id is not null and p_customer_id is distinct from (select auth.uid()) then
    raise exception using errcode = '42501', message = 'GD_PRICING_CUSTOMER_MISMATCH';
  end if;
  if jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) < 1
    or jsonb_array_length(p_lines) > 100
    or exists (
      select 1 from jsonb_array_elements(p_lines) as line(value)
      where jsonb_typeof(line.value) <> 'object'
        or jsonb_typeof(line.value -> 'product_id') <> 'number'
        or jsonb_typeof(line.value -> 'quantity') <> 'number'
        or (line.value ->> 'product_id')::bigint <= 0
        or (line.value ->> 'quantity')::integer not between 1 and 100
    )
    or (
      select count(distinct (line.value ->> 'product_id')::bigint)
      from jsonb_array_elements(p_lines) as line(value)
    ) <> jsonb_array_length(p_lines) then
    raise exception using errcode = '22023', message = 'GD_PRICING_INVALID_LINES';
  end if;

  select array_agg(distinct product.organization_id) into companies
  from jsonb_array_elements(p_lines) as line(value)
  join public.products as product on product.id = (line.value ->> 'product_id')::bigint;
  if coalesce(cardinality(companies), 0) > 1 then
    raise exception using errcode = '22023', message = 'GD_PRICING_INVALID_LINES';
  end if;
  company := companies[1];

  -- A buyer prices a public shop; staff also price the companies they belong to.
  if company is not null and not private.is_storefront_organization(company) and private.org_role(company) is null then
    raise exception using errcode = 'P0001', message = 'GD_PRICING_PRODUCT_UNAVAILABLE';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_lines) as line(value)
    left join public.products as product on product.id = (line.value ->> 'product_id')::bigint
    where product.id is null or not product.is_purchasable
      or (line.value ->> 'quantity')::integer > case
        when product.availability_override = 'preorder'::public.availability_override then product.preorder_allocation
        else product.stock_quantity
      end
  ) then
    raise exception using errcode = 'P0001', message = 'GD_PRICING_PRODUCT_UNAVAILABLE';
  end if;

  select coalesce(sum(product.price_cents::bigint * (line.value ->> 'quantity')::integer), 0),
         coalesce(sum((line.value ->> 'quantity')::integer), 0),
         jsonb_agg(jsonb_build_object(
           'product_id', product.id,
           'quantity', (line.value ->> 'quantity')::integer,
           'unit_price_cents', product.price_cents,
           'line_subtotal_cents', product.price_cents::bigint * (line.value ->> 'quantity')::integer
         ) order by product.id)
  into cart_subtotal, cart_quantity, priced_lines
  from jsonb_array_elements(p_lines) as line(value)
  join public.products as product on product.id = (line.value ->> 'product_id')::bigint;
  if cart_subtotal > 2147483647 then
    raise exception using errcode = '22003', message = 'GD_PRICING_TOTAL_TOO_LARGE';
  end if;

  select method.* into shipping_record
  from public.shipping_methods as method
  where method.organization_id = company and method.code = lower(trim(p_shipping_code)) and method.active;
  if not found then
    raise exception using errcode = 'P0001', message = 'GD_PRICING_SHIPPING_INVALID';
  end if;
  shipping_amount := case
    when shipping_record.free_from_cents is not null and cart_subtotal >= shipping_record.free_from_cents then 0
    else shipping_record.price_cents
  end;

  for promotion_record in
    select promotion.* from public.promotions as promotion
    where promotion.organization_id = company
      and promotion.active
      and (promotion.starts_at is null or promotion.starts_at <= statement_timestamp())
      and (promotion.ends_at is null or promotion.ends_at > statement_timestamp())
      and cart_subtotal >= promotion.minimum_subtotal_cents
      and cart_quantity >= promotion.minimum_quantity
    order by promotion.priority desc, promotion.id
  loop
    select coalesce(sum(product.price_cents::bigint * (line.value ->> 'quantity')::integer), 0)
    into eligible_subtotal
    from jsonb_array_elements(p_lines) as line(value)
    join public.products as product on product.id = (line.value ->> 'product_id')::bigint
    where (
      not exists (select 1 from public.promotion_products where promotion_id = promotion_record.id)
      and not exists (select 1 from public.promotion_categories where promotion_id = promotion_record.id)
      and not exists (select 1 from public.promotion_bundles where promotion_id = promotion_record.id)
    ) or exists (
      select 1 from public.promotion_products where promotion_id = promotion_record.id and product_id = product.id
    ) or exists (
      select 1 from public.promotion_categories where promotion_id = promotion_record.id and category_id = product.category_id
    ) or exists (
      select 1 from public.promotion_bundles as target
      join public.bundle_items as included on included.bundle_id = target.bundle_id and included.product_id = product.id
      where target.promotion_id = promotion_record.id
        and not exists (
          select 1 from public.bundle_items as required
          where required.bundle_id = target.bundle_id
            and coalesce((select (cart.value ->> 'quantity')::integer from jsonb_array_elements(p_lines) as cart(value)
              where (cart.value ->> 'product_id')::bigint = required.product_id), 0) < required.quantity
        )
    );
    if eligible_subtotal <= 0 then continue; end if;
    current_discount := case promotion_record.discount_kind
      when 'percentage'::public.promotion_discount_kind then (eligible_subtotal * promotion_record.discount_value) / 100
      when 'fixed'::public.promotion_discount_kind then least(eligible_subtotal, promotion_record.discount_value::bigint)
      when 'promotional_price'::public.promotion_discount_kind then (
        select coalesce(sum(greatest(product.price_cents - promotion_record.discount_value, 0)::bigint * (line.value ->> 'quantity')::integer), 0)
        from jsonb_array_elements(p_lines) as line(value)
        join public.products as product on product.id = (line.value ->> 'product_id')::bigint
        where (
          not exists (select 1 from public.promotion_products where promotion_id = promotion_record.id)
          and not exists (select 1 from public.promotion_categories where promotion_id = promotion_record.id)
          and not exists (select 1 from public.promotion_bundles where promotion_id = promotion_record.id)
        ) or exists (select 1 from public.promotion_products where promotion_id = promotion_record.id and product_id = product.id)
           or exists (select 1 from public.promotion_categories where promotion_id = promotion_record.id and category_id = product.category_id)
      )
    end;
    if current_discount > 0 then
      if not promotion_record.stackable and jsonb_array_length(applied_promotions) > 0 then continue; end if;
      promotion_discount := least(cart_subtotal, promotion_discount + current_discount);
      applied_promotions := applied_promotions || jsonb_build_array(promotion_record.id);
      if not promotion_record.stackable then exit; end if;
    end if;
  end loop;

  if nullif(trim(p_coupon_code), '') is not null then
    select coupon.* into coupon_record
    from public.coupons as coupon
    where coupon.organization_id = company and lower(coupon.code) = lower(trim(p_coupon_code));
    if not found or not coupon_record.active or coupon_record.disabled_at is not null
      or (coupon_record.starts_at is not null and coupon_record.starts_at > statement_timestamp())
      or (coupon_record.expires_at is not null and coupon_record.expires_at <= statement_timestamp())
      or (coupon_record.usage_limit is not null and coupon_record.used_count >= coupon_record.usage_limit)
      or cart_subtotal < coupon_record.minimum_subtotal_cents then
      raise exception using errcode = 'P0001', message = 'GD_PRICING_COUPON_INVALID';
    end if;
    if coupon_record.per_customer_limit is not null and (
      p_customer_id is null
      or (select count(*) from public.coupon_redemptions where coupon_id = coupon_record.id and customer_id = p_customer_id) >= coupon_record.per_customer_limit
    ) then
      raise exception using errcode = 'P0001', message = 'GD_PRICING_COUPON_INVALID';
    end if;
    if coupon_record.first_purchase_only and (
      p_customer_id is null or exists (
        select 1 from public.orders
        where organization_id = company and customer_id = p_customer_id and status <> 'cancelled'::public.order_status
      )
    ) then
      raise exception using errcode = 'P0001', message = 'GD_PRICING_COUPON_INVALID';
    end if;
    select coalesce(sum(product.price_cents::bigint * (line.value ->> 'quantity')::integer), 0)
    into eligible_subtotal
    from jsonb_array_elements(p_lines) as line(value)
    join public.products as product on product.id = (line.value ->> 'product_id')::bigint
    where (
      not exists (select 1 from public.coupon_products where coupon_id = coupon_record.id)
      and not exists (select 1 from public.coupon_categories where coupon_id = coupon_record.id)
      and not exists (select 1 from public.coupon_bundles where coupon_id = coupon_record.id)
    ) or exists (select 1 from public.coupon_products where coupon_id = coupon_record.id and product_id = product.id)
      or exists (select 1 from public.coupon_categories where coupon_id = coupon_record.id and category_id = product.category_id)
      or exists (
        select 1 from public.coupon_bundles as target
        join public.bundle_items as included on included.bundle_id = target.bundle_id and included.product_id = product.id
        where target.coupon_id = coupon_record.id
          and not exists (
            select 1 from public.bundle_items as required where required.bundle_id = target.bundle_id
              and coalesce((select (cart.value ->> 'quantity')::integer from jsonb_array_elements(p_lines) as cart(value)
                where (cart.value ->> 'product_id')::bigint = required.product_id), 0) < required.quantity
          )
      );
    if eligible_subtotal <= 0 then
      raise exception using errcode = 'P0001', message = 'GD_PRICING_COUPON_INVALID';
    end if;
    coupon_discount := case coupon_record.discount_kind
      when 'percentage'::public.discount_kind then (eligible_subtotal * coupon_record.discount_value) / 100
      when 'fixed'::public.discount_kind then least(eligible_subtotal, coupon_record.discount_value::bigint)
    end;
    if coupon_record.maximum_discount_cents is not null then
      coupon_discount := least(coupon_discount, coupon_record.maximum_discount_cents);
    end if;
    coupon_discount := least(greatest(cart_subtotal - promotion_discount, 0), coupon_discount);
    if coupon_record.free_shipping then shipping_amount := 0; end if;
  end if;

  return jsonb_build_object(
    'currency', 'EUR',
    'lines', priced_lines,
    'subtotal_cents', cart_subtotal,
    'promotion_discount_cents', promotion_discount,
    'coupon_discount_cents', coupon_discount,
    'discount_cents', promotion_discount + coupon_discount,
    'shipping_cents', shipping_amount,
    'total_cents', greatest(cart_subtotal - promotion_discount - coupon_discount, 0) + shipping_amount,
    'applied_promotion_ids', applied_promotions,
    'coupon_id', case when coupon_record.id is null then null else to_jsonb(coupon_record.id) end,
    'coupon_code', case when coupon_record.id is null then null else to_jsonb(upper(coupon_record.code)) end
  );
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'GD_PRICING_INVALID_LINES';
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Order intake.
-- ---------------------------------------------------------------------------------------

drop function private.create_order_unchecked(text, text, jsonb, jsonb, jsonb, text, text, uuid);
create function private.create_order_unchecked(
  p_organization_id bigint,
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
  number_prefix text;
begin
  if normalized_email is null
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_idempotency_key is null
    or jsonb_typeof(p_shipping_address) is distinct from 'object'
    or jsonb_typeof(p_billing_address) is distinct from 'object'
    or jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'GD_ORDER_INVALID_PAYLOAD';
  end if;
  select order_number_prefix into number_prefix from public.organizations where id = p_organization_id;
  if number_prefix is null then
    raise exception using errcode = '22023', message = 'GD_ORDER_INVALID_PAYLOAD';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select orders.id into existing_order_id from public.orders
  where idempotency_key = p_idempotency_key and (
    (actor_id is not null and customer_id = actor_id)
    or (actor_id is null and customer_id is null and lower(email) = normalized_email)
  );
  if found then return existing_order_id; end if;
  perform 1 from public.products
  where id in (select (line.value ->> 'product_id')::bigint from jsonb_array_elements(p_lines) as line(value))
  order by id for update;
  if nullif(trim(p_coupon_code), '') is not null then
    perform 1 from public.coupons
    where organization_id = p_organization_id and lower(code) = lower(trim(p_coupon_code)) for update;
  end if;
  pricing := public.calculate_cart_pricing(p_lines, p_coupon_code, actor_id, p_shipping_code);
  applied_coupon_id := nullif(pricing ->> 'coupon_id', '')::bigint;
  insert into public.orders (
    organization_id, order_number, customer_id, email, phone, status, payment_status, currency,
    subtotal_cents, discount_cents, shipping_cents, total_cents, shipping_method_code, coupon_code,
    shipping_address_snapshot, billing_address_snapshot, idempotency_key
  ) values (
    p_organization_id, 'PENDING-' || p_idempotency_key::text, actor_id, normalized_email, nullif(trim(p_phone), ''),
    'pending', 'pending', 'EUR',
    (pricing ->> 'subtotal_cents')::integer, (pricing ->> 'discount_cents')::integer,
    (pricing ->> 'shipping_cents')::integer, (pricing ->> 'total_cents')::integer,
    lower(trim(p_shipping_code)), pricing ->> 'coupon_code', p_shipping_address, p_billing_address, p_idempotency_key
  ) returning id into target_order_id;
  update public.orders set order_number = number_prefix || '-' || lpad(target_order_id::text, 8, '0') where id = target_order_id;
  for line_record in
    select product.*, (line.value ->> 'quantity')::integer as requested_quantity
    from jsonb_array_elements(p_lines) as line(value)
    join public.products as product on product.id = (line.value ->> 'product_id')::bigint
    order by product.id
  loop
    insert into public.order_items (
      order_id, product_id, quantity, unit_price_cents, line_total_cents, product_name_snapshot, sku_snapshot,
      image_src_snapshot, reservation_kind
    ) values (
      target_order_id, line_record.id, line_record.requested_quantity, line_record.price_cents,
      line_record.price_cents * line_record.requested_quantity, line_record.name, line_record.sku,
      coalesce((select image.src from public.product_images as image
        where image.product_id = line_record.id and image.published
        order by image.is_primary desc, image.sort_order, image.id limit 1), ''),
      case when line_record.availability_override = 'preorder'::public.availability_override then 'preorder' else 'stock' end
    );
    if line_record.availability_override = 'preorder'::public.availability_override then
      update public.products set preorder_allocation = preorder_allocation - line_record.requested_quantity
      where id = line_record.id returning stock_quantity into next_stock;
    else
      update public.products set stock_quantity = stock_quantity - line_record.requested_quantity
      where id = line_record.id returning stock_quantity into next_stock;
    end if;
    insert into public.inventory_movements (product_id, delta, stock_after, reason, order_id, actor_user_id, note)
    values (line_record.id, -line_record.requested_quantity, next_stock, 'order_reserved', target_order_id, actor_id, 'Riserva ordine');
  end loop;
  if applied_coupon_id is not null then
    insert into public.coupon_redemptions (coupon_id, order_id, customer_id, email_normalized, discount_cents)
    values (applied_coupon_id, target_order_id, actor_id, normalized_email, (pricing ->> 'coupon_discount_cents')::integer);
    update public.coupons set used_count = used_count + 1 where id = applied_coupon_id;
  end if;
  insert into public.order_status_events (order_id, from_status, to_status, actor_user_id, note)
  values (target_order_id, null, 'pending', actor_id, 'Ordine creato');
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, after_state)
  values (p_organization_id, actor_id, 'order.created', 'orders', target_order_id::text,
    jsonb_build_object('total_cents', pricing -> 'total_cents'));
  return target_order_id;
end;
$$;
revoke all on function private.create_order_unchecked(bigint, text, text, jsonb, jsonb, jsonb, text, text, uuid) from public;

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
  order_id bigint;
  maximum_quantity integer;
  intake_enabled boolean;
  shops bigint[];
  shop bigint;
begin
  -- The company is the one every known cart line belongs to. A malformed cart names no product:
  -- it is judged in the one public shop, so the checks below answer exactly as they always did.
  if jsonb_typeof(p_lines) = 'array' then
    select array_agg(distinct product.organization_id)
    into shops
    from jsonb_array_elements(p_lines) as line(value)
    join public.products as product
      on jsonb_typeof(line.value) = 'object'
     and jsonb_typeof(line.value -> 'product_id') = 'number'
     and (line.value ->> 'product_id') ~ '^[0-9]{1,18}$'
     and product.id = (line.value ->> 'product_id')::bigint;
  end if;
  if coalesce(cardinality(shops), 0) > 1 then
    raise exception using errcode = '22023', message = 'GD_ORDER_INVALID_PAYLOAD';
  end if;
  shop := coalesce(shops[1], private.single_storefront_organization());
  if not private.is_storefront_organization(shop) then
    raise exception using errcode = '22023', message = 'GD_ORDER_INVALID_PAYLOAD';
  end if;

  -- `for share` holds the company's settings row for the life of the transaction, so a
  -- concurrent "disable orders" cannot commit between this check and the insert.
  select accept_orders, max_quantity_per_line into intake_enabled, maximum_quantity
  from public.site_settings where organization_id = shop for share;
  if not found or not intake_enabled then
    raise exception using errcode = '55000', message = 'GD_ORDER_INTAKE_DISABLED';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) < 1 then
    raise exception using errcode = '22023', message = 'GD_ORDER_INVALID_PAYLOAD';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) as line(value)
    where jsonb_typeof(line.value) is distinct from 'object'
      or jsonb_typeof(line.value -> 'product_id') is distinct from 'number'
      or jsonb_typeof(line.value -> 'quantity') is distinct from 'number'
  ) then
    raise exception using errcode = '22023', message = 'GD_ORDER_INVALID_PAYLOAD';
  end if;
  -- JSON numbers are arbitrary precision, so "quantity": 1.5 parses as a number and would
  -- otherwise reach an ::integer cast and raise 22P02 from somewhere unhelpful.
  if exists (
    select 1 from jsonb_array_elements(p_lines) as line(value)
    where (line.value ->> 'product_id')::numeric < 1
      or (line.value ->> 'product_id')::numeric <> pg_catalog.trunc((line.value ->> 'product_id')::numeric)
  ) then
    raise exception using errcode = '22023', message = 'GD_ORDER_INVALID_PAYLOAD';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) as line(value)
    where (line.value ->> 'quantity')::numeric < 1
      or (line.value ->> 'quantity')::numeric <> pg_catalog.trunc((line.value ->> 'quantity')::numeric)
  ) then
    raise exception using errcode = '22023', message = 'GD_ORDER_INVALID_QUANTITY';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) as line(value)
    where (line.value ->> 'quantity')::numeric > maximum_quantity
  ) then
    raise exception using errcode = '22023', message = 'GD_ORDER_QUANTITY_LIMIT';
  end if;
  -- The private implementation reloads every price from the catalogue and reads the
  -- buyer from auth.uid(); nothing the caller sends can influence either.
  order_id := private.create_order_unchecked(
    shop, p_email, p_phone, p_shipping_address, p_billing_address, p_lines,
    p_coupon_code, p_shipping_code, p_idempotency_key
  );
  return order_id;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Stripe intake, in the shop the webhook serves.
-- ---------------------------------------------------------------------------------------

drop function public.record_stripe_checkout_order(text, text, text, text, text, jsonb, jsonb, integer, text, integer, text);
create function public.record_stripe_checkout_order(
  p_session_id text,
  p_payment_intent_id text,
  p_order_number text,
  p_email text,
  p_phone text,
  p_shipping_address jsonb,
  p_lines jsonb,
  p_shipping_cents integer,
  p_notes text,
  p_discount_cents integer default 0,
  p_coupon_code text default null,
  p_organization_id bigint default null
)
returns table (order_id bigint, order_number text, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  shop bigint := coalesce(p_organization_id, private.single_storefront_organization());
  existing_id bigint;
  existing_number text;
  new_order_id bigint;
  number_candidate text;
  suffix integer := 1;
  line record;
  part record;
  target public.products%rowtype;
  subtotal integer;
  discount_clamped integer;
  on_hand integer;
  taken integer;
  short integer;
  kind text;
  backorder boolean;
  ready_sets integer;
  image_src text;
  oversold text[] := array[]::text[];
begin
  if not private.is_storefront_organization(shop) then
    raise exception using errcode = '22023', message = 'GD_STRIPE_ORDER_INVALID_PAYLOAD';
  end if;
  if p_session_id is null or p_session_id !~ '^cs_(live|test)_[A-Za-z0-9]{10,200}$'
    or p_order_number is null or btrim(p_order_number) = ''
    or p_email is null or btrim(p_email) = ''
    or jsonb_typeof(p_shipping_address) is distinct from 'object'
    or p_shipping_cents is null or p_shipping_cents < 0
    or p_discount_cents is null or p_discount_cents < 0
    or jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) < 1 then
    raise exception using errcode = '22023', message = 'GD_STRIPE_ORDER_INVALID_PAYLOAD';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) as item(value)
    where jsonb_typeof(item.value) is distinct from 'object'
      or jsonb_typeof(item.value -> 'slug') is distinct from 'string'
      or jsonb_typeof(item.value -> 'name') is distinct from 'string'
      or jsonb_typeof(item.value -> 'quantity') is distinct from 'number'
      or jsonb_typeof(item.value -> 'unit_price_cents') is distinct from 'number'
      or (item.value ->> 'quantity')::numeric < 1
      or (item.value ->> 'quantity')::numeric <> pg_catalog.trunc((item.value ->> 'quantity')::numeric)
      or (item.value ->> 'unit_price_cents')::numeric < 0
      or (item.value ->> 'unit_price_cents')::numeric <> pg_catalog.trunc((item.value ->> 'unit_price_cents')::numeric)
  ) then
    raise exception using errcode = '22023', message = 'GD_STRIPE_ORDER_INVALID_PAYLOAD';
  end if;
  -- A bundle line names the catalogue products one unit ships: at least one, each with a
  -- whole quantity of one or more.
  if exists (
    select 1
    from jsonb_array_elements(p_lines) as item(value)
    where item.value ? 'components'
      and (
        jsonb_typeof(item.value -> 'components') is distinct from 'array'
        or jsonb_array_length(item.value -> 'components') < 1
        or exists (
          select 1
          from jsonb_array_elements(item.value -> 'components') as component(value)
          where jsonb_typeof(component.value) is distinct from 'object'
            or jsonb_typeof(component.value -> 'slug') is distinct from 'string'
            or jsonb_typeof(component.value -> 'quantity') is distinct from 'number'
            or (component.value ->> 'quantity')::numeric < 1
            or (component.value ->> 'quantity')::numeric <> pg_catalog.trunc((component.value ->> 'quantity')::numeric)
        )
      )
  ) then
    raise exception using errcode = '22023', message = 'GD_STRIPE_ORDER_INVALID_PAYLOAD';
  end if;
  -- Stripe retries a webhook until it is acknowledged and may deliver it twice at once: the
  -- lock serialises deliveries of one session and the lookup makes every repeat a no-op.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('stripe-checkout:' || p_session_id));
  select orders.id, orders.order_number into existing_id, existing_number
  from public.orders where orders.stripe_checkout_session_id = p_session_id;
  if found then
    return query select existing_id, existing_number, false;
    return;
  end if;
  select coalesce(sum((item.value ->> 'quantity')::integer * (item.value ->> 'unit_price_cents')::integer), 0)
  into subtotal from jsonb_array_elements(p_lines) as item(value);
  -- Clamp discount to subtotal so the total_cents check never fires.
  discount_clamped := least(greatest(p_discount_cents, 0), subtotal);
  -- The reference comes from the checkout attempt; a buyer who pays twice from one cart gets
  -- a suffixed number instead of a failed webhook.
  number_candidate := btrim(p_order_number);
  while exists (select 1 from public.orders where orders.order_number = number_candidate) loop
    suffix := suffix + 1;
    number_candidate := btrim(p_order_number) || '-' || suffix;
  end loop;
  insert into public.orders (
    organization_id, order_number, email, phone, status, payment_status, subtotal_cents, discount_cents,
    shipping_cents, total_cents, shipping_method_code, shipping_address_snapshot,
    billing_address_snapshot, coupon_code, notes, idempotency_key,
    stripe_checkout_session_id, stripe_payment_intent_id
  )
  values (
    shop, number_candidate, lower(btrim(p_email)), nullif(btrim(p_phone), ''),
    'confirmed'::public.order_status, 'paid'::public.payment_status, subtotal, discount_clamped,
    p_shipping_cents, subtotal - discount_clamped + p_shipping_cents, 'standard', p_shipping_address,
    p_shipping_address, nullif(btrim(coalesce(p_coupon_code, '')), ''),
    nullif(btrim(p_notes), ''), md5(p_session_id)::uuid, p_session_id,
    nullif(btrim(p_payment_intent_id), '')
  )
  returning id into new_order_id;
  -- Lines take the shelf in the order the buyer saw them in the cart, so the pieces the site
  -- announced as pre-ordered are the ones recorded as such.
  for line in
    select item.value ->> 'slug' as slug,
           item.value ->> 'name' as name,
           (item.value ->> 'quantity')::integer as quantity,
           (item.value ->> 'unit_price_cents')::integer as unit_price_cents,
           item.value -> 'components' as components
    from jsonb_array_elements(p_lines) with ordinality as item(value, position)
    order by item.position
  loop
    if line.components is not null then
      -- A bundle is one order line, as the buyer paid for it, and takes its packs' stock. It
      -- ships now as many complete sets as the shelf holds; the other sets are pre-ordered.
      -- Order lines cannot change once written, so the line is stored after its packs.
      ready_sets := line.quantity;
      for part in
        select component.value ->> 'slug' as slug,
               (component.value ->> 'quantity')::integer as per_set,
               (component.value ->> 'quantity')::integer * line.quantity as pieces
        from jsonb_array_elements(line.components) with ordinality as component(value, position)
        order by component.position
      loop
        select products.* into target from public.products
        where products.organization_id = shop and products.slug = part.slug for update;
        if not found then
          oversold := oversold || (line.name || ': ' || part.slug || ' non è nel catalogo, stock non scalato');
          continue;
        end if;
        kind := case when target.availability_override = 'preorder'::public.availability_override then 'preorder' else 'stock' end;
        on_hand := case when kind = 'preorder' then target.preorder_allocation else target.stock_quantity end;
        taken := least(on_hand, part.pieces);
        short := part.pieces - taken;
        backorder := kind = 'stock' and target.allow_backorder and target.availability_override is null;
        if taken > 0 then
          if kind = 'preorder' then
            update public.products set preorder_allocation = on_hand - taken where id = target.id;
          else
            update public.products set stock_quantity = on_hand - taken where id = target.id;
            insert into public.inventory_movements (product_id, delta, stock_after, reason, order_id, note)
            values (target.id, -taken, on_hand - taken, 'order_reserved'::public.inventory_reason, new_order_id,
              'Venduto nel ' || line.name || ' · ordine ' || number_candidate);
          end if;
        end if;
        -- Only a pack that sells as a pre-order holds sets back as pre-ordered; any other pack
        -- short of pieces is an oversell for the owner to sort out, not a pre-order promise.
        if kind = 'preorder' then
          ready_sets := 0;
        elsif short > 0 and backorder then
          ready_sets := least(ready_sets, taken / part.per_set);
        elsif short > 0 then
          oversold := oversold || (target.name || ' (nel ' || line.name || '): pagati ' || part.pieces || ', disponibili ' || on_hand);
        end if;
      end loop;
      insert into public.order_items (
        order_id, product_id, quantity, unit_price_cents, line_total_cents,
        product_name_snapshot, sku_snapshot, image_src_snapshot, preorder_quantity
      )
      values (
        new_order_id, null, line.quantity, line.unit_price_cents,
        line.quantity * line.unit_price_cents, line.name, upper(line.slug), '/products/' || line.slug || '.webp',
        line.quantity - ready_sets
      );
      continue;
    end if;
    select products.* into target from public.products
    where products.organization_id = shop and products.slug = line.slug for update;
    if not found then
      -- Paid for, but no longer in the catalogue: keep the line exactly as Stripe charged it.
      insert into public.order_items (
        order_id, product_id, quantity, unit_price_cents, line_total_cents,
        product_name_snapshot, sku_snapshot, image_src_snapshot
      )
      values (
        new_order_id, null, line.quantity, line.unit_price_cents,
        line.quantity * line.unit_price_cents, line.name, upper(line.slug), ''
      );
      continue;
    end if;
    select images.src into image_src
    from public.product_images as images
    where images.product_id = target.id
    order by images.is_primary desc, images.sort_order, images.id
    limit 1;
    kind := case when target.availability_override = 'preorder'::public.availability_override then 'preorder' else 'stock' end;
    on_hand := case when kind = 'preorder' then target.preorder_allocation else target.stock_quantity end;
    taken := least(on_hand, line.quantity);
    short := line.quantity - taken;
    backorder := kind = 'stock' and target.allow_backorder and target.availability_override is null;
    insert into public.order_items (
      order_id, product_id, quantity, unit_price_cents, line_total_cents,
      product_name_snapshot, sku_snapshot, image_src_snapshot, reservation_kind, preorder_quantity
    )
    values (
      new_order_id, target.id, line.quantity, line.unit_price_cents,
      line.quantity * line.unit_price_cents, target.name, target.sku, coalesce(image_src, ''), kind,
      case when kind = 'preorder' then line.quantity when backorder then short else 0 end
    );
    if taken > 0 then
      if kind = 'preorder' then
        update public.products set preorder_allocation = on_hand - taken where id = target.id;
      else
        update public.products set stock_quantity = on_hand - taken where id = target.id;
        insert into public.inventory_movements (product_id, delta, stock_after, reason, order_id, note)
        values (target.id, -taken, on_hand - taken, 'order_reserved'::public.inventory_reason, new_order_id,
          'Venduto su Stripe · ordine ' || number_candidate);
      end if;
    end if;
    -- A payment is never refused after the fact. Pieces beyond the shelf of a product that sells
    -- as a pre-order are pre-ordered; for any other product the order is kept and flagged so the
    -- owner can sort it out with the customer.
    if short > 0 and not backorder then
      oversold := oversold || (target.name || ': pagati ' || line.quantity || ', disponibili ' || on_hand);
    end if;
  end loop;
  insert into public.order_status_events (order_id, from_status, to_status, note)
  values (new_order_id, null, 'confirmed'::public.order_status, 'Pagamento ricevuto su Stripe');
  if cardinality(oversold) > 0 then
    insert into public.order_notes (order_id, note)
    values (new_order_id, 'Attenzione, pezzi venduti oltre la disponibilità. ' || array_to_string(oversold, '; '));
  end if;
  -- Two waits, two notes: a piece bought beyond the shelf may take 10/15 working days, while an
  -- unreleased drop (availability_override = 'preorder') only lands with the Hasbro release.
  insert into public.order_notes (order_id, note)
  select
    new_order_id,
    case when pre.unreleased then 'Pre-ordine nuova uscita: ' else 'Pre-ordine: ' end
      || string_agg(pre.piece, ', ' order by pre.id)
      || case when pre.unreleased
              then '. Non ancora distribuita: arriva con l''uscita Hasbro, circa 20 giorni lavorativi.'
              else '. Non erano a magazzino: potrebbero arrivare tra 10/15 giorni lavorativi.'
         end
  from (
    select
      order_items.id,
      order_items.preorder_quantity || ' × ' || order_items.product_name_snapshot as piece,
      coalesce(product.availability_override = 'preorder'::public.availability_override, false) as unreleased
    from public.order_items
    left join public.products as product on product.id = order_items.product_id
    where order_items.order_id = new_order_id and order_items.preorder_quantity > 0
  ) as pre
  group by pre.unreleased;
  insert into public.audit_events (organization_id, action, entity_type, entity_id, after_state)
  values (
    shop, 'order.paid_on_stripe', 'orders', new_order_id::text,
    jsonb_build_object(
      'order_number', number_candidate,
      'stripe_checkout_session_id', p_session_id,
      'subtotal_cents', subtotal,
      'discount_cents', discount_clamped,
      'coupon_code', nullif(btrim(coalesce(p_coupon_code, '')), ''),
      'total_cents', subtotal - discount_clamped + p_shipping_cents,
      'oversold', to_jsonb(oversold),
      'preordered', (
        select coalesce(sum(order_items.preorder_quantity), 0)
        from public.order_items where order_items.order_id = new_order_id
      )
    )
  );
  return query select new_order_id, number_candidate, true;
end;
$$;
revoke all on function public.record_stripe_checkout_order(text, text, text, text, text, jsonb, jsonb, integer, text, integer, text, bigint) from public, anon, authenticated;
grant execute on function public.record_stripe_checkout_order(text, text, text, text, text, jsonb, jsonb, integer, text, integer, text, bigint) to service_role;

-- ---------------------------------------------------------------------------------------
-- Reporting: one company, named by the caller.
-- ---------------------------------------------------------------------------------------

drop function public.get_admin_dashboard_metrics();
create function public.get_admin_dashboard_metrics(p_organization_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_role public.staff_role := private.org_role(p_organization_id);
  manager boolean;
  products jsonb;
  commerce jsonb;
  movements jsonb;
  activity jsonb;
  coupon_count integer;
  promotion_count integer;
begin
  if actor_role is null then
    raise exception using errcode = '42501', message = 'GD_DASHBOARD_STAFF_REQUIRED';
  end if;
  manager := actor_role in ('owner', 'admin');
  select jsonb_build_object(
    'total', count(*),
    'published', count(*) filter (where publication_status = 'published'),
    'draft', count(*) filter (where publication_status = 'draft'),
    'archived', count(*) filter (where publication_status = 'archived'),
    'sold_out', count(*) filter (where manage_stock and stock_status = 'esaurito' and publication_status <> 'archived'),
    'low_stock', count(*) filter (where manage_stock and stock_quantity > 0 and stock_quantity <= low_stock_threshold and publication_status <> 'archived'),
    'preorder', count(*) filter (where availability_override = 'preorder')
  ) into products
  from public.products where organization_id = p_organization_id;
  select count(*) into coupon_count from public.coupons
  where organization_id = p_organization_id and active and disabled_at is null
    and (starts_at is null or starts_at <= now()) and (expires_at is null or expires_at > now());
  select count(*) into promotion_count from public.promotions
  where organization_id = p_organization_id and active
    and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now());
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', movement.id, 'delta', movement.delta, 'stock_after', movement.stock_after, 'reason', movement.reason,
      'note', movement.note, 'created_at', movement.created_at, 'product_name', product.name, 'sku', product.sku
    ) order by movement.created_at desc, movement.id desc), '[]'::jsonb)
  into movements
  from (
    select * from public.inventory_movements where organization_id = p_organization_id
    order by created_at desc, id desc limit 8
  ) movement
  join public.products product on product.id = movement.product_id;
  if manager then
    select jsonb_build_object(
      'order_count', count(*),
      'revenue_cents', coalesce(sum(total_cents) filter (where payment_status = 'paid'), 0),
      'average_order_value_cents', coalesce(round(avg(total_cents) filter (where payment_status = 'paid')), 0),
      'latest_orders', (
        select coalesce(jsonb_agg(jsonb_build_object(
            'id', recent.id, 'order_number', recent.order_number, 'status', recent.status,
            'payment_status', recent.payment_status, 'total_cents', recent.total_cents, 'created_at', recent.created_at
          ) order by recent.created_at desc, recent.id desc), '[]'::jsonb)
        from (
          select id, order_number, status, payment_status, total_cents, created_at
          from public.orders where organization_id = p_organization_id
          order by created_at desc, id desc limit 5
        ) recent
      )
    ) into commerce
    from public.orders where organization_id = p_organization_id;
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', event.id, 'action', event.action, 'entity_type', event.entity_type, 'entity_id', event.entity_id,
        'created_at', event.created_at, 'actor_name', coalesce(profile.display_name, 'Sistema')
      ) order by event.created_at desc, event.id desc), '[]'::jsonb)
    into activity
    from (
      select * from public.audit_events where organization_id = p_organization_id
      order by created_at desc, id desc limit 8
    ) event
    left join public.staff_profiles profile on profile.user_id = event.actor_user_id;
  else
    commerce := null;
    activity := null;
  end if;
  return jsonb_build_object(
    'products', products, 'active_coupons', coupon_count, 'active_promotions', promotion_count,
    'commerce', commerce, 'stock_movements', movements, 'staff_activity', activity
  );
end;
$$;
revoke all on function public.get_admin_dashboard_metrics(bigint) from public, anon, authenticated;
grant execute on function public.get_admin_dashboard_metrics(bigint) to authenticated;

drop function public.read_funnel_stats(integer);
create function public.read_funnel_stats(p_organization_id bigint, p_days integer default 30)
returns table (day date, event text, count integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Owner or admin of the company, with an active account.
  perform private.require_org_role(p_organization_id, array['owner'::public.staff_role, 'admin'::public.staff_role], 'GD_ORDER_MANAGER_REQUIRED');
  if p_organization_id is null then
    raise exception using errcode = '22023', message = 'GD_ORGANIZATION_REQUIRED';
  end if;
  return query
    select e.day, e.event, e.count
    from public.storefront_daily_events as e
    where e.organization_id = p_organization_id
      and e.day >= (now() at time zone 'Europe/Rome')::date - (p_days - 1)
    order by e.day desc, e.event;
end;
$$;
revoke all on function public.read_funnel_stats(bigint, integer) from public, anon, authenticated;
grant execute on function public.read_funnel_stats(bigint, integer) to authenticated;

commit;
