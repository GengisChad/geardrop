create or replace function public.adjust_inventory(
  p_sku text,
  p_delta integer,
  p_reason public.inventory_reason,
  p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_product public.products%rowtype;
  next_stock integer;
begin
  if not private.has_staff_role(
    array[
      'owner'::public.staff_role,
      'admin'::public.staff_role,
      'editor'::public.staff_role
    ]
  ) then
    raise exception using errcode = '42501', message = 'GD_STAFF_REQUIRED';
  end if;

  if p_delta is null or p_delta = 0 then
    raise exception using errcode = '22023', message = 'GD_INVALID_STOCK_DELTA';
  end if;

  if p_reason not in (
    'manual_adjustment'::public.inventory_reason,
    'return'::public.inventory_reason,
    'damage'::public.inventory_reason
  ) then
    raise exception using errcode = '22023', message = 'GD_INVALID_MANUAL_STOCK_REASON';
  end if;

  select product.*
  into target_product
  from public.products as product
  where product.sku = lower(trim(p_sku))
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'GD_PRODUCT_NOT_FOUND';
  end if;

  next_stock := target_product.stock_quantity + p_delta;

  if next_stock < 0 then
    raise exception using errcode = '23514', message = 'GD_INSUFFICIENT_STOCK';
  end if;

  update public.products
  set stock_quantity = next_stock
  where id = target_product.id;

  insert into public.inventory_movements (
    product_id,
    delta,
    stock_after,
    reason,
    actor_user_id,
    note
  ) values (
    target_product.id,
    p_delta,
    next_stock,
    p_reason,
    (select auth.uid()),
    nullif(trim(p_note), '')
  );

  return next_stock;
end;
$$;

revoke all on function public.adjust_inventory(text, integer, public.inventory_reason, text) from public, anon;
grant execute on function public.adjust_inventory(text, integer, public.inventory_reason, text) to authenticated;

-- The application roles can change stock only through the locked function above.
revoke update (stock_quantity) on public.products from anon, authenticated;
