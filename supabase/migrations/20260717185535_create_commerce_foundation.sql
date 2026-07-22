create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.publication_status as enum ('draft', 'published', 'archived');
create type public.availability_override as enum ('preorder', 'incoming');
create type public.stock_status as enum ('disponibile', 'in-arrivo', 'pre-ordine', 'esaurito');
create type public.blade_type as enum ('attacco', 'difesa', 'stamina', 'bilanciato');
create type public.promo_tag as enum ('novita', 'offerta', 'limited', 'esclusiva');
create type public.staff_role as enum ('owner', 'admin', 'editor');
create type public.discount_kind as enum ('percentage', 'fixed');
create type public.order_status as enum ('pending', 'confirmed', 'processing', 'shipped', 'completed', 'cancelled');
create type public.payment_status as enum ('pending', 'authorized', 'paid', 'failed', 'refunded');
create type public.inventory_reason as enum (
  'initial',
  'manual_adjustment',
  'order_reserved',
  'order_cancelled',
  'return',
  'damage'
);
create type public.enablement_check_status as enum ('pending', 'passed', 'failed');
create type public.product_relation_type as enum ('related', 'upsell');

create table public.site_settings (
  singleton boolean primary key default true check (singleton),
  accept_orders boolean not null default false,
  max_quantity_per_line integer not null default 10 check (max_quantity_per_line between 1 and 100),
  currency text not null default 'EUR' check (currency = 'EUR'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.site_settings (singleton, accept_orders)
values (true, false);

create table public.categories (
  id bigint generated always as identity primary key,
  slug text not null unique check (slug = lower(slug)),
  name text not null,
  tagline text not null,
  description text not null,
  active boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id bigint generated always as identity primary key,
  category_id bigint not null references public.categories(id),
  slug text not null unique check (slug = lower(slug)),
  sku text not null unique check (sku = lower(sku)),
  name text not null,
  tagline text not null,
  description text not null,
  price_cents integer not null check (price_cents >= 0),
  compare_at_price_cents integer check (compare_at_price_cents > price_cents),
  currency text not null default 'EUR' check (currency = 'EUR'),
  publication_status public.publication_status not null default 'draft',
  active boolean not null default false,
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  availability_override public.availability_override,
  preorder_allocation integer not null default 0 check (preorder_allocation >= 0),
  stock_status public.stock_status generated always as (
    case
      when availability_override = 'preorder'::public.availability_override then 'pre-ordine'::public.stock_status
      when availability_override = 'incoming'::public.availability_override then 'in-arrivo'::public.stock_status
      when stock_quantity > 0 then 'disponibile'::public.stock_status
      else 'esaurito'::public.stock_status
    end
  ) stored not null,
  is_purchasable boolean generated always as (
    active
    and publication_status = 'published'::public.publication_status
    and (
      stock_quantity > 0
      or (
        availability_override = 'preorder'::public.availability_override
        and preorder_allocation > 0
      )
    )
    and availability_override is distinct from 'incoming'::public.availability_override
  ) stored,
  blade_type public.blade_type,
  rating numeric(2,1) not null default 0 check (rating between 0 and 5),
  review_count integer not null default 0 check (review_count >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (availability_override = 'preorder'::public.availability_override or preorder_allocation = 0),
  check (availability_override <> 'preorder'::public.availability_override or preorder_allocation > 0)
);

create index products_category_id_idx on public.products(category_id);
create index products_public_catalog_idx
  on public.products(category_id, sort_order)
  where publication_status = 'published' and active;

create table public.product_images (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.products(id) on delete cascade,
  src text not null,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  alt text not null,
  sort_order integer not null default 0,
  published boolean not null default false,
  unique (product_id, sort_order)
);

create table public.product_specs (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.products(id) on delete cascade,
  label text not null,
  value text not null,
  sort_order integer not null default 0,
  unique (product_id, sort_order)
);

create table public.product_features (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.products(id) on delete cascade,
  title text not null,
  description text not null,
  sort_order integer not null default 0,
  unique (product_id, sort_order)
);

create table public.product_box_contents (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.products(id) on delete cascade,
  content text not null,
  sort_order integer not null default 0,
  unique (product_id, sort_order)
);

create table public.product_tags (
  product_id bigint not null references public.products(id) on delete cascade,
  tag public.promo_tag not null,
  primary key (product_id, tag)
);

create table public.product_relations (
  product_id bigint not null references public.products(id) on delete cascade,
  related_product_id bigint not null references public.products(id) on delete cascade,
  relation_type public.product_relation_type not null default 'related',
  sort_order integer not null default 0,
  primary key (product_id, related_product_id, relation_type),
  check (product_id <> related_product_id)
);

create table public.bundles (
  id bigint generated always as identity primary key,
  slug text not null unique check (slug = lower(slug)),
  eyebrow text not null,
  title_line_one text not null,
  title_line_two text not null,
  description text not null,
  price_cents integer not null check (price_cents >= 0),
  compare_at_price_cents integer not null check (compare_at_price_cents > price_cents),
  hero_product_id bigint not null references public.products(id),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bundle_items (
  bundle_id bigint not null references public.bundles(id) on delete cascade,
  product_id bigint not null references public.products(id),
  quantity integer not null default 1 check (quantity > 0),
  sort_order integer not null default 0,
  primary key (bundle_id, product_id)
);

create table public.shipping_methods (
  id bigint generated always as identity primary key,
  code text not null unique check (code = lower(code)),
  name text not null,
  price_cents integer not null check (price_cents >= 0),
  free_from_cents integer check (free_from_cents >= 0),
  active boolean not null default false,
  sort_order integer not null default 0
);

create table public.coupons (
  id bigint generated always as identity primary key,
  code text not null unique check (code = upper(code)),
  discount_kind public.discount_kind not null,
  discount_value integer not null check (discount_value > 0),
  minimum_subtotal_cents integer not null default 0 check (minimum_subtotal_cents >= 0),
  maximum_discount_cents integer check (maximum_discount_cents > 0),
  usage_limit integer check (usage_limit > 0),
  used_count integer not null default 0 check (used_count >= 0),
  starts_at timestamptz,
  expires_at timestamptz,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (usage_limit is null or used_count <= usage_limit),
  check (expires_at is null or starts_at is null or expires_at > starts_at),
  check (
    (discount_kind = 'percentage'::public.discount_kind and discount_value between 1 and 100)
    or discount_kind = 'fixed'::public.discount_kind
  )
);

create table public.customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customer_addresses (
  id bigint generated always as identity primary key,
  customer_id uuid not null references public.customer_profiles(user_id) on delete cascade,
  label text not null,
  recipient_name text not null,
  line_one text not null,
  line_two text,
  city text not null,
  province text not null,
  postal_code text not null,
  country_code text not null default 'IT' check (char_length(country_code) = 2),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.staff_role not null,
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete restrict
);

create table public.orders (
  id bigint generated always as identity primary key,
  order_number text not null unique,
  customer_id uuid references auth.users(id) on delete set null,
  email text not null,
  phone text,
  status public.order_status not null default 'pending',
  payment_status public.payment_status not null default 'pending',
  currency text not null default 'EUR' check (currency = 'EUR'),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  shipping_cents integer not null check (shipping_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  shipping_method_code text not null,
  coupon_code text,
  shipping_address_snapshot jsonb not null,
  billing_address_snapshot jsonb not null,
  notes text,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, idempotency_key),
  check (discount_cents <= subtotal_cents),
  check (total_cents = subtotal_cents - discount_cents + shipping_cents)
);

create unique index guest_orders_idempotency_idx
  on public.orders(lower(email), idempotency_key)
  where customer_id is null;
create index orders_customer_created_idx on public.orders(customer_id, created_at desc);

create table public.order_items (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders(id) on delete restrict,
  product_id bigint references public.products(id) on delete set null,
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  line_total_cents integer not null check (line_total_cents = quantity * unit_price_cents),
  product_name_snapshot text not null,
  sku_snapshot text not null,
  image_src_snapshot text not null,
  unique (order_id, sku_snapshot)
);

create table public.coupon_redemptions (
  id bigint generated always as identity primary key,
  coupon_id bigint not null references public.coupons(id) on delete restrict,
  order_id bigint not null unique references public.orders(id) on delete restrict,
  customer_id uuid references auth.users(id) on delete set null,
  email_normalized text not null check (email_normalized = lower(email_normalized)),
  discount_cents integer not null check (discount_cents > 0),
  redeemed_at timestamptz not null default now()
);

create table public.inventory_movements (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.products(id) on delete restrict,
  delta integer not null check (delta <> 0),
  stock_after integer not null check (stock_after >= 0),
  reason public.inventory_reason not null,
  order_id bigint references public.orders(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index inventory_movements_product_created_idx
  on public.inventory_movements(product_id, created_at desc);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create table public.order_enablement_checks (
  key text primary key,
  label text not null,
  status public.enablement_check_status not null default 'pending',
  evidence text,
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger categories_set_updated_at before update on public.categories
for each row execute function private.set_updated_at();
create trigger products_set_updated_at before update on public.products
for each row execute function private.set_updated_at();
create trigger bundles_set_updated_at before update on public.bundles
for each row execute function private.set_updated_at();
create trigger coupons_set_updated_at before update on public.coupons
for each row execute function private.set_updated_at();
create trigger customer_profiles_set_updated_at before update on public.customer_profiles
for each row execute function private.set_updated_at();
create trigger customer_addresses_set_updated_at before update on public.customer_addresses
for each row execute function private.set_updated_at();
create trigger staff_profiles_set_updated_at before update on public.staff_profiles
for each row execute function private.set_updated_at();
create trigger orders_set_updated_at before update on public.orders
for each row execute function private.set_updated_at();
create trigger order_enablement_checks_set_updated_at before update on public.order_enablement_checks
for each row execute function private.set_updated_at();
