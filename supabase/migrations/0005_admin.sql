-- GEAR//DROP staff operations (back-office).
--
-- Catalog editing, coupons, shipping and store settings are plain RLS-bound writes from
-- the request-scoped client (policies in 0002_rls.sql) — no function needed. The three
-- operations below cannot be expressed as a single-table write, so each is a short
-- SECURITY DEFINER function with `search_path = ''` that re-checks the caller's staff
-- role against public.staff_profiles (never user_metadata) before doing anything:
--
--   * admin_set_order_status — order lifecycle, with the stock movement the transition
--     implies. Cancelling returns the reserved units; un-cancelling takes them back and
--     fails if they are no longer available.
--   * admin_adjust_stock     — inventory correction plus its movement row, in one txn.
--   * owner_upsert_staff /
--     owner_list_staff       — staff roles. These need auth.users, which the Data API
--     does not expose, so the lookup happens here and returns only email + role.
--
-- Failures use the same stable GD_* domain codes as create_order; the server action maps
-- them to Italian strings.

-- ---------------------------------------------------------------------------
-- Order lifecycle
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_order_status(
  p_order_id       bigint,
  p_status         text,
  p_payment_status text default null,
  p_note           text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid := auth.uid();
  v_role     text := private.current_staff_role();
  v_order    public.orders%rowtype;
  v_updated  integer;
  v_lines    integer;
begin
  if v_role is null or v_role not in ('admin', 'owner') then
    raise exception 'GD_FORBIDDEN' using errcode = 'P0001';
  end if;

  if p_status not in ('pending', 'confirmed', 'fulfilled', 'cancelled', 'refunded') then
    raise exception 'GD_INVALID_STATUS' using errcode = 'P0001';
  end if;
  if p_payment_status is not null and p_payment_status not in ('unpaid', 'paid', 'refunded') then
    raise exception 'GD_INVALID_STATUS' using errcode = 'P0001';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'GD_ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Cancelling a live order returns its units to stock, once.
  if p_status = 'cancelled' and v_order.status <> 'cancelled' then
    update public.products p
    set stock_quantity = p.stock_quantity + i.quantity
    from public.order_items i
    where i.order_id = v_order.id
      and p.id = i.product_id;

    insert into public.inventory_movements (product_id, quantity_delta, reason, order_id, actor_id, note)
    select i.product_id, i.quantity, 'cancellation', v_order.id, v_actor, p_note
    from public.order_items i
    where i.order_id = v_order.id
      and i.product_id is not null;
  end if;

  -- Reopening a cancelled order takes the units back; it fails if they are gone.
  if v_order.status = 'cancelled' and p_status <> 'cancelled' then
    select count(*) into v_lines
    from public.order_items i
    where i.order_id = v_order.id and i.product_id is not null;

    update public.products p
    set stock_quantity = p.stock_quantity - i.quantity
    from public.order_items i
    where i.order_id = v_order.id
      and p.id = i.product_id
      and p.stock_quantity >= i.quantity;

    get diagnostics v_updated = row_count;
    if v_updated <> v_lines then
      raise exception 'GD_INSUFFICIENT_STOCK' using errcode = 'P0001';
    end if;

    insert into public.inventory_movements (product_id, quantity_delta, reason, order_id, actor_id, note)
    select i.product_id, -i.quantity, 'order', v_order.id, v_actor, p_note
    from public.order_items i
    where i.order_id = v_order.id
      and i.product_id is not null;
  end if;

  update public.orders
  set status         = p_status,
      payment_status = coalesce(p_payment_status, payment_status)
  where id = v_order.id;

  insert into public.audit_events (actor_id, action, entity_type, entity_id, before_data, after_data)
  values (
    v_actor, 'order.status_changed', 'order', v_order.id::text,
    jsonb_build_object('status', v_order.status, 'payment_status', v_order.payment_status),
    jsonb_build_object(
      'status', p_status,
      'payment_status', coalesce(p_payment_status, v_order.payment_status),
      'note', p_note
    )
  );

  return jsonb_build_object(
    'order_id',       v_order.id,
    'order_number',   v_order.order_number,
    'status',         p_status,
    'payment_status', coalesce(p_payment_status, v_order.payment_status)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Inventory correction
-- ---------------------------------------------------------------------------

create or replace function public.admin_adjust_stock(
  p_product_id bigint,
  p_delta      integer,
  p_reason     text default 'adjustment',
  p_note       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role  text := private.current_staff_role();
  v_stock integer;
  v_new   integer;
begin
  if v_role is null or v_role not in ('admin', 'owner') then
    raise exception 'GD_FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'GD_INVALID_QUANTITY' using errcode = 'P0001';
  end if;
  if p_reason not in ('restock', 'adjustment', 'return') then
    raise exception 'GD_INVALID_REQUEST' using errcode = 'P0001';
  end if;

  select stock_quantity into v_stock
  from public.products where id = p_product_id for update;
  if not found then
    raise exception 'GD_PRODUCT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  v_new := v_stock + p_delta;
  if v_new < 0 then
    raise exception 'GD_INSUFFICIENT_STOCK' using errcode = 'P0001';
  end if;

  update public.products set stock_quantity = v_new where id = p_product_id;

  insert into public.inventory_movements (product_id, quantity_delta, reason, actor_id, note)
  values (p_product_id, p_delta, p_reason, v_actor, p_note);

  insert into public.audit_events (actor_id, action, entity_type, entity_id, before_data, after_data)
  values (
    v_actor, 'product.stock_adjusted', 'product', p_product_id::text,
    jsonb_build_object('stock_quantity', v_stock),
    jsonb_build_object('stock_quantity', v_new, 'reason', p_reason, 'note', p_note)
  );

  return jsonb_build_object('product_id', p_product_id, 'stock_quantity', v_new);
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff roles (owner only)
-- ---------------------------------------------------------------------------

create or replace function public.owner_upsert_staff(
  p_email  text,
  p_role   text,
  p_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := auth.uid();
  v_role   text := private.current_staff_role();
  v_email  text := lower(trim(coalesce(p_email, '')));
  v_target uuid;
  v_before public.staff_profiles%rowtype;
begin
  if v_role is distinct from 'owner' then
    raise exception 'GD_FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_role not in ('owner', 'admin', 'editor') then
    raise exception 'GD_INVALID_ROLE' using errcode = 'P0001';
  end if;
  if v_email = '' then
    raise exception 'GD_INVALID_REQUEST' using errcode = 'P0001';
  end if;

  select id into v_target from auth.users where lower(email) = v_email;
  if not found then
    raise exception 'GD_USER_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- An owner cannot lock themselves out; another owner has to do it.
  if v_target = v_actor and (p_role <> 'owner' or not p_active) then
    raise exception 'GD_CANNOT_DEMOTE_SELF' using errcode = 'P0001';
  end if;

  select * into v_before from public.staff_profiles where user_id = v_target;

  insert into public.staff_profiles (user_id, role, active, created_by)
  values (v_target, p_role, p_active, v_actor)
  on conflict (user_id) do update
    set role   = excluded.role,
        active = excluded.active;

  insert into public.audit_events (actor_id, action, entity_type, entity_id, before_data, after_data)
  values (
    v_actor, 'staff.upserted', 'staff_profile', v_target::text,
    case when v_before.user_id is null then null
         else jsonb_build_object('role', v_before.role, 'active', v_before.active) end,
    jsonb_build_object('role', p_role, 'active', p_active)
  );

  return jsonb_build_object('user_id', v_target, 'email', v_email, 'role', p_role, 'active', p_active);
end;
$$;

-- Staff list with emails. auth.users is not exposed to the Data API, so this is the only
-- way the back-office can show who a staff row belongs to. Owner only; emails of
-- non-staff users are never returned.
create or replace function public.owner_list_staff()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := private.current_staff_role();
begin
  if v_role is distinct from 'owner' then
    raise exception 'GD_FORBIDDEN' using errcode = 'P0001';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id',    sp.user_id,
      'email',      u.email,
      'role',       sp.role,
      'active',     sp.active,
      'created_at', sp.created_at
    ) order by sp.created_at)
    from public.staff_profiles sp
    join auth.users u on u.id = sp.user_id
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Execute privileges: authenticated only; every function re-checks the staff role.
-- ---------------------------------------------------------------------------

revoke all on function public.admin_set_order_status(bigint, text, text, text) from public, anon;
revoke all on function public.admin_adjust_stock(bigint, integer, text, text)  from public, anon;
revoke all on function public.owner_upsert_staff(text, text, boolean)          from public, anon;
revoke all on function public.owner_list_staff()                               from public, anon;

grant execute on function public.admin_set_order_status(bigint, text, text, text) to authenticated;
grant execute on function public.admin_adjust_stock(bigint, integer, text, text)  to authenticated;
grant execute on function public.owner_upsert_staff(text, text, boolean)          to authenticated;
grant execute on function public.owner_list_staff()                               to authenticated;
