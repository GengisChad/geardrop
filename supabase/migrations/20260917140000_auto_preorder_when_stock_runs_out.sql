-- When the declared stock of a product runs out, the shop keeps selling it as a pre-order
-- instead of closing the sale. `allow_backorder` is the switch: with it on, a product at zero
-- stock reads 'pre-ordine' and stays purchasable, and a paid quantity beyond the shelf is
-- recorded as pre-ordered pieces rather than as an oversell. A restock turns it back into
-- 'disponibile' on its own, because both columns are computed from the stock.

alter table public.products
  alter column stock_status set expression as (
    case
      when availability_override = 'preorder'::public.availability_override then 'pre-ordine'::public.stock_status
      when availability_override = 'incoming'::public.availability_override then 'in-arrivo'::public.stock_status
      when stock_quantity > 0 then 'disponibile'::public.stock_status
      when allow_backorder then 'pre-ordine'::public.stock_status
      else 'esaurito'::public.stock_status
    end
  ),
  alter column is_purchasable set expression as (
    active
    and publication_status = 'published'::public.publication_status
    and (
      stock_quantity > 0
      or (
        availability_override = 'preorder'::public.availability_override
        and preorder_allocation > 0
      )
      or (availability_override is null and allow_backorder)
    )
    and availability_override is distinct from 'incoming'::public.availability_override
  );

-- The owner's rule applies to the whole published catalogue; archived products stay closed.
update public.products
set allow_backorder = true
where publication_status = 'published'::public.publication_status
  and not allow_backorder;

-- The managed help pages say what a pre-order means now, as src/data/pages.ts does.
update public.content_pages
set markdown_source = replace(
  markdown_source,
  'Il prodotto è prenotabile entro l''allocazione indicata. GEAR//DROP affida il pacco al corriere entro 14 giorni dalla conferma dell''ordine.',
  'Quando i pezzi a magazzino finiscono puoi comunque ordinare il prodotto: il pre-ordine potrebbe arrivare tra 10/15 giorni lavorativi dalla conferma dell''ordine. Il carrello e la pagina di pagamento ti indicano quali pezzi sono in pre-ordine prima di pagare.'
)
where slug = 'faq';

update public.content_pages
set markdown_source = replace(
  markdown_source,
  'Per i pre-ordini, GEAR//DROP affida il pacco al corriere entro 14 giorni dalla conferma dell''ordine.',
  'I prodotti disponibili partono dopo la conferma del pagamento. I pre-ordini potrebbero arrivare tra 10/15 giorni lavorativi dalla conferma dell''ordine.'
)
where slug = 'spedizioni';

-- How many units of an order line were not on the shelf when the payment arrived. They ship
-- once the stock comes back; the rest of the line ships right away.
alter table public.order_items
  add column preorder_quantity integer not null default 0,
  add constraint order_items_preorder_quantity_range check (preorder_quantity between 0 and quantity);

comment on column public.order_items.preorder_quantity is
  'Units of this line sold as a pre-order: not in stock when the payment was recorded.';

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

        if kind = 'preorder' then
          ready_sets := 0;
        elsif short > 0 then
          ready_sets := least(ready_sets, taken / part.per_set);
          if not backorder then
            oversold := oversold || (target.name || ' (nel ' || line.name || '): pagati ' || part.pieces || ', disponibili ' || on_hand);
          end if;
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

  if exists (select 1 from public.order_items where order_items.order_id = new_order_id and order_items.preorder_quantity > 0) then
    insert into public.order_notes(order_id, note)
    select new_order_id,
      'Pre-ordine: ' || string_agg(order_items.preorder_quantity || ' × ' || order_items.product_name_snapshot, ', ' order by order_items.id)
        || '. Non erano a magazzino: potrebbero arrivare tra 10/15 giorni lavorativi.'
    from public.order_items
    where order_items.order_id = new_order_id and order_items.preorder_quantity > 0;
  end if;

  insert into public.audit_events(action, entity_type, entity_id, after_state)
  values (
    'order.paid_on_stripe', 'orders', new_order_id::text,
    jsonb_build_object(
      'order_number', number_candidate,
      'stripe_checkout_session_id', p_session_id,
      'total_cents', subtotal + p_shipping_cents,
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

revoke all on function public.record_stripe_checkout_order(text, text, text, text, text, jsonb, jsonb, integer, text)
  from public, anon, authenticated;
grant execute on function public.record_stripe_checkout_order(text, text, text, text, text, jsonb, jsonb, integer, text)
  to service_role;
