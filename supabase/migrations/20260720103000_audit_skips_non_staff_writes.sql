-- Second half of the same defect: a signed-in customer still could not order.
--
-- public.products carries private.audit_admin_mutation(), which raised GD_STAFF_REQUIRED
-- for any actor without a staff role. create_order reserves stock under the buyer's
-- auth.uid(), so checkout died there once the editor-boundary trigger stopped rejecting
-- it first. Guest orders were unaffected only because auth.uid() is null for them.
--
-- The trigger records *administrative* mutations. A customer is not an administrator, so
-- there is nothing here to audit: refusing the write was authorisation logic in an audit
-- trigger, duplicating the RLS policies that already decide who may touch these tables.
-- It now skips exactly the way it already skips for seed and maintenance, which have no
-- request actor either.
--
-- Nothing about checkout goes unrecorded: create_order writes its own `order.created`
-- audit event with the buyer as actor, and every stock movement lands in
-- public.inventory_movements carrying the order id and the actor.
--
-- Of the tables create_order writes to, only public.products carries this trigger;
-- orders, order_items, inventory_movements, coupons and coupon_redemptions do not.

create or replace function private.audit_admin_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  before_row jsonb;
  after_row jsonb;
  entity_row jsonb;
  entity_key text;
begin
  -- Seed and reviewed direct-database maintenance have no request actor.
  if actor_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  -- Not staff: not an administrative mutation. RLS decides whether the write is allowed
  -- at all; the only non-staff writer is order intake, already audited as an order event
  -- and an inventory movement.
  if not private.has_staff_role(
    array[
      'owner'::public.staff_role,
      'admin'::public.staff_role,
      'editor'::public.staff_role
    ]
  ) then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  before_row := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  after_row := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  entity_row := coalesce(after_row, before_row);
  entity_key := coalesce(
    entity_row ->> 'id',
    nullif(
      concat_ws(
        ':',
        entity_row ->> 'product_id',
        entity_row ->> 'related_product_id',
        entity_row ->> 'media_asset_id',
        entity_row ->> 'tag',
        entity_row ->> 'relation_type',
        entity_row ->> 'sort_order'
      ),
      ''
    ),
    'unknown'
  );

  insert into public.audit_events (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    before_state,
    after_state
  ) values (
    actor_id,
    lower(tg_op),
    tg_table_name,
    entity_key,
    before_row,
    after_row
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.audit_admin_mutation() from public, anon, authenticated, service_role;
