-- 2026-11-27, the owner: the bot's features he liked, first among them the step agreed on 26/11: a
-- pre-order taken on Telegram and paid with PayPal.me becomes a real order of the shop, like one
-- paid on Stripe. Until now those buyers lived only in telegram_preorders: no InPost label from
-- the station, no confirmation email, nothing in the back office's lists and figures.
--
-- record_telegram_preorder_order turns one paid reservation into an order:
--
--   * confirmed and paid, shipped to the InPost Locker the buyer chose in the bot, with the same
--     address snapshot a Locker order from the site carries (method, label, pickupPointId), so the
--     warehouse station books the label as it does for those;
--   * one line, the piece at the price the bot showed, held as a pre-order: its pieces already came
--     off products.preorder_allocation when the reservation was confirmed (telegram_preorder_hold),
--     so nothing is taken from the count a second time. Cancelling the order from the back office
--     gives them back, as for any pre-ordered line;
--   * the reservation remembers its order (telegram_preorders.order_id), so asking twice returns the
--     same order and never makes a second one.
--
-- The order number is GD-T plus the six characters of the reservation's code (GDT-7K3Q9A becomes
-- GD-T7K3Q9A): the shape of every order number, so the buyer can follow it on /ordine, and the code
-- he wrote in PayPal's note is still in it.
--
-- Only the server's own key runs it, like the Stripe recorder.

alter table public.telegram_preorders
  add column order_id bigint unique references public.orders(id) on delete set null;

create function public.record_telegram_preorder_order(p_preorder_id bigint)
returns table (order_id bigint, order_number text, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  shop bigint := private.single_storefront_organization();
  pre public.telegram_preorders%rowtype;
  target public.products%rowtype;
  image_src text;
  new_order_id bigint;
  number_candidate text;
  suffix integer := 1;
  subtotal integer;
  snapshot jsonb;
begin
  if p_preorder_id is null then
    raise exception using errcode = '22023', message = 'GD_TELEGRAM_ORDER_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtext('telegram-preorder:' || p_preorder_id));

  select * into pre from public.telegram_preorders where id = p_preorder_id for update;
  if not found or pre.status <> 'paid' then
    raise exception using errcode = '22023', message = 'GD_TELEGRAM_ORDER_NOT_PAID';
  end if;
  if pre.order_id is not null then
    return query select orders.id, orders.order_number, false from public.orders where orders.id = pre.order_id;
    return;
  end if;
  if pre.buyer_name is null or pre.email is null or jsonb_typeof(pre.locker) is distinct from 'object'
    or coalesce(pre.locker ->> 'id', '') = '' or pre.quantity < 1 or pre.unit_cents < 0 then
    raise exception using errcode = '22023', message = 'GD_TELEGRAM_ORDER_INCOMPLETE';
  end if;
  subtotal := pre.unit_cents * pre.quantity;
  if pre.total_cents <> subtotal + pre.shipping_cents then
    raise exception using errcode = '22023', message = 'GD_TELEGRAM_ORDER_INCOMPLETE';
  end if;

  select products.* into target from public.products
  where products.organization_id = shop and products.slug = pre.product_slug;
  if found then
    select images.src into image_src
    from public.product_images as images
    where images.product_id = target.id
    order by images.is_primary desc, images.sort_order, images.id
    limit 1;
  end if;

  number_candidate := 'GD-T' || substr(pre.code, 5);
  while exists (select 1 from public.orders where orders.order_number = number_candidate) loop
    suffix := suffix + 1;
    number_candidate := 'GD-T' || substr(pre.code, 5) || '-' || suffix;
  end loop;

  -- What a Locker order from the site holds: the person, the Locker, and no street address,
  -- which a parcel to a Locker does not need.
  snapshot := jsonb_build_object(
    'name', pre.buyer_name,
    'address', '',
    'postalCode', '',
    'city', '',
    'province', '',
    'country', 'IT',
    'phone', pre.phone,
    'method', 'inpost-locker',
    'methodLabel', 'InPost · Locker',
    'pickupPoint', pre.locker ->> 'label',
    'pickupPointId', pre.locker ->> 'id'
  );

  insert into public.orders (
    organization_id, order_number, email, phone, status, payment_status, subtotal_cents, discount_cents,
    shipping_cents, total_cents, shipping_method_code, shipping_address_snapshot,
    billing_address_snapshot, notes, idempotency_key,
    attribution_source, attribution_medium, attribution_campaign
  )
  values (
    shop, number_candidate, lower(btrim(pre.email)), nullif(btrim(coalesce(pre.phone, '')), ''),
    'confirmed'::public.order_status, 'paid'::public.payment_status, subtotal, 0,
    pre.shipping_cents, pre.total_cents, 'inpost-locker', snapshot,
    snapshot, 'Pre-ordine su Telegram ' || pre.code || ', pagato con PayPal.me.',
    md5('telegram-preorder:' || pre.id)::uuid,
    'telegram', 'social', 'preordine'
  )
  returning id into new_order_id;

  insert into public.order_items (
    order_id, product_id, quantity, unit_price_cents, line_total_cents,
    product_name_snapshot, sku_snapshot, image_src_snapshot, reservation_kind, preorder_quantity
  )
  values (
    new_order_id, target.id, pre.quantity, pre.unit_cents, subtotal,
    coalesce(target.name, pre.product_name), coalesce(target.sku, upper(pre.product_slug)), coalesce(image_src, ''),
    'preorder', pre.quantity
  );

  update public.telegram_preorders set order_id = new_order_id, updated_at = now() where id = pre.id;

  insert into public.order_status_events (order_id, from_status, to_status, note)
  values (new_order_id, null, 'confirmed'::public.order_status, 'Pagamento ricevuto con PayPal.me (pre-ordine Telegram ' || pre.code || ')');
  insert into public.order_notes (order_id, note)
  values (
    new_order_id,
    'Pre-ordine preso su Telegram (' || pre.code || ') e pagato con PayPal.me: il pagamento l''ha confermato il proprietario '
      || 'nel bot. ' || pre.quantity || ' × ' || coalesce(target.name, pre.product_name)
      || ', pezzi già tolti dal conteggio del pre-ordine. Potrebbe arrivare tra 10/15 giorni lavorativi.'
  );
  insert into public.audit_events (organization_id, action, entity_type, entity_id, after_state)
  values (
    shop, 'order.paid_on_paypal_me', 'orders', new_order_id::text,
    jsonb_build_object(
      'order_number', number_candidate,
      'telegram_preorder_id', pre.id,
      'telegram_preorder_code', pre.code,
      'subtotal_cents', subtotal,
      'shipping_cents', pre.shipping_cents,
      'total_cents', pre.total_cents,
      'preordered', pre.quantity
    )
  );
  return query select new_order_id, number_candidate, true;
end;
$$;

revoke all on function public.record_telegram_preorder_order(bigint) from public, anon, authenticated;
grant execute on function public.record_telegram_preorder_order(bigint) to service_role;

comment on function public.record_telegram_preorder_order(bigint) is
  'Turns a Telegram pre-order paid with PayPal.me into a paid order of the shop (2026-11-27). Idempotent: the reservation keeps its order.';
