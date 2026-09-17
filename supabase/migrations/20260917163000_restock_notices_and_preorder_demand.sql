-- Restock notices: buyers on sold-out PDPs can leave their email to be notified when the
-- product comes back. The admin sees how many are waiting per product alongside the count
-- of preorder units already committed in active orders, so restocking decisions are informed.

-- === Table =================================================================

create table public.restock_requests (
  id         bigint generated always as identity primary key,
  product_slug text not null,
  -- Length and format are validated by the RPC; the check here is a belt-and-suspenders guard.
  email      text not null check (
                length(email) between 3 and 320
                and email ~ '^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{1,63}$'
              ),
  created_at timestamptz not null default now(),
  notified_at timestamptz
);

-- Idempotency key: one request per (slug, lower(email)).
create unique index restock_requests_slug_email_unique
  on public.restock_requests (product_slug, lower(email));

alter table public.restock_requests enable row level security;
-- Supabase's default privileges grant the API roles everything; guests get nothing, signed-in
-- users may only read, and the policy below narrows that to owners and admins. Writes go
-- through the security definer functions.
revoke all on table public.restock_requests from anon, authenticated;
grant select on table public.restock_requests to authenticated;

create policy "staff can read restock requests"
  on public.restock_requests
  for select
  using ((select private.has_staff_role(array[
    'owner'::public.staff_role, 'admin'::public.staff_role
  ])));

comment on table public.restock_requests is
  'One row per (product_slug, email) pair while a buyer is waiting for a restock notice. '
  'mark_restock_notices_sent deletes a request once its email is delivered.';

-- === Anon/authenticated RPC: request a notice ==============================

create or replace function public.request_restock_notice(
  p_slug  text,
  p_email text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_slug  text := btrim(coalesce(p_slug, ''));
  clean_email text := lower(btrim(coalesce(p_email, '')));
begin
  -- A real published product must exist.
  if clean_slug = '' then
    raise exception using errcode = '22023', message = 'GD_RESTOCK_INVALID_SLUG';
  end if;
  if not exists (
    select 1 from public.products
    where slug = clean_slug
      and publication_status = 'published'::public.publication_status
  ) then
    raise exception using errcode = '22023', message = 'GD_RESTOCK_PRODUCT_NOT_FOUND';
  end if;

  -- Basic email sanity before the unique insert.
  if clean_email = ''
    or clean_email !~ '^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{1,63}$'
    or length(clean_email) > 320
  then
    raise exception using errcode = '22023', message = 'GD_RESTOCK_INVALID_EMAIL';
  end if;

  -- A cap per product keeps a flood of made-up addresses from filling the table and the
  -- owner's email quota; real demand for one pack never gets near it.
  if (select count(*) from public.restock_requests where product_slug = clean_slug) >= 2000 then
    return;
  end if;

  -- Idempotent: a duplicate is silently ignored.
  insert into public.restock_requests (product_slug, email)
  values (clean_slug, clean_email)
  on conflict (product_slug, lower(email)) do nothing;
end;
$$;

revoke all on function public.request_restock_notice(text, text) from public, anon, authenticated;
grant execute on function public.request_restock_notice(text, text) to anon, authenticated;

-- === Manager-only RPC: demand snapshot =====================================
-- Returns one row per requested slug with the count of pending notices (not yet notified)
-- and the total preorder_quantity committed in active (confirmed/processing) orders.
-- Bundles are excluded here (they have product_id = null in order_items); the TypeScript
-- layer expands bundle components and maps their slugs before calling this function.

create or replace function public.get_inventory_restock_demand(
  p_slugs text[]
)
returns table (
  product_slug      text,
  pending_notices   bigint,
  preorder_demand   bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  -- Guard: only owner or admin may read.
  -- The SELECT is written as a CTE so the guard runs once before any data is returned.
  with _guard as (
    select (select private.has_staff_role(array[
      'owner'::public.staff_role, 'admin'::public.staff_role
    ])) as ok
  ),
  _slugs as (
    select unnest(p_slugs) as slug
  ),
  _notices as (
    select rr.product_slug,
           count(*) as cnt
    from public.restock_requests rr
    where rr.product_slug = any(p_slugs)
      and rr.notified_at is null
    group by rr.product_slug
  ),
  _demand as (
    select p.slug,
           coalesce(sum(oi.preorder_quantity), 0) as total
    from public.products p
    join public.order_items oi on oi.product_id = p.id
    join public.orders o on o.id = oi.order_id
    where p.slug = any(p_slugs)
      and oi.preorder_quantity > 0
      and o.status in ('confirmed'::public.order_status, 'processing'::public.order_status)
    group by p.slug
  )
  select s.slug,
         coalesce(n.cnt, 0)     as pending_notices,
         coalesce(d.total, 0)   as preorder_demand
  from _slugs s
  left join _notices n on n.product_slug = s.slug
  left join _demand  d on d.slug          = s.slug
  where (select ok from _guard);
$$;

revoke all on function public.get_inventory_restock_demand(text[]) from public, anon, authenticated;
grant execute on function public.get_inventory_restock_demand(text[]) to authenticated;

-- === Manager-only RPC: mark notices sent ===================================
-- Called by the TypeScript layer after successfully sending each email.
-- Deletes requests older than 6 months (whether notified or not) to honour the
-- privacy retention commitment; a manager-initiated cleanup may also be triggered
-- from the admin UI via this same function by passing an empty array.

create or replace function public.mark_restock_notices_sent(
  p_request_ids bigint[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_staff_role(array[
    'owner'::public.staff_role, 'admin'::public.staff_role
  ]) then
    raise exception using errcode = '42501', message = 'GD_RESTOCK_MANAGER_REQUIRED';
  end if;

  -- A delivered notice has served its purpose: the address is deleted, as the privacy page says.
  if cardinality(p_request_ids) > 0 then
    delete from public.restock_requests
    where id = any(p_request_ids);
  end if;

  -- Privacy retention: delete requests older than 6 months (notified or not).
  delete from public.restock_requests
  where created_at < now() - interval '6 months';
end;
$$;

revoke all on function public.mark_restock_notices_sent(bigint[]) from public, anon, authenticated;
grant execute on function public.mark_restock_notices_sent(bigint[]) to authenticated;
