-- Organization membership for the Vinted and Battle-Set tables (2026-10-12).
--
-- PR #50 added inbound_emails, vinted_sales, and battle_set_parts before the organization
-- schema (PR #51) existed. This migration ties them in when both sets of migrations are
-- present: it is a no-op on CI, which never has public.organizations.
--
-- What it does:
--   1. Adds organization_id to all three tables and backfills it:
--      - inbound_emails and vinted_sales: always Gear Drop (the Vinted seller account).
--      - battle_set_parts: inherits from set_product.
--   2. Adds immutability triggers (prevent_organization_change) on all three.
--   3. For battle_set_parts: a BEFORE INSERT trigger fills organization_id from the set
--      product, and composite FKs make cross-company links impossible.
--   4. For inbound_emails and vinted_sales: a BEFORE INSERT trigger fills organization_id
--      with Gear Drop when the caller leaves it null, so existing functions need not change.
--   5. Replaces the has_staff_role SELECT policies with organization-scoped ones that match
--      the production style from 20261009091003_rewrite_rls_for_organizations.sql.
--   6. Rewrites the three functions that look products up by slug so they never cross into
--      another company's catalogue.

do $$
declare
  geardrop_id bigint;
begin
  -- Nothing to do on CI: the organizations table does not exist there.
  if to_regclass('public.organizations') is null then
    return;
  end if;

  select id into geardrop_id from public.organizations where slug = 'geardrop';
  if geardrop_id is null then
    raise exception using errcode = 'P0002',
      message = 'GD_ORG_GEARDROP_NOT_FOUND: expected organizations row with slug=geardrop';
  end if;

  -- -----------------------------------------------------------------------
  -- 1a. inbound_emails: organization_id — always Gear Drop.
  -- -----------------------------------------------------------------------
  -- DDL takes no PL/pgSQL variables: the company id is spelled into the statement. A dry run
  -- against production (2026-10-12) failed on "default geardrop_id" as a column reference.
  execute format(
    'alter table public.inbound_emails add column organization_id bigint not null default %s references public.organizations(id) on delete restrict',
    geardrop_id
  );
  -- Column backfilled via the default; drop it so future rows must supply it explicitly
  -- (or rely on the BEFORE INSERT trigger below).
  alter table public.inbound_emails alter column organization_id drop default;

  -- -----------------------------------------------------------------------
  -- 1b. vinted_sales: organization_id — always Gear Drop.
  -- -----------------------------------------------------------------------
  -- DDL takes no PL/pgSQL variables: the company id is spelled into the statement. A dry run
  -- against production (2026-10-12) failed on "default geardrop_id" as a column reference.
  execute format(
    'alter table public.vinted_sales add column organization_id bigint not null default %s references public.organizations(id) on delete restrict',
    geardrop_id
  );
  alter table public.vinted_sales alter column organization_id drop default;

  -- -----------------------------------------------------------------------
  -- 1c. battle_set_parts: organization_id — inherited from the set product.
  -- -----------------------------------------------------------------------
  alter table public.battle_set_parts
    add column organization_id bigint
      references public.organizations(id) on delete restrict;

  -- Backfill from the set product (the set_product_id row already exists).
  update public.battle_set_parts as bsp
  set organization_id = p.organization_id
  from public.products as p
  where p.id = bsp.set_product_id;

  -- Now enforce NOT NULL.
  alter table public.battle_set_parts alter column organization_id set not null;

  -- -----------------------------------------------------------------------
  -- 2. Immutability triggers.
  -- -----------------------------------------------------------------------
  -- private.prevent_organization_change() was created by PR #51 (gestionale-cloud).
  create trigger prevent_organization_change_inbound_emails
    before update on public.inbound_emails
    for each row execute function private.prevent_organization_change();

  create trigger prevent_organization_change_vinted_sales
    before update on public.vinted_sales
    for each row execute function private.prevent_organization_change();

  create trigger prevent_organization_change_battle_set_parts
    before update on public.battle_set_parts
    for each row execute function private.prevent_organization_change();

  -- -----------------------------------------------------------------------
  -- 3a. battle_set_parts: BEFORE INSERT trigger fills organization_id from set_product.
  -- -----------------------------------------------------------------------
  -- Reuse private.inherit_organization(tg_argv[0]=parent_table, tg_argv[1]=parent_id_col).
  create trigger inherit_organization_battle_set_parts
    before insert on public.battle_set_parts
    for each row execute function private.inherit_organization('products', 'set_product_id');

  -- 3b. Composite FKs: set and part must belong to the same company.
  -- The organization schema adds (id, organization_id) unique to products (via PR #51).
  alter table public.battle_set_parts
    add constraint battle_set_parts_set_org_fk
      foreign key (set_product_id, organization_id)
      references public.products(id, organization_id),
    add constraint battle_set_parts_part_org_fk
      foreign key (part_product_id, organization_id)
      references public.products(id, organization_id);

  -- -----------------------------------------------------------------------
  -- 4. BEFORE INSERT triggers for inbound_emails and vinted_sales that fill
  --    organization_id with Gear Drop when the caller leaves it null.
  -- -----------------------------------------------------------------------
  -- We create dedicated fill functions rather than reuse inherit_organization because
  -- these tables belong to a specific company by policy, not by a parent row.

  create or replace function private.fill_inbound_email_organization()
  returns trigger language plpgsql security definer set search_path = '' as $fn$
  declare
    gd_id bigint;
  begin
    if new.organization_id is null then
      select id into gd_id from public.organizations where slug = 'geardrop';
      new.organization_id := gd_id;
    end if;
    return new;
  end;
  $fn$;

  revoke all on function private.fill_inbound_email_organization() from public;

  create trigger fill_inbound_email_organization
    before insert on public.inbound_emails
    for each row execute function private.fill_inbound_email_organization();

  create or replace function private.fill_vinted_sale_organization()
  returns trigger language plpgsql security definer set search_path = '' as $fn$
  declare
    gd_id bigint;
  begin
    if new.organization_id is null then
      -- Inherit from the inbound email, or fall back to geardrop.
      select coalesce(e.organization_id, (select id from public.organizations where slug = 'geardrop'))
      into gd_id
      from public.inbound_emails as e
      where e.id = new.inbound_email_id;
      new.organization_id := gd_id;
    end if;
    return new;
  end;
  $fn$;

  revoke all on function private.fill_vinted_sale_organization() from public;

  create trigger fill_vinted_sale_organization
    before insert on public.vinted_sales
    for each row execute function private.fill_vinted_sale_organization();

  -- -----------------------------------------------------------------------
  -- 5. Organization-scoped RLS policies (production style from
  --    20261009091003_rewrite_rls_for_organizations.sql).
  -- -----------------------------------------------------------------------
  -- Drop the old global has_staff_role policies.
  drop policy inbound_emails_manager_read on public.inbound_emails;
  drop policy vinted_sales_manager_read on public.vinted_sales;
  drop policy battle_set_parts_manager_read on public.battle_set_parts;

  -- Replace with org-scoped ones: a caller sees only their company's rows.
  create policy inbound_emails_manager_read on public.inbound_emails
    for select to authenticated
    using (
      organization_id = any (
        (select private.member_organization_ids(
          array['owner'::public.staff_role, 'admin'::public.staff_role]
        ))::bigint[]
      )
    );

  create policy vinted_sales_manager_read on public.vinted_sales
    for select to authenticated
    using (
      organization_id = any (
        (select private.member_organization_ids(
          array['owner'::public.staff_role, 'admin'::public.staff_role]
        ))::bigint[]
      )
    );

  create policy battle_set_parts_manager_read on public.battle_set_parts
    for select to authenticated
    using (
      organization_id = any (
        (select private.member_organization_ids(
          array['owner'::public.staff_role, 'admin'::public.staff_role]
        ))::bigint[]
      )
    );

  -- -----------------------------------------------------------------------
  -- 6. Rewrite functions to scope product lookups to the row's own company.
  -- -----------------------------------------------------------------------

  -- private.apply_vinted_sale_lines: restrict slug lookup to the Gear Drop catalogue.
  -- Without this a slug that exists in both companies would return an arbitrary product.
  create or replace function private.apply_vinted_sale_lines(p_sale_id bigint, p_lines jsonb, p_actor uuid)
  returns jsonb language plpgsql security definer set search_path = '' as $fn$
  declare
    sale public.vinted_sales%rowtype;
    line jsonb;
    target public.products%rowtype;
    wanted integer;
    taken integer;
    release boolean;
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

      -- Restrict to the sale's own organization so a slug shared across companies
      -- always resolves to the Gear Drop product, not an Oryvenne one.
      select * into target
      from public.products
      where slug = line ->> 'slug'
        and organization_id = sale.organization_id
      for update;
      if not found then
        raise exception using errcode = 'P0002', message = 'GD_PRODUCT_NOT_FOUND';
      end if;

      release := target.availability_override = 'preorder'::public.availability_override;
      taken := least(wanted, case when release then target.preorder_allocation else target.stock_quantity end);
      if taken > 0 and release then
        update public.products set preorder_allocation = target.preorder_allocation - taken where id = target.id;
      elsif taken > 0 then
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
  $fn$;

  revoke all on function private.apply_vinted_sale_lines(bigint, jsonb, uuid) from public, anon, authenticated, service_role;

  -- public.open_battle_sets: restrict the sealed-set lookup to the caller's own companies.
  -- The function is security definer so we check membership explicitly.
  create or replace function public.open_battle_sets(p_set_slug text, p_count integer)
  returns integer language plpgsql security definer set search_path = '' as $fn$
  declare
    sealed public.products%rowtype;
  begin
    if not private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role]) then
      raise exception using errcode = '42501', message = 'GD_INVENTORY_MANAGER_REQUIRED';
    end if;
    if p_count is null or p_count < 1 or p_count > 1000 then
      raise exception using errcode = '22023', message = 'GD_BATTLE_SET_COUNT_INVALID';
    end if;
    -- Restrict to one of the caller's companies: prevents slug collisions across orgs.
    select * into sealed
    from public.products
    where slug = p_set_slug
      and organization_id = any (
        (select private.member_organization_ids(
          array['owner'::public.staff_role, 'admin'::public.staff_role]
        ))::bigint[]
      )
    for update;
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
  $fn$;

  revoke all on function public.open_battle_sets(text, integer) from public, anon, authenticated, service_role;
  grant execute on function public.open_battle_sets(text, integer) to authenticated;

  -- public.count_battle_set: same org restriction as open_battle_sets.
  create or replace function public.count_battle_set(p_set_slug text, p_sealed integer, p_loose jsonb)
  returns jsonb language plpgsql security definer set search_path = '' as $fn$
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
    select * into sealed
    from public.products
    where slug = p_set_slug
      and organization_id = any (
        (select private.member_organization_ids(
          array['owner'::public.staff_role, 'admin'::public.staff_role]
        ))::bigint[]
      )
    for update;
    if not found or not exists (select 1 from public.battle_set_parts where set_product_id = sealed.id) then
      raise exception using errcode = 'P0002', message = 'GD_BATTLE_SET_NOT_FOUND';
    end if;

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
  $fn$;

  revoke all on function public.count_battle_set(text, integer, jsonb) from public, anon, authenticated, service_role;
  grant execute on function public.count_battle_set(text, integer, jsonb) to authenticated;

end;
$$;
