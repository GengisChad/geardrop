-- GEAR//DROP transactional order creation (design §8.2).
--
-- public.create_order(payload jsonb) is the only way an order is created. It is
-- SECURITY DEFINER with an empty search_path; execute is revoked from PUBLIC/anon and
-- granted to `authenticated` (RLS-bound checkout) and `service_role` (server-only guest
-- checkout). A browser publishable-key guest cannot call it directly.
--
-- The whole body runs in one transaction. Any failure rolls back product stock, coupon
-- counts, the order, its items and inventory movements together. No network calls.
--
-- Domain failures are raised with a stable `GD_*` message the Server Action maps to a
-- safe Italian string. No SQL, table name, coupon limit or other customer's data leaks.
--
-- Payload shape:
--   {
--     "idempotency_key": "<uuid>",
--     "items": [ { "sku": "<sku>" | "slug": "<slug>", "quantity": <int> }, ... ],
--     "contact": { "email": "<email>", "phone": "<phone|null>" },
--     "shipping_address": { ...jsonb snapshot... },
--     "billing_address": { ...jsonb|null... },
--     "shipping_method": "<shipping_methods.code>",
--     "coupon_code": "<code|null>",
--     "notes": "<text|null>"
--   }
--
-- The customer is derived from auth.uid(); a service-role guest call has a null uid and
-- always produces customer_id = null. Client-supplied prices/names/totals are ignored.

create or replace function public.create_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_idem            uuid;
  v_customer        uuid := auth.uid();
  v_email           text;
  v_phone           text;
  v_shipping_code   text;
  v_coupon_code     text;
  v_notes           text;
  v_shipping_addr   jsonb;
  v_billing_addr    jsonb;
  v_max_per_line    integer;
  v_checkout_open   boolean;
  v_cart_count      integer;
  v_line_count      integer;
  v_subtotal        integer;
  v_discount        integer := 0;
  v_shipping        integer := 0;
  v_total           integer;
  v_ship_price      integer;
  v_ship_threshold  integer;
  v_ship_label      text;
  v_coupon          public.coupons%rowtype;
  v_order_id        bigint;
  v_order_number    text;
  v_existing        public.orders%rowtype;
  v_bad_qty         boolean;
begin
  ---------------------------------------------------------------------------
  -- 0. Parse + shape validation
  ---------------------------------------------------------------------------
  begin
    v_idem := (payload->>'idempotency_key')::uuid;
  exception when others then
    raise exception 'GD_INVALID_REQUEST' using errcode = 'P0001';
  end;
  if v_idem is null then
    raise exception 'GD_INVALID_REQUEST' using errcode = 'P0001';
  end if;

  v_email         := lower(trim(coalesce(payload->'contact'->>'email', '')));
  v_phone         := nullif(trim(coalesce(payload->'contact'->>'phone', '')), '');
  v_shipping_code := trim(coalesce(payload->>'shipping_method', ''));
  v_coupon_code   := nullif(upper(trim(coalesce(payload->>'coupon_code', ''))), '');
  v_notes         := nullif(trim(coalesce(payload->>'notes', '')), '');
  v_shipping_addr := payload->'shipping_address';
  v_billing_addr  := payload->'billing_address';

  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'GD_INVALID_CONTACT' using errcode = 'P0001';
  end if;
  if v_shipping_addr is null or jsonb_typeof(v_shipping_addr) <> 'object' then
    raise exception 'GD_INVALID_ADDRESS' using errcode = 'P0001';
  end if;

  ---------------------------------------------------------------------------
  -- 1. Idempotent retry: same key returns the original order untouched.
  ---------------------------------------------------------------------------
  select * into v_existing from public.orders where idempotency_key = v_idem;
  if found then
    if (v_customer is not null and v_existing.customer_id is distinct from v_customer)
       or (v_customer is null and lower(v_existing.customer_email) is distinct from v_email) then
      raise exception 'GD_INVALID_REQUEST' using errcode = 'P0001';
    end if;
    return public.order_summary(v_existing.id);
  end if;

  ---------------------------------------------------------------------------
  -- 2. Store gate + per-line limit
  ---------------------------------------------------------------------------
  select checkout_enabled, max_quantity_per_line
    into v_checkout_open, v_max_per_line
  from public.store_settings where id = 1;

  if not coalesce(v_checkout_open, false) then
    raise exception 'GD_CHECKOUT_DISABLED' using errcode = 'P0001';
  end if;
  v_max_per_line := coalesce(v_max_per_line, 10);

  ---------------------------------------------------------------------------
  -- 3. Materialize + validate the cart
  ---------------------------------------------------------------------------
  -- A line identifies its product by sku or by slug; both are unique columns. The cart in
  -- the browser stores slugs, so accepting either avoids a lookup round trip that would
  -- have to trust the client with the mapping.
  create temporary table _cart on commit drop as
  select
    nullif(trim(coalesce(e->>'sku', '')), '')  as sku,
    nullif(trim(coalesce(e->>'slug', '')), '') as slug,
    (e->>'quantity')::numeric                  as quantity_raw
  from jsonb_array_elements(coalesce(payload->'items', '[]'::jsonb)) e;

  if exists (select 1 from pg_temp._cart where sku is null and slug is null) then
    raise exception 'GD_INVALID_REQUEST' using errcode = 'P0001';
  end if;

  select count(*) into v_cart_count from pg_temp._cart;
  if v_cart_count = 0 then
    raise exception 'GD_EMPTY_CART' using errcode = 'P0001';
  end if;

  select bool_or(
    quantity_raw is null
    or quantity_raw <> floor(quantity_raw)
    or quantity_raw <= 0
    or quantity_raw > v_max_per_line
  ) into v_bad_qty from pg_temp._cart;
  if v_bad_qty then
    raise exception 'GD_INVALID_QUANTITY' using errcode = 'P0001';
  end if;

  -- Duplicate lines are rejected rather than silently merged.
  if (select count(distinct coalesce(sku, slug)) from pg_temp._cart) <> v_cart_count then
    raise exception 'GD_DUPLICATE_SKU' using errcode = 'P0001';
  end if;

  ---------------------------------------------------------------------------
  -- 4. Lock the requested products in ascending id order (deadlock-safe)
  ---------------------------------------------------------------------------
  perform p.id
  from public.products p
  join pg_temp._cart c on (c.sku = p.sku or c.slug = p.slug)
  order by p.id
  for update;

  ---------------------------------------------------------------------------
  -- 5. Reload authoritative product data (post-lock)
  ---------------------------------------------------------------------------
  create temporary table _lines on commit drop as
  select
    p.id                as product_id,
    p.sku               as sku,
    p.name              as product_name,
    p.price_cents       as unit_price_cents,
    p.publication_status,
    p.active            as product_active,
    cat.active          as category_active,
    p.stock_status,
    p.stock_quantity,
    (c.quantity_raw)::integer as quantity,
    (
      select pi.path from public.product_images pi
      where pi.product_id = p.id and pi.published
      order by pi.sort_order, pi.id
      limit 1
    ) as image_path
  from pg_temp._cart c
  join public.products p     on (c.sku = p.sku or c.slug = p.slug)
  join public.categories cat on cat.id = p.category_id;

  select count(*) into v_line_count from pg_temp._lines;
  if v_line_count <> v_cart_count then
    raise exception 'GD_PRODUCT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  -- Unpublished / inactive / inactive-category / unavailable products.
  if exists (
    select 1 from pg_temp._lines
    where publication_status <> 'published'
       or not product_active
       or not category_active
       or stock_status = 'esaurito'
  ) then
    raise exception 'GD_PRODUCT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  -- Insufficient stock.
  if exists (select 1 from pg_temp._lines where stock_quantity < quantity) then
    raise exception 'GD_INSUFFICIENT_STOCK' using errcode = 'P0001';
  end if;

  ---------------------------------------------------------------------------
  -- 6. Money: subtotal, shipping, coupon discount, total (all integer cents)
  ---------------------------------------------------------------------------
  select sum(unit_price_cents * quantity) into v_subtotal from pg_temp._lines;

  select label, price_cents, free_shipping_threshold_cents
    into v_ship_label, v_ship_price, v_ship_threshold
  from public.shipping_methods
  where code = v_shipping_code and active;
  if not found then
    raise exception 'GD_INVALID_SHIPPING' using errcode = 'P0001';
  end if;

  v_shipping := case
    when v_ship_threshold is not null and v_subtotal >= v_ship_threshold then 0
    else v_ship_price
  end;

  if v_coupon_code is not null then
    select * into v_coupon from public.coupons where code = v_coupon_code for update;
    if not found
       or not v_coupon.active
       or (v_coupon.starts_at is not null and now() < v_coupon.starts_at)
       or (v_coupon.ends_at is not null and now() > v_coupon.ends_at)
       or (v_coupon.min_subtotal_cents is not null and v_subtotal < v_coupon.min_subtotal_cents)
       or (v_coupon.max_redemptions is not null and v_coupon.redemption_count >= v_coupon.max_redemptions)
    then
      raise exception 'GD_INVALID_COUPON' using errcode = 'P0001';
    end if;

    v_discount := case
      when v_coupon.discount_kind = 'fixed'      then least(v_coupon.discount_value, v_subtotal)
      when v_coupon.discount_kind = 'percentage' then floor(v_subtotal * v_coupon.discount_value / 100.0)::integer
      else 0
    end;
  end if;

  v_discount := greatest(0, least(v_discount, v_subtotal));
  v_total    := v_subtotal - v_discount + v_shipping;

  ---------------------------------------------------------------------------
  -- 7. Create the order + immutable line snapshots
  ---------------------------------------------------------------------------
  v_order_number := 'GD-' || to_char(now() at time zone 'utc', 'YYYYMMDD')
                    || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));

  insert into public.orders (
    order_number, idempotency_key, customer_id, customer_email, customer_phone,
    status, payment_status, payment_method,
    shipping_method_code, shipping_method_label,
    subtotal_cents, discount_cents, shipping_cents, total_cents, currency,
    coupon_id, coupon_code, shipping_address, billing_address, notes
  ) values (
    v_order_number, v_idem, v_customer, v_email, v_phone,
    'pending', 'unpaid', 'unconfigured',
    v_shipping_code, coalesce(v_ship_label, ''),
    v_subtotal, v_discount, v_shipping, v_total, 'EUR',
    v_coupon.id, v_coupon_code, v_shipping_addr, v_billing_addr, v_notes
  )
  returning id into v_order_id;

  insert into public.order_items (
    order_id, product_id, sku, product_name, image_path,
    unit_price_cents, quantity, line_subtotal_cents, line_discount_cents, line_total_cents
  )
  select
    v_order_id, product_id, sku, product_name, image_path,
    unit_price_cents, quantity, unit_price_cents * quantity, 0, unit_price_cents * quantity
  from pg_temp._lines;

  ---------------------------------------------------------------------------
  -- 8. Decrement stock (guarded) + inventory movements
  ---------------------------------------------------------------------------
  update public.products p
  set stock_quantity = p.stock_quantity - l.quantity
  from pg_temp._lines l
  where p.id = l.product_id
    and p.stock_quantity >= l.quantity;

  get diagnostics v_line_count = row_count;
  if v_line_count <> (select count(*) from pg_temp._lines) then
    -- A concurrent order took the last unit despite the lock: fail the whole txn.
    raise exception 'GD_INSUFFICIENT_STOCK' using errcode = 'P0001';
  end if;

  insert into public.inventory_movements (product_id, quantity_delta, reason, order_id, actor_id)
  select product_id, -quantity, 'order', v_order_id, v_customer
  from pg_temp._lines;

  ---------------------------------------------------------------------------
  -- 9. Coupon redemption (atomic increment on the locked row)
  ---------------------------------------------------------------------------
  if v_coupon.id is not null then
    update public.coupons set redemption_count = redemption_count + 1 where id = v_coupon.id;
    insert into public.coupon_redemptions (coupon_id, order_id, customer_id, customer_email)
    values (v_coupon.id, v_order_id, v_customer, v_email);
  end if;

  insert into public.audit_events (actor_id, action, entity_type, entity_id, after_data)
  values (v_customer, 'order.created', 'order', v_order_id::text,
          jsonb_build_object('order_number', v_order_number, 'total_cents', v_total));

  return public.order_summary(v_order_id);
end;
$$;

-- Safe read-back of an order for the checkout response and idempotent retry.
-- SECURITY DEFINER so the create_order transaction and a service-role guest can read
-- the order it just wrote regardless of RLS; it exposes only confirmation-safe fields.
create or replace function public.order_summary(p_order_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'order_number',   o.order_number,
    'status',         o.status,
    'payment_status', o.payment_status,
    'currency',       o.currency,
    'subtotal_cents', o.subtotal_cents,
    'discount_cents', o.discount_cents,
    'shipping_cents', o.shipping_cents,
    'total_cents',    o.total_cents,
    'shipping_method_label', o.shipping_method_label,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sku', i.sku,
        'name', i.product_name,
        'quantity', i.quantity,
        'unit_price_cents', i.unit_price_cents,
        'line_total_cents', i.line_total_cents,
        'image_path', i.image_path
      ) order by i.id)
      from public.order_items i where i.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o
  where o.id = p_order_id;
$$;

-- order_summary is a helper of create_order, not a public endpoint.
revoke all on function public.order_summary(bigint) from public;
revoke all on function public.order_summary(bigint) from anon, authenticated;

revoke all on function public.create_order(jsonb) from public;
revoke all on function public.create_order(jsonb) from anon;
grant execute on function public.create_order(jsonb) to authenticated, service_role;
