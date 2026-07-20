-- A signed-in customer could not place an order.
--
-- create_order reserves stock with `update public.products set stock_quantity = ...`.
-- That runs inside a security-definer function, but auth.uid() is still the customer's,
-- and private.enforce_product_editor_boundaries() refused any product write from a
-- non-staff actor with GD_PRODUCT_STAFF_REQUIRED. Guest orders passed only because
-- auth.uid() is null for them, so the whole guard was skipped.
--
-- The guard is a *content* rule: it exists to stop an editor from quietly changing a
-- price, a stock level or an availability override. Deciding *who* may write to
-- public.products is RLS's job, and RLS already does it — products_staff_update is the
-- only UPDATE policy on the table and it requires owner, admin or editor, so a customer
-- has no path to the table through the Data API with or without this branch. Raising
-- here therefore added nothing against customers while breaking the one legitimate case:
-- the shop reserving its own stock during checkout.
--
-- A transaction-local flag was considered and rejected: any editor could set the same
-- GUC and use it to skip the field restrictions below, turning a fix into a privilege
-- escalation. Deferring to RLS keeps the editor rules exactly as strict as they were.

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

  -- Not staff at all: RLS decides. Reached by order intake, which reserves stock on
  -- behalf of the shop while running under the buyer's identity.
  if not private.has_staff_role(array['editor'::public.staff_role]) then
    return new;
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
