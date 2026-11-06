-- 2026-11-05, the owner: a refund made from the Stripe dashboard must reach the shop by itself.
-- Until now nothing told the shop. On 05/11 GD-RH58M929 and GD-QWAMCKCG, refunded on 30/09, still
-- read as paid and sat among the orders to ship.
--
-- The webhook now listens to charge.refunded. The charge in that event carries amount_refunded,
-- the total refunded so far, and this function records that figure instead of adding to what the
-- order holds. So Stripe can repeat a delivery, two partial refunds can arrive in any order, and
-- the owner can record a refund in the panel before or after making it: the sum stays right.
--
-- Stock and order status stay as they are. A refund does not say whether the pieces are back on
-- the shelf (the two orders above had none to return), and only the owner knows that: the note
-- points at "Annulla e ripristina stock". No email to the buyer either: Stripe sends its receipt.

create or replace function public.record_stripe_charge_refund(
  p_payment_intent_id text,
  p_amount_refunded_cents integer,
  p_charge_id text
)
returns table(order_id bigint, order_number text, refunded_cents integer, recorded boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order    public.orders%rowtype;
  v_refunded integer;
  v_fully    boolean;
  v_note     text;
begin
  if coalesce(btrim(p_payment_intent_id), '') = '' or coalesce(p_amount_refunded_cents, 0) <= 0 then
    raise exception using errcode = '22023', message = 'GD_ORDER_REFUND_INVALID';
  end if;

  select o.* into v_order
    from public.orders as o
   where o.stripe_payment_intent_id = btrim(p_payment_intent_id)
   for update;

  -- No row back: not a payment of this shop, or its order has not been recorded yet.
  if not found then
    return;
  end if;

  v_refunded := least(p_amount_refunded_cents, v_order.total_cents);

  -- Already counted (a repeated delivery, or the owner recorded it first): nothing changes.
  if v_refunded <= v_order.refunded_cents or v_order.payment_status not in ('authorized', 'paid') then
    return query select v_order.id, v_order.order_number, v_order.refunded_cents, false;
    return;
  end if;

  v_fully := v_refunded >= v_order.total_cents;

  update public.orders as o
     set refund_prepared_at = coalesce(o.refund_prepared_at, now()),
         refunded_cents     = v_refunded,
         refund_reason      = coalesce(nullif(btrim(o.refund_reason), ''), 'Rimborso fatto su Stripe'),
         stripe_refund_id   = coalesce(nullif(btrim(p_charge_id), ''), o.stripe_refund_id),
         payment_status     = case when v_fully then 'refunded'::public.payment_status else o.payment_status end,
         updated_at         = now()
   where o.id = v_order.id;

  v_note := 'Rimborso fatto su Stripe: rimborsati '
    || replace(to_char(v_refunded / 100.0, 'FM999990.00'), '.', ',') || ' € su '
    || replace(to_char(v_order.total_cents / 100.0, 'FM999990.00'), '.', ',') || ' €. '
    || 'Registrato in automatico: nessuna email dal negozio, stock invariato.';
  if v_fully and v_order.status in ('pending', 'confirmed', 'processing') then
    v_note := v_note || ' NON SPEDIRE. Se i pezzi sono a magazzino: Annulla e ripristina stock.';
  end if;

  insert into public.order_notes(order_id, note) values (v_order.id, v_note);

  insert into public.audit_events(action, entity_type, entity_id, after_state)
  values (
    'order.refunded',
    'orders',
    v_order.id::text,
    jsonb_build_object(
      'amount_cents',     v_refunded - v_order.refunded_cents,
      'refunded_cents',   v_refunded,
      'stripe_charge_id', nullif(btrim(p_charge_id), ''),
      'fully_refunded',   v_fully,
      'source',           'stripe_webhook'
    )
  );

  return query select v_order.id, v_order.order_number, v_refunded, true;
end;
$$;

revoke all on function public.record_stripe_charge_refund(text, integer, text)
  from public, anon, authenticated;
grant execute on function public.record_stripe_charge_refund(text, integer, text)
  to service_role;
