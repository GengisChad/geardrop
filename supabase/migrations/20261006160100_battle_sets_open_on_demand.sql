-- Opened Battle Sets, counted the way the shelf really works (owner, 2026-10-06).
--
-- The Drop Attack Battle Set is now sold three ways: sealed on the site, its two tops loose on
-- the site (Impact Drake 9-60LR, Hover Wyvern 3-85N), and its stadium alone on Vinted. A set is
-- opened while packing, as a piece is needed, or in a batch. Until now the shelf counted the
-- sealed sets and a notional hundred of each top as if they were separate goods, so opening a
-- set never took it off the sealed count, and the stadium alone did not exist at all.
--
-- The model: a piece's availability is the pieces already out of their set ("loose", kept in
-- battle_set_parts) plus the sealed sets that still hold one. So:
--   * a piece sold takes from the loose ones first; when none is left, a sealed set is opened
--     (the set goes down by one, the set's other pieces gain a loose one each);
--   * a sealed set sold takes one of each piece with it;
--   * a batch opened by hand only moves sets into loose pieces: what the shop can sell is
--     unchanged.
-- One trigger on the ledger does this for every path that moves stock — Stripe orders, bundles,
-- Vinted sales, the panel — without touching any of them.
--
-- Known limit: the trigger locks a second product row after the caller locked the first. Two
-- orders committing at the same instant — one a loose piece that must open a set, the other a
-- sealed set — can deadlock; Postgres aborts one, and its caller retries it (Stripe redelivers
-- the webhook, a Vinted sale stays in the panel). Taking from loose pieces needs no second lock,
-- so the window only exists while a piece has none loose.

begin;
select pg_advisory_xact_lock(hashtext('20261006160100_battle_sets_open_on_demand'));

-- The stadium alone. A stock item for Vinted, not a page on the site: draft and inactive.
insert into public.products (
  category_id, slug, sku, name, tagline, description, price_cents,
  publication_status, active, stock_quantity, allow_backorder, rating, review_count, sort_order
)
select
  set_product.category_id, 'drop-attack-arena', 'DROP-ATTACK-ARENA', 'Beystadium Drop Attack (solo arena)',
  'L''arena del Drop Attack Battle Set, senza trottole.',
  'Il Beystadium del Drop Attack Battle Set, venduto da solo dopo aver tolto Impact Drake e Hover Wyvern. In vendita su Vinted, non sul sito.',
  1000, 'draft'::public.publication_status, false, 0, false, 0, 0, 900
from public.products as set_product
where set_product.slug = 'drop-attack-battle-set'
on conflict (slug) do nothing;

create table public.battle_set_parts (
  set_product_id bigint not null references public.products(id) on delete cascade,
  part_product_id bigint not null references public.products(id) on delete cascade,
  -- Pieces of this kind already out of their set and on the shelf.
  loose integer not null default 0 check (loose >= 0),
  primary key (set_product_id, part_product_id),
  check (set_product_id <> part_product_id)
);

alter table public.battle_set_parts enable row level security;
create policy battle_set_parts_manager_read on public.battle_set_parts for select to authenticated
  using (private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role]));
grant select on public.battle_set_parts to authenticated;

insert into public.battle_set_parts (set_product_id, part_product_id)
select set_product.id, part.id
from public.products as set_product
join public.products as part on part.slug in ('impact-drake-9-60lr', 'hover-wyvern-3-85n', 'drop-attack-arena')
where set_product.slug = 'drop-attack-battle-set'
on conflict do nothing;

create or replace function private.follow_battle_sets()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  link public.battle_set_parts%rowtype;
  sealed public.products%rowtype;
  piece public.products%rowtype;
  leaving integer;
  from_loose integer;
  to_open integer;
  change integer;
begin
  -- Its own lines, opening stock, and the explicit counts below are not sales to follow.
  if new.reason in ('initial'::public.inventory_reason, 'set_opened'::public.inventory_reason, 'set_linked'::public.inventory_reason)
    or coalesce(current_setting('gd.battle_sets_quiet', true), '') = 'on' then
    return null;
  end if;

  -- A piece moved by itself: sold or written off, or back on the shelf.
  for link in select * from public.battle_set_parts where part_product_id = new.product_id for update loop
    if new.delta > 0 then
      update public.battle_set_parts set loose = loose + new.delta
      where set_product_id = link.set_product_id and part_product_id = link.part_product_id;
    else
      leaving := -new.delta;
      from_loose := least(link.loose, leaving);
      to_open := leaving - from_loose;
      update public.battle_set_parts set loose = loose - from_loose
      where set_product_id = link.set_product_id and part_product_id = link.part_product_id;
      if to_open > 0 then
        select * into sealed from public.products where id = link.set_product_id for update;
        to_open := least(to_open, sealed.stock_quantity);
        if to_open > 0 then
          update public.products set stock_quantity = sealed.stock_quantity - to_open where id = sealed.id;
          insert into public.inventory_movements (product_id, delta, stock_after, reason, actor_user_id, order_id, note)
          values (sealed.id, -to_open, sealed.stock_quantity - to_open, 'set_opened'::public.inventory_reason,
            new.actor_user_id, new.order_id,
            'Aperto per vendere da solo: ' || coalesce((select name from public.products where id = new.product_id), 'un pezzo'));
          update public.battle_set_parts set loose = loose + to_open
          where set_product_id = link.set_product_id and part_product_id <> link.part_product_id;
        end if;
      end if;
    end if;
  end loop;

  -- A sealed set moved: each piece it holds is that much more, or less, available.
  for link in select * from public.battle_set_parts where set_product_id = new.product_id loop
    select * into piece from public.products where id = link.part_product_id for update;
    change := greatest(-piece.stock_quantity, new.delta);
    if change <> 0 then
      update public.products set stock_quantity = piece.stock_quantity + change where id = piece.id;
      insert into public.inventory_movements (product_id, delta, stock_after, reason, actor_user_id, order_id, note)
      values (piece.id, change, piece.stock_quantity + change, 'set_linked'::public.inventory_reason,
        new.actor_user_id, new.order_id,
        case when change < 0 then 'Uscito con un set sigillato' else 'Rientrato con un set sigillato' end);
    end if;
  end loop;

  return null;
end;
$$;

revoke all on function private.follow_battle_sets() from public, anon, authenticated, service_role;

create trigger follow_battle_sets
after insert on public.inventory_movements
for each row execute function private.follow_battle_sets();

-- A batch opened by hand: sealed sets become loose pieces. What the shop can sell is unchanged.
create or replace function public.open_battle_sets(p_set_slug text, p_count integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  sealed public.products%rowtype;
begin
  if not private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role]) then
    raise exception using errcode = '42501', message = 'GD_INVENTORY_MANAGER_REQUIRED';
  end if;
  if p_count is null or p_count < 1 or p_count > 1000 then
    raise exception using errcode = '22023', message = 'GD_BATTLE_SET_COUNT_INVALID';
  end if;
  select * into sealed from public.products where slug = p_set_slug for update;
  if not found or not exists (select 1 from public.battle_set_parts where set_product_id = sealed.id) then
    raise exception using errcode = 'P0002', message = 'GD_BATTLE_SET_NOT_FOUND';
  end if;
  if sealed.stock_quantity < p_count then
    raise exception using errcode = '23514', message = 'GD_NOT_ENOUGH_SEALED_SETS';
  end if;

  update public.products set stock_quantity = sealed.stock_quantity - p_count where id = sealed.id;
  insert into public.inventory_movements (product_id, delta, stock_after, reason, actor_user_id, note)
  values (sealed.id, -p_count, sealed.stock_quantity - p_count, 'set_opened'::public.inventory_reason,
    (select auth.uid()), 'Aperti a mano: ' || p_count || ' set');
  update public.battle_set_parts set loose = loose + p_count where set_product_id = sealed.id;

  insert into public.audit_events (actor_user_id, action, entity_type, entity_id, before_state, after_state)
  values ((select auth.uid()), 'battle_set.opened', 'products', sealed.id::text,
    jsonb_build_object('sealed', sealed.stock_quantity), jsonb_build_object('sealed', sealed.stock_quantity - p_count, 'opened', p_count));
  return sealed.stock_quantity - p_count;
end;
$$;

-- A physical count: sealed sets and loose pieces as counted on the shelf. Every piece's
-- availability becomes its loose count plus the sealed sets.
create or replace function public.count_battle_set(p_set_slug text, p_sealed integer, p_loose jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  sealed public.products%rowtype;
  link public.battle_set_parts%rowtype;
  piece public.products%rowtype;
  counted integer;
  target integer;
  result jsonb := '[]'::jsonb;
begin
  if not private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role]) then
    raise exception using errcode = '42501', message = 'GD_INVENTORY_MANAGER_REQUIRED';
  end if;
  if p_sealed is null or p_sealed < 0 or p_sealed > 10000 or p_loose is null or jsonb_typeof(p_loose) <> 'object' then
    raise exception using errcode = '22023', message = 'GD_BATTLE_SET_COUNT_INVALID';
  end if;
  select * into sealed from public.products where slug = p_set_slug for update;
  if not found or not exists (select 1 from public.battle_set_parts where set_product_id = sealed.id) then
    raise exception using errcode = 'P0002', message = 'GD_BATTLE_SET_NOT_FOUND';
  end if;

  -- These lines state a count; the trigger must not read them as sales.
  perform set_config('gd.battle_sets_quiet', 'on', true);

  if sealed.stock_quantity <> p_sealed then
    update public.products set stock_quantity = p_sealed where id = sealed.id;
    insert into public.inventory_movements (product_id, delta, stock_after, reason, actor_user_id, note)
    values (sealed.id, p_sealed - sealed.stock_quantity, p_sealed, 'manual_adjustment'::public.inventory_reason,
      (select auth.uid()), 'Conteggio fisico: set sigillati');
  end if;

  for link in select * from public.battle_set_parts where set_product_id = sealed.id for update loop
    select * into piece from public.products where id = link.part_product_id for update;
    if coalesce(p_loose ->> piece.slug, '') !~ '^[0-9]{1,5}$' then
      raise exception using errcode = '22023', message = 'GD_BATTLE_SET_COUNT_INVALID';
    end if;
    counted := (p_loose ->> piece.slug)::integer;
    target := counted + p_sealed;
    update public.battle_set_parts set loose = counted
    where set_product_id = link.set_product_id and part_product_id = link.part_product_id;
    if piece.stock_quantity <> target then
      update public.products set stock_quantity = target where id = piece.id;
      insert into public.inventory_movements (product_id, delta, stock_after, reason, actor_user_id, note)
      values (piece.id, target - piece.stock_quantity, target, 'manual_adjustment'::public.inventory_reason,
        (select auth.uid()), 'Conteggio fisico: ' || counted || ' sciolti + ' || p_sealed || ' nei set sigillati');
    end if;
    result := result || jsonb_build_object('slug', piece.slug, 'loose', counted, 'available', target);
  end loop;

  perform set_config('gd.battle_sets_quiet', 'off', true);

  insert into public.audit_events (actor_user_id, action, entity_type, entity_id, before_state, after_state)
  values ((select auth.uid()), 'battle_set.counted', 'products', sealed.id::text,
    jsonb_build_object('sealed', sealed.stock_quantity), jsonb_build_object('sealed', p_sealed, 'pieces', result));
  return jsonb_build_object('sealed', p_sealed, 'pieces', result);
end;
$$;

revoke all on function public.open_battle_sets(text, integer) from public, anon, authenticated, service_role;
revoke all on function public.count_battle_set(text, integer, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.open_battle_sets(text, integer) to authenticated;
grant execute on function public.count_battle_set(text, integer, jsonb) to authenticated;

-- Where the shelf stands today, until the owner's count: every top sold loose since the
-- 2026-10-05 listing opened one set, so the sets opened are at least the most-sold top.
do $$
declare
  sealed public.products%rowtype;
  opened integer;
  link record;
  target integer;
begin
  select * into sealed from public.products where slug = 'drop-attack-battle-set' for update;
  if not found then
    return;
  end if;
  perform set_config('gd.battle_sets_quiet', 'on', true);

  select coalesce(max(taken), 0) into opened
  from (
    select coalesce(-sum(movement.delta) filter (where movement.reason not in ('initial', 'set_opened', 'set_linked')), 0) as taken
    from public.battle_set_parts as parts
    left join public.inventory_movements as movement on movement.product_id = parts.part_product_id
    where parts.set_product_id = sealed.id
    group by parts.part_product_id
  ) as per_piece;
  opened := least(greatest(opened, 0), sealed.stock_quantity);

  if opened > 0 then
    update public.products set stock_quantity = sealed.stock_quantity - opened where id = sealed.id;
    insert into public.inventory_movements (product_id, delta, stock_after, reason, note)
    values (sealed.id, -opened, sealed.stock_quantity - opened, 'set_opened'::public.inventory_reason,
      'Set aperti per le trottole vendute sciolte dal 05/10/2026');
  end if;

  for link in
    select parts.part_product_id, piece.stock_quantity,
      opened - coalesce(-sum(movement.delta) filter (where movement.reason not in ('initial', 'set_opened', 'set_linked')), 0) as loose
    from public.battle_set_parts as parts
    join public.products as piece on piece.id = parts.part_product_id
    left join public.inventory_movements as movement on movement.product_id = parts.part_product_id
    where parts.set_product_id = sealed.id
    group by parts.part_product_id, piece.stock_quantity
  loop
    update public.battle_set_parts set loose = greatest(link.loose, 0)
    where set_product_id = sealed.id and part_product_id = link.part_product_id;
    target := greatest(link.loose, 0) + sealed.stock_quantity - opened;
    if link.stock_quantity <> target then
      update public.products set stock_quantity = target where id = link.part_product_id;
      insert into public.inventory_movements (product_id, delta, stock_after, reason, note)
      values (link.part_product_id, target - link.stock_quantity, target, 'set_linked'::public.inventory_reason,
        'Disponibilità legata ai set: sciolti + set sigillati');
    end if;
  end loop;

  perform set_config('gd.battle_sets_quiet', 'off', true);
end;
$$;

commit;
