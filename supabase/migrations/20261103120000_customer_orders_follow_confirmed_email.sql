-- 2026-11-03, the owner: a customer who registers and orders follows the parcel from the account
-- page, instead of writing to the shop every time ("quando un utente si registra e fa un ordine,
-- abbia nel suo pannello ordine il tracking di dove sta il suo pacco").
--
-- Orders come from the Stripe webhook (record_stripe_checkout_order), which knows the buyer's
-- email but not their account: on 03/11 none of the 101 orders carried a customer_id, so the
-- account page listed nothing. claim_customer_orders() files under the caller every guest order
-- placed with the caller's own address, and the account page calls it before reading. RLS
-- (orders_customer_read, order_items_customer_read) then shows those orders as it always meant to.
--
-- Only a confirmed address claims: anyone can register with any email, only its owner can
-- confirm it. An order already filed under an account is never moved. The webhook finds its
-- repeats by Stripe session, so a claimed order is still recognised when Stripe retries.

create or replace function public.claim_customer_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := (select auth.uid());
  v_email text;
  v_count integer;
begin
  if v_user is null then
    return 0;
  end if;

  select lower(btrim(u.email))
    into v_email
    from auth.users as u
   where u.id = v_user
     and u.email_confirmed_at is not null;

  if v_email is null or v_email = '' then
    return 0;
  end if;

  update public.orders as o
     set customer_id = v_user
   where o.customer_id is null
     and lower(btrim(o.email)) = v_email
     -- (customer_id, idempotency_key) is unique: an order never collides with one already filed.
     and not exists (
       select 1
         from public.orders as mine
        where mine.customer_id = v_user
          and mine.idempotency_key = o.idempotency_key
     );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.claim_customer_orders()
  from public, anon, authenticated, service_role;
grant execute on function public.claim_customer_orders()
  to authenticated;
