-- Storefront checkout boundaries.
--
-- Two defects are corrected here, forward-only. Nothing in the twenty preceding
-- migrations is rewritten.
--
-- 1. Customer identity. `create_order` derives the buyer from `auth.uid()`, but its
--    EXECUTE privilege had been narrowed to `service_role`, where `auth.uid()` is always
--    null. Every order would therefore have been recorded as a guest order. The intake
--    RPC is instead granted to the two roles that carry a real request identity, so
--    PostgreSQL — not the caller — decides who the customer is. The signature is left
--    untouched and deliberately carries no customer parameter, so no caller can claim to
--    be somebody else.
--
-- 2. Preorder exhaustion. A check constraint demanded `preorder_allocation > 0` for any
--    product flagged `preorder`, so selling the final allocated unit drove the value to
--    zero and aborted the whole order with a bare 23514. Allocation may now reach zero;
--    the generated `is_purchasable` column already turns false there, which is what makes
--    `calculate_cart_pricing` refuse the next purchase with a domain error.
--
-- The wrapper also gains payload validation, so malformed quantities surface as GD_*
-- codes instead of raw constraint violations from deep inside the transaction.

-- ---------------------------------------------------------------------------
-- 1. Preorder allocation may reach zero.
-- ---------------------------------------------------------------------------

-- Both constraints were declared anonymously, so their generated names are positional
-- and must not be hardcoded. They are located by definition and replaced by named
-- equivalents, leaving future migrations something stable to reference.
do $$
declare
  scope_constraints text[];
  exhaustion_constraints text[];
begin
  select coalesce(array_agg(conname order by conname), array[]::text[])
  into scope_constraints
  from pg_catalog.pg_constraint
  where conrelid = 'public.products'::pg_catalog.regclass
    and contype = 'c'
    and pg_catalog.pg_get_constraintdef(oid) like '%preorder_allocation = 0%';

  select coalesce(array_agg(conname order by conname), array[]::text[])
  into exhaustion_constraints
  from pg_catalog.pg_constraint
  where conrelid = 'public.products'::pg_catalog.regclass
    and contype = 'c'
    and pg_catalog.pg_get_constraintdef(oid) like '%preorder_allocation > 0%';

  -- Exactly one of each is expected. Anything else means the schema drifted from what
  -- this migration was written against, and guessing would be worse than stopping.
  if array_length(scope_constraints, 1) is distinct from 1
    or array_length(exhaustion_constraints, 1) is distinct from 1 then
    raise exception using
      errcode = 'P0001',
      message = 'GD_MIGRATION_PREORDER_CONSTRAINTS_NOT_FOUND',
      detail = format('scope=%s exhaustion=%s', scope_constraints, exhaustion_constraints);
  end if;

  execute format('alter table public.products drop constraint %I', scope_constraints[1]);
  execute format('alter table public.products drop constraint %I', exhaustion_constraints[1]);
end;
$$;

-- Non-preorder products still may not hold an allocation. The column check
-- `preorder_allocation >= 0` from the foundation migration keeps the value non-negative,
-- so zero is now the only newly reachable state.
alter table public.products
  add constraint products_preorder_allocation_scope
  check (
    availability_override = 'preorder'::public.availability_override
    or preorder_allocation = 0
  );

comment on constraint products_preorder_allocation_scope on public.products is
  'Only preorder products carry an allocation. Allocation may fall to zero once the last unit is sold; is_purchasable then reports the product as unavailable.';

-- ---------------------------------------------------------------------------
-- 2. Order intake: validated payloads, real customer identity.
-- ---------------------------------------------------------------------------

-- `create or replace` preserves the existing ownership and, importantly, the existing
-- grants — which is why the privileges are restated explicitly below.
create or replace function public.create_order(
  p_email text,
  p_phone text,
  p_shipping_address jsonb,
  p_billing_address jsonb,
  p_lines jsonb,
  p_coupon_code text,
  p_shipping_code text,
  p_idempotency_key uuid
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_id bigint;
  maximum_quantity integer;
  intake_enabled boolean;
begin
  -- `for share` holds the acceptance singleton for the life of the transaction, so a
  -- concurrent "disable orders" cannot commit between this check and the insert.
  select accept_orders, max_quantity_per_line into intake_enabled, maximum_quantity
  from public.site_settings
  where singleton
  for share;
  if not found or not intake_enabled then
    raise exception using errcode = '55000', message = 'GD_ORDER_INTAKE_DISABLED';
  end if;

  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) < 1 then
    raise exception using errcode = '22023', message = 'GD_ORDER_INVALID_PAYLOAD';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_lines) as line(value)
    where jsonb_typeof(line.value) is distinct from 'object'
      or jsonb_typeof(line.value -> 'product_id') is distinct from 'number'
      or jsonb_typeof(line.value -> 'quantity') is distinct from 'number'
  ) then
    raise exception using errcode = '22023', message = 'GD_ORDER_INVALID_PAYLOAD';
  end if;

  -- JSON numbers are arbitrary precision, so "quantity": 1.5 parses as a number and would
  -- otherwise reach an ::integer cast and raise 22P02 from somewhere unhelpful.
  if exists (
    select 1 from jsonb_array_elements(p_lines) as line(value)
    where (line.value ->> 'product_id')::numeric < 1
      or (line.value ->> 'product_id')::numeric
         <> pg_catalog.trunc((line.value ->> 'product_id')::numeric)
  ) then
    raise exception using errcode = '22023', message = 'GD_ORDER_INVALID_PAYLOAD';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_lines) as line(value)
    where (line.value ->> 'quantity')::numeric < 1
      or (line.value ->> 'quantity')::numeric
         <> pg_catalog.trunc((line.value ->> 'quantity')::numeric)
  ) then
    raise exception using errcode = '22023', message = 'GD_ORDER_INVALID_QUANTITY';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_lines) as line(value)
    where (line.value ->> 'quantity')::numeric > maximum_quantity
  ) then
    raise exception using errcode = '22023', message = 'GD_ORDER_QUANTITY_LIMIT';
  end if;

  -- The private implementation reloads every price from the catalogue and reads the
  -- buyer from auth.uid(); nothing the caller sends can influence either.
  order_id := private.create_order_unchecked(
    p_email, p_phone, p_shipping_address, p_billing_address, p_lines,
    p_coupon_code, p_shipping_code, p_idempotency_key
  );
  return order_id;
end;
$$;

-- Guests arrive as `anon` (auth.uid() null -> customer_id null); signed-in customers
-- arrive as `authenticated` (auth.uid() = their id -> customer_id set). No internal
-- process creates orders, so `service_role` is deliberately not granted: an order can
-- only ever be created by a request that carries its own identity.
revoke all on function public.create_order(text,text,jsonb,jsonb,jsonb,text,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.create_order(text,text,jsonb,jsonb,jsonb,text,text,uuid)
  to anon, authenticated;

-- The unvalidated implementation stays reachable only through the wrapper above.
revoke all on function private.create_order_unchecked(text,text,jsonb,jsonb,jsonb,text,text,uuid)
  from public, anon, authenticated, service_role;
