begin;

-- complete_order e mark_order_delivery_notified sono state create da main in
-- 20261004100000_confirm_delivery_to_customers.sql con un controllo globale sul ruolo
-- (private.has_staff_role). Questo significa che un admin di Oryvenne potrebbe segnare
-- consegnato un ordine di Gear Drop.
--
-- Questa migrazione riscrive le due funzioni con il pattern scoped: si legge la company
-- dall'ordine tramite private.organization_of_order e si verifica il ruolo nel contesto
-- di quella company con private.require_org_role. Tutto il comportamento funzionale
-- originale è conservato esattamente: transizioni ammesse, idempotenza di complete_order
-- su un ordine già 'completed', delivered_at con coalesce, eventi di stato e di audit,
-- messaggi di errore e codici errcode.
--
-- Nota sulle colonne organization_id:
--   - public.audit_events.organization_id   -> colonna nullable, va passata esplicitamente.
--   - public.order_status_events            -> NON ha organization_id diretto; la eredita
--     tramite trigger inherit_organization() che la legge dall'ordine genitore.

create or replace function public.complete_order(p_order_id bigint, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id     uuid              := (select auth.uid());
  current_status public.order_status;
  company      bigint            := private.organization_of_order(p_order_id);
begin
  perform private.require_org_role(
    company,
    array['owner'::public.staff_role, 'admin'::public.staff_role],
    'GD_ORDER_MANAGER_REQUIRED'
  );

  select orders.status
  into current_status
  from public.orders
  where orders.id = p_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'GD_ORDER_NOT_FOUND';
  end if;

  -- Un pacco arriva solo dopo essere partito; un ordine già completed può ricevere
  -- una nuova conferma senza generare un secondo evento di stato.
  if current_status not in ('shipped', 'completed') then
    raise exception using errcode = '22023', message = 'GD_ORDER_INVALID_TRANSITION';
  end if;

  update public.orders
  set status       = 'completed',
      delivered_at = coalesce(delivered_at, now())
  where id = p_order_id;

  if current_status <> 'completed' then
    insert into public.order_status_events (order_id, from_status, to_status, actor_user_id, note)
    values (p_order_id, current_status, 'completed', actor_id, nullif(btrim(p_note), ''));

    insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, before_state, after_state)
    values (
      company, actor_id, 'order.delivered', 'orders', p_order_id::text,
      jsonb_build_object('status', current_status),
      jsonb_build_object('status', 'completed')
    );
  end if;
end;
$$;

create or replace function public.mark_order_delivery_notified(p_order_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid   := (select auth.uid());
  company  bigint := private.organization_of_order(p_order_id);
begin
  perform private.require_org_role(
    company,
    array['owner'::public.staff_role, 'admin'::public.staff_role],
    'GD_ORDER_MANAGER_REQUIRED'
  );

  update public.orders
  set delivery_notified_at = now()
  where id = p_order_id
    and status = 'completed';

  if not found then
    raise exception using errcode = '22023', message = 'GD_ORDER_INVALID_TRANSITION';
  end if;

  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, after_state)
  values (company, actor_id, 'order.delivery_notified', 'orders', p_order_id::text, jsonb_build_object('notified', true));
end;
$$;

-- Le revoke/grant esistenti nel commit di main restano valide; questa migrazione riscrive
-- solo il corpo delle funzioni, non le loro firme né i permessi di esecuzione.

commit;
