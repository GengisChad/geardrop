-- Pre-ordini: avvisare chi aspetta quando la merce arriva.
--
-- Un ordine pagato in pre-ordine resta in attesa finché il carico merce non porta i pezzi in
-- magazzino. Da quel momento il socio avvisa il cliente ("è arrivato, parte a breve") e poi lo
-- spedisce come ogni altro ordine. La data dell'avviso sta sull'ordine, così l'email non parte
-- due volte e la coda sa chi è già stato avvisato.

alter table public.orders add column preorder_ready_notified_at timestamptz;

comment on column public.orders.preorder_ready_notified_at is
  'Quando il cliente è stato avvisato che la merce del suo pre-ordine è arrivata. Null: mai avvisato.';

create or replace function public.mark_preorder_ready_notified(p_order_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  company bigint := private.organization_of_order(p_order_id);
begin
  perform private.require_org_role(company,
    array['owner'::public.staff_role, 'admin'::public.staff_role], 'GD_ORDER_MANAGER_REQUIRED');
  -- Solo un ordine pagato e non ancora spedito: dopo la spedizione vale l'email di spedizione.
  update public.orders set preorder_ready_notified_at = now()
  where id = p_order_id
    and payment_status in ('paid', 'authorized')
    and status in ('pending', 'confirmed', 'processing');
  if not found then
    raise exception using errcode = '22023', message = 'GD_ORDER_INVALID_TRANSITION';
  end if;
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, after_state)
  values (company, actor_id, 'order.preorder_ready_notified', 'orders', p_order_id::text,
    jsonb_build_object('notified', true));
end;
$$;
revoke all on function public.mark_preorder_ready_notified(bigint) from public, anon, authenticated;
grant execute on function public.mark_preorder_ready_notified(bigint) to authenticated;

-- ---------------------------------------------------------------------------------------
-- Cosa aspetta la merce, e cosa il magazzino può già coprire.
-- ---------------------------------------------------------------------------------------

/**
 * Per ogni ordine pagato non ancora spedito che contiene pezzi in pre-ordine: quanti pezzi
 * aspettano, quanti ne copre lo stock di oggi e se il cliente è già stato avvisato. Lo stock
 * viene impegnato in ordine di arrivo, così due ordini sullo stesso prodotto non contano lo
 * stesso pezzo due volte: il più vecchio parte per primo.
 */
create function public.get_preorder_queue(p_organization_id bigint)
returns table (
  order_id bigint,
  order_number text,
  created_at timestamptz,
  email text,
  preorder_units integer,
  covered_units integer,
  ready boolean,
  notified_at timestamptz,
  waiting jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_org_role(p_organization_id,
    array['owner'::public.staff_role, 'admin'::public.staff_role], 'GD_ORDER_MANAGER_REQUIRED');

  return query
  with lines as (
    select orders.id as order_id, orders.order_number, orders.created_at, orders.email,
      orders.preorder_ready_notified_at, item.product_id, item.sku_snapshot, item.product_name_snapshot,
      item.preorder_quantity,
      -- Pezzi dello stesso prodotto già impegnati da ordini più vecchi.
      coalesce(sum(item.preorder_quantity) over (
        partition by item.product_id order by orders.created_at, orders.id
        rows between unbounded preceding and 1 preceding
      ), 0) as claimed_before
    from public.orders as orders
    join public.order_items as item on item.order_id = orders.id
    where orders.organization_id = p_organization_id
      and orders.payment_status in ('paid', 'authorized')
      and orders.status in ('pending', 'confirmed', 'processing')
      and item.preorder_quantity > 0
  ),
  covered as (
    select lines.*,
      greatest(least(lines.preorder_quantity,
        coalesce(product.stock_quantity, 0) - lines.claimed_before), 0) as covered_quantity
    from lines
    left join public.products as product on product.id = lines.product_id
  )
  select
    covered.order_id,
    max(covered.order_number),
    max(covered.created_at),
    max(covered.email),
    sum(covered.preorder_quantity)::integer,
    sum(covered.covered_quantity)::integer,
    bool_and(covered.covered_quantity >= covered.preorder_quantity),
    max(covered.preorder_ready_notified_at),
    jsonb_agg(jsonb_build_object(
      'sku', covered.sku_snapshot,
      'nome', covered.product_name_snapshot,
      'attesi', covered.preorder_quantity,
      'coperti', covered.covered_quantity
    ) order by covered.sku_snapshot)
  from covered
  group by covered.order_id
  order by max(covered.created_at);
end;
$$;
revoke all on function public.get_preorder_queue(bigint) from public, anon, authenticated;
grant execute on function public.get_preorder_queue(bigint) to authenticated;
