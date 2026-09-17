begin;

-- Bundles sold as one item on Stripe (the Shatter Horus + Hurricane Enlil duo) have no product
-- row and no stock of their own. The webhook now sends each bundle line with the catalogue
-- products one unit ships; the order keeps the bundle as the single line the buyer paid for and
-- takes every pack's pieces off the shelf, with the same idempotency, zero floor and oversell
-- note as a single product. Lines without components behave exactly as before. Cancelling such an
-- order restores its packs too (see cancel_order_and_restore_stock below).

create or replace function public.record_stripe_checkout_order(
  p_session_id text,
  p_payment_intent_id text,
  p_order_number text,
  p_email text,
  p_phone text,
  p_shipping_address jsonb,
  p_lines jsonb,
  p_shipping_cents integer,
  p_notes text
)
returns table (order_id bigint, order_number text, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_id bigint;
  existing_number text;
  new_order_id bigint;
  number_candidate text;
  suffix integer := 1;
  line record;
  part record;
  target public.products%rowtype;
  subtotal integer;
  on_hand integer;
  remaining integer;
  kind text;
  image_src text;
  oversold text[] := array[]::text[];
begin
  if p_session_id is null or p_session_id !~ '^cs_(live|test)_[A-Za-z0-9]{10,200}$'
    or p_order_number is null or btrim(p_order_number) = ''
    or p_email is null or btrim(p_email) = ''
    or jsonb_typeof(p_shipping_address) is distinct from 'object'
    or p_shipping_cents is null or p_shipping_cents < 0
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
  from public.orders
  where orders.stripe_checkout_session_id = p_session_id;
  if found then
    return query select existing_id, existing_number, false;
    return;
  end if;

  select coalesce(sum((item.value ->> 'quantity')::integer * (item.value ->> 'unit_price_cents')::integer), 0)
  into subtotal
  from jsonb_array_elements(p_lines) as item(value);

  -- The reference comes from the checkout attempt; a buyer who pays twice from one cart gets
  -- a suffixed number instead of a failed webhook.
  number_candidate := btrim(p_order_number);
  while exists (select 1 from public.orders where orders.order_number = number_candidate) loop
    suffix := suffix + 1;
    number_candidate := btrim(p_order_number) || '-' || suffix;
  end loop;

  insert into public.orders(
    order_number, email, phone, status, payment_status, subtotal_cents, discount_cents,
    shipping_cents, total_cents, shipping_method_code, shipping_address_snapshot,
    billing_address_snapshot, notes, idempotency_key, stripe_checkout_session_id,
    stripe_payment_intent_id
  )
  values (
    number_candidate, lower(btrim(p_email)), nullif(btrim(p_phone), ''),
    'confirmed'::public.order_status, 'paid'::public.payment_status, subtotal, 0,
    p_shipping_cents, subtotal + p_shipping_cents, 'standard', p_shipping_address,
    p_shipping_address, nullif(btrim(p_notes), ''), md5(p_session_id)::uuid, p_session_id,
    nullif(btrim(p_payment_intent_id), '')
  )
  returning id into new_order_id;

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
      -- A bundle is one order line, as the buyer paid for it, and takes its packs' stock.
      insert into public.order_items(
        order_id, product_id, quantity, unit_price_cents, line_total_cents,
        product_name_snapshot, sku_snapshot, image_src_snapshot
      )
      values (
        new_order_id, null, line.quantity, line.unit_price_cents,
        line.quantity * line.unit_price_cents, line.name, upper(line.slug), '/products/' || line.slug || '.webp'
      );

      for part in
        select component.value ->> 'slug' as slug,
               (component.value ->> 'quantity')::integer * line.quantity as pieces
        from jsonb_array_elements(line.components) with ordinality as component(value, position)
        order by component.position
      loop
        select products.* into target from public.products where products.slug = part.slug for update;
        if not found then
          oversold := oversold || (line.name || ': ' || part.slug || ' non è nel catalogo, stock non scalato');
          continue;
        end if;

        kind := case when target.availability_override = 'preorder'::public.availability_override then 'preorder' else 'stock' end;
        on_hand := case when kind = 'preorder' then target.preorder_allocation else target.stock_quantity end;
        remaining := greatest(on_hand - part.pieces, 0);

        if remaining <> on_hand then
          if kind = 'preorder' then
            update public.products set preorder_allocation = remaining where id = target.id;
          else
            update public.products set stock_quantity = remaining where id = target.id;
            insert into public.inventory_movements(product_id, delta, stock_after, reason, order_id, note)
            values (target.id, remaining - on_hand, remaining, 'order_reserved'::public.inventory_reason, new_order_id,
              'Venduto nel ' || line.name || ' · ordine ' || number_candidate);
          end if;
        end if;

        if part.pieces > on_hand then
          oversold := oversold || (target.name || ' (nel ' || line.name || '): pagati ' || part.pieces || ', disponibili ' || on_hand);
        end if;
      end loop;
      continue;
    end if;

    select products.* into target from public.products where products.slug = line.slug for update;

    if not found then
      -- Paid for, but no longer in the catalogue: keep the line exactly as Stripe charged it.
      insert into public.order_items(
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
    remaining := greatest(on_hand - line.quantity, 0);

    insert into public.order_items(
      order_id, product_id, quantity, unit_price_cents, line_total_cents,
      product_name_snapshot, sku_snapshot, image_src_snapshot, reservation_kind
    )
    values (
      new_order_id, target.id, line.quantity, line.unit_price_cents,
      line.quantity * line.unit_price_cents, target.name, target.sku, coalesce(image_src, ''), kind
    );

    if remaining <> on_hand then
      if kind = 'preorder' then
        update public.products set preorder_allocation = remaining where id = target.id;
      else
        update public.products set stock_quantity = remaining where id = target.id;
        insert into public.inventory_movements(product_id, delta, stock_after, reason, order_id, note)
        values (target.id, remaining - on_hand, remaining, 'order_reserved'::public.inventory_reason, new_order_id,
          'Venduto su Stripe · ordine ' || number_candidate);
      end if;
    end if;

    -- A payment is never refused after the fact: if two buyers paid for the last piece, the
    -- order is kept and flagged so the owner can sort it out with the customer.
    if line.quantity > on_hand then
      oversold := oversold || (target.name || ': pagati ' || line.quantity || ', disponibili ' || on_hand);
    end if;
  end loop;

  insert into public.order_status_events(order_id, from_status, to_status, note)
  values (new_order_id, null, 'confirmed'::public.order_status, 'Pagamento ricevuto su Stripe');

  if cardinality(oversold) > 0 then
    insert into public.order_notes(order_id, note)
    values (new_order_id, 'Attenzione, pezzi venduti oltre la disponibilità. ' || array_to_string(oversold, '; '));
  end if;

  insert into public.audit_events(action, entity_type, entity_id, after_state)
  values (
    'order.paid_on_stripe', 'orders', new_order_id::text,
    jsonb_build_object(
      'order_number', number_candidate,
      'stripe_checkout_session_id', p_session_id,
      'total_cents', subtotal + p_shipping_cents,
      'oversold', to_jsonb(oversold)
    )
  );

  return query select new_order_id, number_candidate, true;
end;
$$;

revoke all on function public.record_stripe_checkout_order(text, text, text, text, text, jsonb, jsonb, integer, text)
  from public, anon, authenticated;
grant execute on function public.record_stripe_checkout_order(text, text, text, text, text, jsonb, jsonb, integer, text)
  to service_role;

-- Cancelling a Stripe order gives back exactly what its movements took. A bundle line has no
-- product row of its own, so restoring order lines one by one would skip its packs (and a null
-- product id cannot be written to inventory_movements). Pieces sold beyond the shelf were never
-- taken and are never invented. Pre-order allocations and orders from the site's own intake keep
-- their line-by-line restore.
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
begin
  if not private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role]) then
    raise exception using errcode = '42501', message = 'GD_ORDER_MANAGER_REQUIRED';
  end if;

  select orders.status, orders.stripe_checkout_session_id is not null
  into current_status, paid_on_stripe
  from public.orders
  where orders.id = p_order_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_ORDER_NOT_FOUND';
  end if;
  if current_status not in ('pending', 'confirmed', 'processing') then
    raise exception using errcode = '22023', message = 'GD_ORDER_INVALID_TRANSITION';
  end if;

  perform 1
  from public.products
  where id in (
    select order_items.product_id from public.order_items where order_items.order_id = p_order_id
    union
    select inventory_movements.product_id from public.inventory_movements where inventory_movements.order_id = p_order_id
  )
  order by id
  for update;

  perform set_config('geardrop.preorder_movement_managed', 'on', true);

  for item in
    select *
    from public.order_items
    where order_items.order_id = p_order_id
      and order_items.product_id is not null
      and (order_items.reservation_kind = 'preorder' or not paid_on_stripe)
    order by order_items.id
  loop
    if item.reservation_kind = 'preorder' then
      update public.products set preorder_allocation = preorder_allocation + item.quantity
      where id = item.product_id
      returning stock_quantity into next_stock;
    else
      update public.products set stock_quantity = stock_quantity + item.quantity
      where id = item.product_id
      returning stock_quantity into next_stock;
    end if;
    insert into public.inventory_movements(product_id, delta, stock_after, reason, order_id, actor_user_id, note)
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
      where id = restock.product_id
      returning stock_quantity into next_stock;
      insert into public.inventory_movements(product_id, delta, stock_after, reason, order_id, actor_user_id, note)
      values (restock.product_id, restock.pieces, next_stock, 'order_cancelled', p_order_id, actor_id, 'Ripristino annullamento');
    end loop;
  end if;

  perform set_config('geardrop.preorder_movement_managed', 'off', true);

  update public.orders set status = 'cancelled' where id = p_order_id;
  insert into public.order_status_events(order_id, from_status, to_status, actor_user_id, note)
  values (p_order_id, current_status, 'cancelled', actor_id, nullif(trim(p_note), ''));
  insert into public.audit_events(actor_user_id, action, entity_type, entity_id, after_state)
  values (actor_id, 'order.cancelled', 'orders', p_order_id::text, jsonb_build_object('stock_restored', true));
end;
$$;

-- "Offerte" in the managed main menu now opens the duo, as it does in the catalogue build.
update public.navigation_items
set href = '/prodotto/duo-horus-enlil',
    updated_at = now()
where label = 'Offerte'
  and href = '/negozio?stock=disponibile';

commit;
