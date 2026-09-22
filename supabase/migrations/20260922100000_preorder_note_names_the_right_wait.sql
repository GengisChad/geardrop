-- The order note about pre-ordered pieces promised 10/15 working days for everything, including
-- the September drop, which only reaches Italy with the Hasbro release (owner, 2026-09-22). The
-- function now writes one note per kind: unreleased pieces (availability_override = 'preorder')
-- say the release wait, pieces bought beyond the shelf keep the 10/15 days. Nothing else changes;
-- create or replace keeps its grants.

begin;

create or replace function public.record_stripe_checkout_order(
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
  p_coupon_code text default null
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
  from public.orders
  where orders.stripe_checkout_session_id = p_session_id;
  if found then
    return query select existing_id, existing_number, false;
    return;
  end if;

  select coalesce(sum((item.value ->> 'quantity')::integer * (item.value ->> 'unit_price_cents')::integer), 0)
  into subtotal
  from jsonb_array_elements(p_lines) as item(value);

  -- Clamp discount to subtotal so the total_cents check never fires.
  discount_clamped := least(greatest(p_discount_cents, 0), subtotal);

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
    billing_address_snapshot, coupon_code, notes, idempotency_key,
    stripe_checkout_session_id, stripe_payment_intent_id
  )
  values (
    number_candidate, lower(btrim(p_email)), nullif(btrim(p_phone), ''),
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
        select products.* into target from public.products where products.slug = part.slug for update;
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
            insert into public.inventory_movements(product_id, delta, stock_after, reason, order_id, note)
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

      insert into public.order_items(
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
    taken := least(on_hand, line.quantity);
    short := line.quantity - taken;
    backorder := kind = 'stock' and target.allow_backorder and target.availability_override is null;

    insert into public.order_items(
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
        insert into public.inventory_movements(product_id, delta, stock_after, reason, order_id, note)
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

  insert into public.order_status_events(order_id, from_status, to_status, note)
  values (new_order_id, null, 'confirmed'::public.order_status, 'Pagamento ricevuto su Stripe');

  if cardinality(oversold) > 0 then
    insert into public.order_notes(order_id, note)
    values (new_order_id, 'Attenzione, pezzi venduti oltre la disponibilità. ' || array_to_string(oversold, '; '));
  end if;

  -- Two waits, two notes: a piece bought beyond the shelf may take 10/15 working days, while an
  -- unreleased drop (availability_override = 'preorder') only lands with the Hasbro release.
  insert into public.order_notes(order_id, note)
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

  insert into public.audit_events(action, entity_type, entity_id, after_state)
  values (
    'order.paid_on_stripe', 'orders', new_order_id::text,
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
        from public.order_items
        where order_items.order_id = new_order_id
      )
    )
  );

  return query select new_order_id, number_candidate, true;
end;
$$;

commit;
