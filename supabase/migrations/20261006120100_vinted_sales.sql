-- Vinted sales reach the shop through the seller's own mailbox.
--
-- Vinted Pro's integration API is allowlisted, and its terms forbid bots on the seller's account,
-- so the shop never talks to Vinted. Gmail forwards each "Hai venduto un articolo su Vinted"
-- email to a Resend inbound address; Resend calls /api/vinted/inbound, which stores the email
-- here, reads the sale out of it (product code first, then Claude), and takes the pieces off the
-- shared shelf when it is sure. When it is not — a "Set di N articoli" names no pieces, a title
-- matches nothing — the sale waits in the panel (/admin/vinted) for the owner to say what left.
--
-- Writes go through the functions below only: the webhook holds the secret key and may store and
-- auto-apply; the owner and admins may apply or dismiss from the panel. Nobody writes the tables.

begin;
select pg_advisory_xact_lock(hashtext('20261006120100_vinted_sales'));

create table public.inbound_emails (
  id bigint generated always as identity primary key,
  provider_email_id text not null unique check (length(provider_email_id) between 1 and 200),
  from_address text not null default '' check (length(from_address) <= 320),
  subject text not null default '' check (length(subject) <= 500),
  body_text text not null default '' check (length(body_text) <= 20000),
  -- DMARC passed for the From domain: the email really left Vinted, even after Gmail forwarded it.
  sender_verified boolean not null default false,
  kind text not null check (kind in ('vinted_sale', 'other')),
  received_at timestamptz not null default now()
);

create type public.vinted_sale_status as enum ('pending', 'recorded', 'dismissed');

create table public.vinted_sales (
  id bigint generated always as identity primary key,
  inbound_email_id bigint not null unique references public.inbound_emails(id) on delete restrict,
  buyer_username text not null default '' check (length(buyer_username) <= 120),
  listing_title text not null check (length(listing_title) between 1 and 300),
  item_count integer not null default 1 check (item_count between 1 and 50),
  amount_cents integer not null check (amount_cents between 0 and 10000000),
  status public.vinted_sale_status not null default 'pending',
  -- What the reader proposed: {"lines": [{"slug", "quantity"}], "confidence", "source", "reason"}.
  suggestion jsonb not null default '{}'::jsonb,
  -- What actually left the shelf: [{"slug", "name", "quantity", "taken"}]; taken < quantity
  -- means the shelf held fewer than the sale took and the site had been showing a pre-order.
  lines jsonb not null default '[]'::jsonb,
  note text check (note is null or length(note) <= 1000),
  sold_at timestamptz not null default now(),
  recorded_at timestamptz,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index vinted_sales_status_sold_at_idx on public.vinted_sales (status, sold_at desc);
create index inbound_emails_received_at_idx on public.inbound_emails (received_at desc);

alter table public.inbound_emails enable row level security;
alter table public.vinted_sales enable row level security;

create policy inbound_emails_manager_read on public.inbound_emails for select to authenticated
  using (private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role]));
create policy vinted_sales_manager_read on public.vinted_sales for select to authenticated
  using (private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role]));

-- Reading only: every write is one of the functions below, which run as their owner.
grant select on public.inbound_emails, public.vinted_sales to authenticated;

-- Takes the pieces of one sale off the shelf. Never below zero: a piece the shelf no longer
-- holds is recorded as wanted but not taken, so the ledger matches the shelf.
create or replace function private.apply_vinted_sale_lines(p_sale_id bigint, p_lines jsonb, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  sale public.vinted_sales%rowtype;
  line jsonb;
  target public.products%rowtype;
  wanted integer;
  taken integer;
  applied jsonb := '[]'::jsonb;
begin
  select * into sale from public.vinted_sales where id = p_sale_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_VINTED_SALE_NOT_FOUND';
  end if;
  if sale.status <> 'pending'::public.vinted_sale_status then
    raise exception using errcode = '22023', message = 'GD_VINTED_SALE_ALREADY_HANDLED';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 20 then
    raise exception using errcode = '22023', message = 'GD_VINTED_LINES_INVALID';
  end if;

  for line in select value from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(line) <> 'object' or coalesce(line ->> 'quantity', '') !~ '^[0-9]{1,2}$' then
      raise exception using errcode = '22023', message = 'GD_VINTED_LINES_INVALID';
    end if;
    wanted := (line ->> 'quantity')::integer;
    if wanted < 1 or wanted > 50 then
      raise exception using errcode = '22023', message = 'GD_VINTED_LINES_INVALID';
    end if;

    select * into target from public.products where slug = line ->> 'slug' for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'GD_PRODUCT_NOT_FOUND';
    end if;

    taken := least(wanted, target.stock_quantity);
    if taken > 0 then
      update public.products set stock_quantity = target.stock_quantity - taken where id = target.id;
      insert into public.inventory_movements (product_id, delta, stock_after, reason, actor_user_id, note)
      values (target.id, -taken, target.stock_quantity - taken, 'vinted_sale'::public.inventory_reason, p_actor,
        'Vendita Vinted #' || sale.id);
    end if;
    applied := applied || jsonb_build_object('slug', target.slug, 'name', target.name, 'quantity', wanted, 'taken', taken);
  end loop;

  update public.vinted_sales
  set status = 'recorded'::public.vinted_sale_status, lines = applied, recorded_at = now(), recorded_by = p_actor
  where id = sale.id;

  insert into public.audit_events (actor_user_id, action, entity_type, entity_id, before_state, after_state)
  values (p_actor, 'vinted_sale.recorded', 'vinted_sales', sale.id::text,
    jsonb_build_object('status', sale.status), jsonb_build_object('status', 'recorded', 'lines', applied));

  return applied;
end;
$$;

revoke all on function private.apply_vinted_sale_lines(bigint, jsonb, uuid) from public, anon, authenticated, service_role;

-- The webhook's door in: stores the email once (Resend may deliver it twice) and, when it is a
-- sale, the sale it describes. Returns the stored ids and whether this call created them.
create or replace function public.ingest_inbound_email(
  p_provider_email_id text,
  p_from text,
  p_subject text,
  p_body text,
  p_sender_verified boolean,
  p_sale jsonb default null
)
returns table (inbound_id bigint, sale_id bigint, created boolean)
language plpgsql security definer set search_path = '' as $$
declare
  existing_id bigint;
  new_inbound_id bigint;
  new_sale_id bigint;
begin
  select id into existing_id from public.inbound_emails where provider_email_id = p_provider_email_id;
  if found then
    return query select existing_id, (select id from public.vinted_sales where inbound_email_id = existing_id), false;
    return;
  end if;

  insert into public.inbound_emails (provider_email_id, from_address, subject, body_text, sender_verified, kind)
  values (p_provider_email_id, left(coalesce(p_from, ''), 320), left(coalesce(p_subject, ''), 500),
    left(coalesce(p_body, ''), 20000), coalesce(p_sender_verified, false),
    case when p_sale is null then 'other' else 'vinted_sale' end)
  returning id into new_inbound_id;

  if p_sale is not null then
    insert into public.vinted_sales (inbound_email_id, buyer_username, listing_title, item_count, amount_cents, sold_at)
    values (new_inbound_id, left(coalesce(p_sale ->> 'buyer_username', ''), 120),
      left(coalesce(nullif(p_sale ->> 'listing_title', ''), 'Articolo Vinted'), 300),
      greatest(1, least(50, coalesce((p_sale ->> 'item_count')::integer, 1))),
      greatest(0, coalesce((p_sale ->> 'amount_cents')::integer, 0)),
      coalesce((p_sale ->> 'sold_at')::timestamptz, now()))
    returning id into new_sale_id;
  end if;

  return query select new_inbound_id, new_sale_id, true;
end;
$$;

-- What the reader proposed, kept on the sale so the panel can offer it.
create or replace function public.set_vinted_sale_suggestion(p_sale_id bigint, p_suggestion jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_suggestion is null or jsonb_typeof(p_suggestion) <> 'object' then
    raise exception using errcode = '22023', message = 'GD_VINTED_SUGGESTION_INVALID';
  end if;
  update public.vinted_sales set suggestion = p_suggestion where id = p_sale_id and status = 'pending'::public.vinted_sale_status;
end;
$$;

create or replace function public.auto_apply_vinted_sale(p_sale_id bigint, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return private.apply_vinted_sale_lines(p_sale_id, p_lines, null);
end;
$$;

revoke all on function public.ingest_inbound_email(text, text, text, text, boolean, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.set_vinted_sale_suggestion(bigint, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.auto_apply_vinted_sale(bigint, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.ingest_inbound_email(text, text, text, text, boolean, jsonb) to service_role;
grant execute on function public.set_vinted_sale_suggestion(bigint, jsonb) to service_role;
grant execute on function public.auto_apply_vinted_sale(bigint, jsonb) to service_role;

-- The panel: the owner or an admin says which pieces left, or that the email was not a sale.
create or replace function public.apply_vinted_sale(p_sale_id bigint, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role]) then
    raise exception using errcode = '42501', message = 'GD_VINTED_MANAGER_REQUIRED';
  end if;
  return private.apply_vinted_sale_lines(p_sale_id, p_lines, (select auth.uid()));
end;
$$;

create or replace function public.dismiss_vinted_sale(p_sale_id bigint, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  previous public.vinted_sale_status;
begin
  if not private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role]) then
    raise exception using errcode = '42501', message = 'GD_VINTED_MANAGER_REQUIRED';
  end if;
  select status into previous from public.vinted_sales where id = p_sale_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_VINTED_SALE_NOT_FOUND';
  end if;
  if previous <> 'pending'::public.vinted_sale_status then
    raise exception using errcode = '22023', message = 'GD_VINTED_SALE_ALREADY_HANDLED';
  end if;
  update public.vinted_sales
  set status = 'dismissed'::public.vinted_sale_status, note = nullif(left(btrim(coalesce(p_note, '')), 1000), ''),
    recorded_at = now(), recorded_by = (select auth.uid())
  where id = p_sale_id;
  insert into public.audit_events (actor_user_id, action, entity_type, entity_id, before_state, after_state)
  values ((select auth.uid()), 'vinted_sale.dismissed', 'vinted_sales', p_sale_id::text,
    jsonb_build_object('status', previous), jsonb_build_object('status', 'dismissed'));
end;
$$;

revoke all on function public.apply_vinted_sale(bigint, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.dismiss_vinted_sale(bigint, text) from public, anon, authenticated, service_role;
grant execute on function public.apply_vinted_sale(bigint, jsonb) to authenticated;
grant execute on function public.dismiss_vinted_sale(bigint, text) to authenticated;

commit;
