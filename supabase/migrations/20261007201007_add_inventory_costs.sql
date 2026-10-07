-- Warehouse at cost.
--
-- Goods enter with a cost: a supplier document (invoice or delivery note) lists products,
-- quantities and unit costs net of VAT, plus inbound costs (freight, duties) that are spread
-- over its lines. Confirming it raises the stock and the weighted average cost of each product.
-- Every stock movement is then valued at the average cost of its moment, in a separate table
-- only owners and admins can read, so the cost of the goods an order took never changes
-- afterwards. Orders keep the VAT rate, payment fee, courier and packaging costs the profit
-- needs. Everything belongs to one company.

-- ---------------------------------------------------------------------------------------
-- Company defaults, courier cost per method, order fields.
-- ---------------------------------------------------------------------------------------

alter table public.organizations
  add column default_vat_rate_bp integer not null default 2200
    constraint organizations_default_vat_rate_check check (default_vat_rate_bp between 0 and 10000),
  add column packaging_cost_cents integer not null default 0
    constraint organizations_packaging_cost_check check (packaging_cost_cents between 0 and 100000);

comment on column public.organizations.default_vat_rate_bp is
  'VAT rate of sales in basis points (2200 = 22%), snapshotted on every new order.';
comment on column public.organizations.packaging_cost_cents is
  'Standard packaging cost per shipped order, net of VAT.';

-- What the courier costs the company for this method; null while unknown.
alter table public.shipping_methods
  add column cost_cents integer
    constraint shipping_methods_cost_check check (cost_cents between 0 and 1000000);

-- Existing orders are Gear Drop's Italian sales: 22%. New orders take the company's rate.
alter table public.orders
  add column vat_rate_bp integer not null default 2200
    constraint orders_vat_rate_check check (vat_rate_bp between 0 and 10000);
alter table public.orders alter column vat_rate_bp drop default;

alter table public.orders
  add column payment_fee_cents integer
    constraint orders_payment_fee_check check (payment_fee_cents between 0 and 10000000),
  add column payment_fee_source text
    constraint orders_payment_fee_source_check check (payment_fee_source in ('stripe', 'manual')),
  add column shipping_cost_cents integer
    constraint orders_shipping_cost_check check (shipping_cost_cents between 0 and 1000000),
  add column packaging_cost_cents integer
    constraint orders_packaging_cost_check check (packaging_cost_cents between 0 and 100000),
  add constraint orders_payment_fee_pair_check check ((payment_fee_cents is null) = (payment_fee_source is null));

create or replace function private.snapshot_order_vat_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.vat_rate_bp is null then
    select organization.default_vat_rate_bp into new.vat_rate_bp
    from public.organizations as organization
    where organization.id = new.organization_id;
  end if;
  return new;
end;
$$;
revoke all on function private.snapshot_order_vat_rate() from public;

create trigger orders_snapshot_vat_rate
before insert on public.orders
for each row execute function private.snapshot_order_vat_rate();

-- ---------------------------------------------------------------------------------------
-- Movement reasons for goods receipts. Used by the functions of the next migration.
-- ---------------------------------------------------------------------------------------

alter type public.inventory_reason add value if not exists 'receipt';
alter type public.inventory_reason add value if not exists 'receipt_reversal';

-- ---------------------------------------------------------------------------------------
-- Suppliers (tier A).
-- ---------------------------------------------------------------------------------------

create type public.vat_regime as enum ('intra_ue', 'nazionale', 'extra_ue');

create table public.suppliers (
  id bigint generated always as identity primary key,
  organization_id bigint not null references public.organizations (id),
  name text not null constraint suppliers_name_check check (length(btrim(name)) between 1 and 160),
  country_code text not null constraint suppliers_country_check check (country_code ~ '^[A-Z]{2}$'),
  vat_number text constraint suppliers_vat_number_check check (vat_number is null or length(btrim(vat_number)) between 2 and 32),
  vat_regime public.vat_regime not null,
  email text constraint suppliers_email_check check (email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  notes text constraint suppliers_notes_check check (notes is null or length(notes) <= 2000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suppliers_id_organization_key unique (id, organization_id)
);

create unique index suppliers_organization_name_key on public.suppliers (organization_id, lower(btrim(name)));

comment on table public.suppliers is
  'Who the company buys goods from. vat_regime decides how a document is read: intra_ue arrives without VAT, the cost is the taxable amount.';

-- ---------------------------------------------------------------------------------------
-- Goods receipts: the supplier document and its lines (tiers A and B).
-- ---------------------------------------------------------------------------------------

create type public.supplier_document_kind as enum ('invoice', 'delivery_note');
create type public.supplier_receipt_status as enum ('draft', 'confirmed', 'reversed');

create table public.supplier_receipts (
  id bigint generated always as identity primary key,
  organization_id bigint not null references public.organizations (id),
  supplier_id bigint not null,
  document_kind public.supplier_document_kind not null,
  document_number text not null
    constraint supplier_receipts_document_number_check check (length(btrim(document_number)) between 1 and 60),
  document_date date not null,
  vat_regime public.vat_regime not null,
  currency text not null default 'EUR' constraint supplier_receipts_currency_check check (currency = 'EUR'),
  freight_cents integer not null default 0
    constraint supplier_receipts_freight_check check (freight_cents between 0 and 100000000),
  duties_cents integer not null default 0
    constraint supplier_receipts_duties_check check (duties_cents between 0 and 100000000),
  notes text constraint supplier_receipts_notes_check check (notes is null or length(notes) <= 2000),
  status public.supplier_receipt_status not null default 'draft',
  created_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users (id) on delete set null,
  reversed_at timestamptz,
  reversed_by uuid references auth.users (id) on delete set null,
  reversal_reason text
    constraint supplier_receipts_reversal_reason_check check (reversal_reason is null or length(btrim(reversal_reason)) between 3 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_receipts_id_organization_key unique (id, organization_id),
  constraint supplier_receipts_supplier_fkey foreign key (supplier_id, organization_id)
    references public.suppliers (id, organization_id),
  constraint supplier_receipts_confirmation_check check ((status = 'draft') = (confirmed_at is null)),
  constraint supplier_receipts_reversal_check check (
    (status = 'reversed') = (reversed_at is not null) and (reversed_at is null) = (reversal_reason is null)
  )
);

create index supplier_receipts_organization_idx on public.supplier_receipts (organization_id, document_date desc, id desc);
create index supplier_receipts_supplier_idx on public.supplier_receipts (supplier_id);
create unique index supplier_receipts_document_key
  on public.supplier_receipts (organization_id, supplier_id, document_kind, lower(btrim(document_number)));

comment on table public.supplier_receipts is
  'A supplier invoice or delivery note loaded into the warehouse. Confirmed documents never change: a mistake is reversed with a reason.';

create table public.supplier_receipt_lines (
  id bigint generated always as identity primary key,
  organization_id bigint not null references public.organizations (id),
  receipt_id bigint not null,
  product_id bigint not null,
  quantity integer not null constraint supplier_receipt_lines_quantity_check check (quantity between 1 and 100000),
  unit_cost_cents integer not null
    constraint supplier_receipt_lines_unit_cost_check check (unit_cost_cents between 0 and 100000000),
  -- Written on confirmation: the line's share of freight and duties, and what one piece cost
  -- delivered to the warehouse. The landed totals of a document add up to the document.
  allocated_costs_cents integer constraint supplier_receipt_lines_allocated_check check (allocated_costs_cents >= 0),
  landed_total_cents bigint constraint supplier_receipt_lines_landed_total_check check (landed_total_cents >= 0),
  landed_unit_cost_cents integer constraint supplier_receipt_lines_landed_unit_check check (landed_unit_cost_cents >= 0),
  sort_order integer not null default 0,
  constraint supplier_receipt_lines_id_organization_key unique (id, organization_id),
  constraint supplier_receipt_lines_receipt_product_key unique (receipt_id, product_id),
  constraint supplier_receipt_lines_receipt_fkey foreign key (receipt_id, organization_id)
    references public.supplier_receipts (id, organization_id) on delete cascade,
  constraint supplier_receipt_lines_product_fkey foreign key (product_id, organization_id)
    references public.products (id, organization_id)
);

create index supplier_receipt_lines_organization_idx on public.supplier_receipt_lines (organization_id);
create index supplier_receipt_lines_product_idx on public.supplier_receipt_lines (product_id);

create trigger supplier_receipt_lines_inherit_organization before insert on public.supplier_receipt_lines
  for each row when (new.organization_id is null) execute function private.inherit_organization('supplier_receipts', 'receipt_id');

-- ---------------------------------------------------------------------------------------
-- Weighted average cost per product (tier A, one row per product).
-- ---------------------------------------------------------------------------------------

create table public.inventory_cost_state (
  product_id bigint primary key,
  organization_id bigint not null references public.organizations (id),
  average_cost_cents integer not null
    constraint inventory_cost_state_average_check check (average_cost_cents between 0 and 100000000),
  last_cost_cents integer constraint inventory_cost_state_last_check check (last_cost_cents between 0 and 100000000),
  last_receipt_id bigint,
  source text not null constraint inventory_cost_state_source_check check (source in ('receipt', 'manual')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint inventory_cost_state_product_fkey foreign key (product_id, organization_id)
    references public.products (id, organization_id) on delete cascade,
  constraint inventory_cost_state_receipt_fkey foreign key (last_receipt_id, organization_id)
    references public.supplier_receipts (id, organization_id)
);

create index inventory_cost_state_organization_idx on public.inventory_cost_state (organization_id);

comment on table public.inventory_cost_state is
  'Weighted average cost of one product, net of VAT. Changes only with a confirmed or reversed goods receipt, or an owner''s explicit cost.';

-- ---------------------------------------------------------------------------------------
-- Valued movements (tier C, child of inventory_movements).
-- ---------------------------------------------------------------------------------------

alter table public.inventory_movements add column receipt_line_id bigint;
alter table public.inventory_movements
  add constraint inventory_movements_receipt_line_fkey foreign key (receipt_line_id, organization_id)
    references public.supplier_receipt_lines (id, organization_id);
create index inventory_movements_receipt_line_idx on public.inventory_movements (receipt_line_id)
  where receipt_line_id is not null;

create table public.inventory_movement_costs (
  movement_id bigint primary key references public.inventory_movements (id) on delete cascade,
  unit_cost_cents integer not null
    constraint inventory_movement_costs_unit_check check (unit_cost_cents between 0 and 100000000),
  valued_at timestamptz not null default now(),
  source text not null constraint inventory_movement_costs_source_check check (source in ('average', 'receipt', 'manual'))
);

comment on table public.inventory_movement_costs is
  'The unit cost of each stock movement at its moment. A movement without a row had no known cost: an order that holds it has an incomplete profit.';

-- Every movement is valued at the product's average cost when it happens, unless the goods
-- receipt functions value it themselves. No known cost: no row.
create or replace function private.value_inventory_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reason in ('receipt', 'receipt_reversal') then
    return new;
  end if;
  insert into public.inventory_movement_costs (movement_id, unit_cost_cents, source)
  select new.id, state.average_cost_cents, 'average'
  from public.inventory_cost_state as state
  where state.product_id = new.product_id;
  return new;
end;
$$;
revoke all on function private.value_inventory_movement() from public;

create trigger inventory_movements_value
after insert on public.inventory_movements
for each row execute function private.value_inventory_movement();

-- ---------------------------------------------------------------------------------------
-- Scoping, timestamps, audit.
-- ---------------------------------------------------------------------------------------

create trigger suppliers_prevent_organization_change before update of organization_id on public.suppliers
  for each row execute function private.prevent_organization_change();
create trigger supplier_receipts_prevent_organization_change before update of organization_id on public.supplier_receipts
  for each row execute function private.prevent_organization_change();
create trigger supplier_receipt_lines_prevent_organization_change before update of organization_id on public.supplier_receipt_lines
  for each row execute function private.prevent_organization_change();
create trigger inventory_cost_state_prevent_organization_change before update of organization_id on public.inventory_cost_state
  for each row execute function private.prevent_organization_change();

create trigger suppliers_set_updated_at before update on public.suppliers
  for each row execute function private.set_updated_at();
create trigger supplier_receipts_set_updated_at before update on public.supplier_receipts
  for each row execute function private.set_updated_at();

create trigger suppliers_audit_admin_mutation after insert or update or delete on public.suppliers
  for each row execute function private.audit_admin_mutation();
create trigger supplier_receipts_audit_admin_mutation after insert or update or delete on public.supplier_receipts
  for each row execute function private.audit_admin_mutation();

-- ---------------------------------------------------------------------------------------
-- Row level security: costs are for owners and admins of the company.
-- ---------------------------------------------------------------------------------------

alter table public.suppliers enable row level security;
alter table public.supplier_receipts enable row level security;
alter table public.supplier_receipt_lines enable row level security;
alter table public.inventory_cost_state enable row level security;
alter table public.inventory_movement_costs enable row level security;

revoke all on table public.suppliers, public.supplier_receipts, public.supplier_receipt_lines,
  public.inventory_cost_state, public.inventory_movement_costs from anon, authenticated;
grant select, insert, update on table public.suppliers to authenticated;
grant select, delete on table public.supplier_receipts to authenticated;
grant select on table public.supplier_receipt_lines, public.inventory_cost_state,
  public.inventory_movement_costs to authenticated;

create policy suppliers_manager_read on public.suppliers
  for select to authenticated
  using (organization_id = any ((select private.member_organization_ids(array['owner'::public.staff_role, 'admin'::public.staff_role]))::bigint[]));
create policy suppliers_manager_insert on public.suppliers
  for insert to authenticated
  with check (organization_id = any ((select private.member_organization_ids(array['owner'::public.staff_role, 'admin'::public.staff_role]))::bigint[]));
create policy suppliers_manager_update on public.suppliers
  for update to authenticated
  using (organization_id = any ((select private.member_organization_ids(array['owner'::public.staff_role, 'admin'::public.staff_role]))::bigint[]))
  with check (organization_id = any ((select private.member_organization_ids(array['owner'::public.staff_role, 'admin'::public.staff_role]))::bigint[]));

create policy supplier_receipts_manager_read on public.supplier_receipts
  for select to authenticated
  using (organization_id = any ((select private.member_organization_ids(array['owner'::public.staff_role, 'admin'::public.staff_role]))::bigint[]));
-- Only a draft can be thrown away; a confirmed document is reversed instead.
create policy supplier_receipts_manager_delete_draft on public.supplier_receipts
  for delete to authenticated
  using (
    status = 'draft'
    and organization_id = any ((select private.member_organization_ids(array['owner'::public.staff_role, 'admin'::public.staff_role]))::bigint[])
  );

create policy supplier_receipt_lines_manager_read on public.supplier_receipt_lines
  for select to authenticated
  using (organization_id = any ((select private.member_organization_ids(array['owner'::public.staff_role, 'admin'::public.staff_role]))::bigint[]));

create policy inventory_cost_state_manager_read on public.inventory_cost_state
  for select to authenticated
  using (organization_id = any ((select private.member_organization_ids(array['owner'::public.staff_role, 'admin'::public.staff_role]))::bigint[]));

create policy inventory_movement_costs_manager_read on public.inventory_movement_costs
  for select to authenticated
  using (exists (
    select 1 from public.inventory_movements as movement
    where movement.id = inventory_movement_costs.movement_id
      and movement.organization_id = any ((select private.member_organization_ids(array['owner'::public.staff_role, 'admin'::public.staff_role]))::bigint[])
  ));
