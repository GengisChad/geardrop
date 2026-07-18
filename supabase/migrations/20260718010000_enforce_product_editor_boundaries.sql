create or replace function private.enforce_product_editor_boundaries()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Seed and explicitly reviewed database maintenance do not carry a request actor.
  if (select auth.uid()) is null then
    return new;
  end if;

  if private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role]) then
    return new;
  end if;

  if not private.has_staff_role(array['editor'::public.staff_role]) then
    raise exception using errcode = '42501', message = 'GD_PRODUCT_STAFF_REQUIRED';
  end if;

  if tg_op = 'INSERT' then
    if new.publication_status <> 'draft'::public.publication_status
      or new.active
      or new.price_cents <> 0
      or new.compare_at_price_cents is not null
      or not new.manage_stock
      or new.low_stock_threshold <> 5
      or new.allow_backorder
      or new.availability_override is not null
      or new.preorder_allocation <> 0
      or new.preorder_release_date is not null
      or new.rating <> 0
      or new.review_count <> 0
      or new.stock_quantity <> 0 then
      raise exception using errcode = '42501', message = 'GD_EDITOR_DRAFT_DEFAULTS_REQUIRED';
    end if;
    return new;
  end if;

  if new.price_cents is distinct from old.price_cents
    or new.compare_at_price_cents is distinct from old.compare_at_price_cents
    or new.currency is distinct from old.currency
    or new.manage_stock is distinct from old.manage_stock
    or new.low_stock_threshold is distinct from old.low_stock_threshold
    or new.allow_backorder is distinct from old.allow_backorder
    or new.availability_override is distinct from old.availability_override
    or new.preorder_allocation is distinct from old.preorder_allocation
    or new.preorder_release_date is distinct from old.preorder_release_date
    or new.rating is distinct from old.rating
    or new.review_count is distinct from old.review_count
    or new.stock_quantity is distinct from old.stock_quantity then
    raise exception using errcode = '42501', message = 'GD_EDITOR_COMMERCE_FIELDS_FORBIDDEN';
  end if;

  if new.publication_status = 'published'::public.publication_status and new.price_cents = 0 then
    raise exception using errcode = '23514', message = 'GD_ZERO_PRICE_PRODUCT_CANNOT_PUBLISH';
  end if;

  if (new.publication_status = 'published'::public.publication_status) is distinct from new.active then
    raise exception using errcode = '23514', message = 'GD_EDITOR_PUBLICATION_STATE_INVALID';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_product_editor_boundaries()
from public, anon, authenticated, service_role;

create trigger products_enforce_editor_boundaries
before insert or update on public.products
for each row execute function private.enforce_product_editor_boundaries();
