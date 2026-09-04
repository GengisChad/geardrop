-- GEAR//DROP commerce schema.
--
-- Normalized relational model for catalog, inventory, coupons, customers, staff,
-- orders, order lines and audit. See docs/superpowers/specs/2026-07-17-supabase-commerce-backend-design.md §5.
--
-- Conventions:
--   * lowercase snake_case identifiers;
--   * high-write internal entities use `bigint generated always as identity`;
--   * auth.users references stay uuid;
--   * every timestamp is timestamptz; every monetary value is a non-negative integer of EUR cents.
--
-- This migration only creates structure. RLS + grants live in 0002, functions in 0003, seed in 0004.

create extension if not exists pgcrypto with schema extensions;

-- Shared updated_at trigger. Runs as invoker; empty search_path forces schema-qualified refs.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

create table public.categories (
  id          bigint generated always as identity primary key,
  slug        text not null unique,
  name        text not null,
  tagline     text not null default '',
  description text not null default '',
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.products (
  id                     bigint generated always as identity primary key,
  category_id            bigint not null references public.categories (id),
  slug                   text not null unique,
  sku                    text not null unique,
  name                   text not null,
  tagline                text not null default '',
  description            text not null default '',
  price_cents            integer not null,
  compare_at_price_cents integer,
  currency               text not null default 'EUR',
  publication_status     text not null default 'draft',
  active                 boolean not null default true,
  stock_status           text not null,
  stock_quantity         integer not null default 0,
  blade_type             text,
  rating                 numeric(2, 1) not null default 0,
  review_count           integer not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint products_currency_chk           check (currency = 'EUR'),
  constraint products_price_chk              check (price_cents >= 0),
  constraint products_compare_at_chk         check (compare_at_price_cents is null or compare_at_price_cents >= 0),
  constraint products_compare_gt_price_chk   check (compare_at_price_cents is null or compare_at_price_cents > price_cents),
  constraint products_publication_status_chk check (publication_status in ('draft', 'published', 'archived')),
  constraint products_stock_status_chk       check (stock_status in ('disponibile', 'in-arrivo', 'pre-ordine', 'esaurito')),
  constraint products_stock_quantity_chk     check (stock_quantity >= 0),
  constraint products_blade_type_chk         check (blade_type is null or blade_type in ('attacco', 'difesa', 'stamina', 'bilanciato')),
  constraint products_rating_chk             check (rating >= 0 and rating <= 5),
  constraint products_review_count_chk       check (review_count >= 0)
);

create table public.product_images (
  id         bigint generated always as identity primary key,
  product_id bigint not null references public.products (id) on delete cascade,
  path       text not null,
  width      integer not null,
  height     integer not null,
  alt        text not null default '',
  sort_order integer not null default 0,
  published  boolean not null default true,
  constraint product_images_width_chk  check (width > 0),
  constraint product_images_height_chk check (height > 0)
);

create table public.product_specs (
  id         bigint generated always as identity primary key,
  product_id bigint not null references public.products (id) on delete cascade,
  label      text not null,
  value      text not null,
  sort_order integer not null default 0
);

create table public.product_features (
  id          bigint generated always as identity primary key,
  product_id  bigint not null references public.products (id) on delete cascade,
  title       text not null,
  description text not null default '',
  sort_order  integer not null default 0
);

create table public.product_box_contents (
  id         bigint generated always as identity primary key,
  product_id bigint not null references public.products (id) on delete cascade,
  content    text not null,
  sort_order integer not null default 0
);

create table public.product_tags (
  product_id bigint not null references public.products (id) on delete cascade,
  tag        text not null,
  primary key (product_id, tag),
  constraint product_tags_tag_chk check (tag in ('novita', 'offerta', 'limited', 'esclusiva'))
);

create table public.product_relations (
  product_id         bigint not null references public.products (id) on delete cascade,
  related_product_id bigint not null references public.products (id) on delete cascade,
  sort_order         integer not null default 0,
  primary key (product_id, related_product_id),
  constraint product_relations_self_chk check (product_id <> related_product_id)
);

create table public.bundles (
  id                     bigint generated always as identity primary key,
  slug                   text not null unique,
  eyebrow                text not null default '',
  title_line_1           text not null,
  title_line_2           text not null,
  description            text not null default '',
  price_cents            integer not null,
  compare_at_price_cents integer,
  hero_product_id        bigint references public.products (id),
  publication_status     text not null default 'draft',
  active                 boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint bundles_price_chk              check (price_cents >= 0),
  constraint bundles_compare_at_chk         check (compare_at_price_cents is null or compare_at_price_cents >= 0),
  constraint bundles_compare_gt_price_chk   check (compare_at_price_cents is null or compare_at_price_cents > price_cents),
  constraint bundles_publication_status_chk check (publication_status in ('draft', 'published', 'archived'))
);

create table public.bundle_items (
  bundle_id  bigint not null references public.bundles (id) on delete cascade,
  product_id bigint not null references public.products (id) on delete cascade,
  quantity   integer not null default 1,
  sort_order integer not null default 0,
  primary key (bundle_id, product_id),
  constraint bundle_items_quantity_chk check (quantity > 0)
);

-- ---------------------------------------------------------------------------
-- Store configuration, shipping and coupons
-- ---------------------------------------------------------------------------

-- Single-row typed configuration. The id check pins it to exactly one row.
create table public.store_settings (
  id                    integer primary key default 1,
  checkout_enabled      boolean not null default false,
  max_quantity_per_line integer not null default 10,
  default_currency      text not null default 'EUR',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint store_settings_singleton_chk check (id = 1),
  constraint store_settings_currency_chk  check (default_currency = 'EUR'),
  constraint store_settings_max_qty_chk   check (max_quantity_per_line > 0)
);

create table public.shipping_methods (
  code                         text primary key,
  label                        text not null,
  delivery_hint                text not null default '',
  price_cents                  integer not null,
  free_shipping_threshold_cents integer,
  active                       boolean not null default true,
  sort_order                   integer not null default 0,
  constraint shipping_methods_price_chk     check (price_cents >= 0),
  constraint shipping_methods_threshold_chk check (free_shipping_threshold_cents is null or free_shipping_threshold_cents >= 0)
);

create table public.coupons (
  id               bigint generated always as identity primary key,
  code             text not null unique,
  discount_kind    text not null,
  discount_value   integer not null,
  min_subtotal_cents integer,
  max_redemptions  integer,
  redemption_count integer not null default 0,
  starts_at        timestamptz,
  ends_at          timestamptz,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint coupons_kind_chk        check (discount_kind in ('fixed', 'percentage')),
  constraint coupons_value_chk       check (
    (discount_kind = 'fixed' and discount_value >= 0)
    or (discount_kind = 'percentage' and discount_value between 1 and 100)
  ),
  constraint coupons_min_subtotal_chk check (min_subtotal_cents is null or min_subtotal_cents >= 0),
  constraint coupons_max_redemptions_chk check (max_redemptions is null or max_redemptions > 0),
  constraint coupons_redemption_count_chk check (redemption_count >= 0),
  constraint coupons_window_chk       check (starts_at is null or ends_at is null or ends_at > starts_at)
);

-- ---------------------------------------------------------------------------
-- Customer and staff identities
-- ---------------------------------------------------------------------------

create table public.customer_profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  first_name text not null default '',
  last_name  text not null default '',
  phone      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customer_addresses (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  label          text,
  recipient_name text not null default '',
  line1          text not null default '',
  line2          text,
  city           text not null default '',
  province       text not null default '',
  postal_code    text not null default '',
  country        text not null default 'IT',
  phone          text,
  is_default     boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.staff_profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       text not null,
  active     boolean not null default true,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_profiles_role_chk check (role in ('owner', 'admin', 'editor'))
);

-- ---------------------------------------------------------------------------
-- Orders and inventory
-- ---------------------------------------------------------------------------

create table public.orders (
  id                   bigint generated always as identity primary key,
  order_number         text not null unique,
  idempotency_key      uuid not null unique,
  customer_id          uuid references auth.users (id),
  customer_email       text not null,
  customer_phone       text,
  status               text not null default 'pending',
  payment_status       text not null default 'unpaid',
  payment_method       text not null default 'unconfigured',
  shipping_method_code text references public.shipping_methods (code),
  shipping_method_label text not null default '',
  subtotal_cents       integer not null,
  discount_cents       integer not null default 0,
  shipping_cents       integer not null default 0,
  total_cents          integer not null,
  currency             text not null default 'EUR',
  coupon_id            bigint references public.coupons (id),
  coupon_code          text,
  shipping_address     jsonb not null,
  billing_address      jsonb,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint orders_status_chk         check (status in ('pending', 'confirmed', 'fulfilled', 'cancelled', 'refunded')),
  constraint orders_payment_status_chk check (payment_status in ('unpaid', 'paid', 'refunded')),
  constraint orders_currency_chk       check (currency = 'EUR'),
  constraint orders_subtotal_chk       check (subtotal_cents >= 0),
  constraint orders_discount_chk       check (discount_cents >= 0 and discount_cents <= subtotal_cents),
  constraint orders_shipping_chk       check (shipping_cents >= 0),
  constraint orders_total_chk          check (total_cents >= 0),
  constraint orders_total_math_chk     check (total_cents = subtotal_cents - discount_cents + shipping_cents)
);

create table public.order_items (
  id                 bigint generated always as identity primary key,
  order_id           bigint not null references public.orders (id) on delete cascade,
  product_id         bigint references public.products (id) on delete set null,
  sku                text not null,
  product_name       text not null,
  image_path         text,
  unit_price_cents   integer not null,
  quantity           integer not null,
  line_subtotal_cents integer not null,
  line_discount_cents integer not null default 0,
  line_total_cents   integer not null,
  constraint order_items_unit_price_chk    check (unit_price_cents >= 0),
  constraint order_items_quantity_chk      check (quantity > 0),
  constraint order_items_line_subtotal_chk check (line_subtotal_cents = unit_price_cents * quantity),
  constraint order_items_line_discount_chk check (line_discount_cents >= 0 and line_discount_cents <= line_subtotal_cents),
  constraint order_items_line_total_chk    check (line_total_cents = line_subtotal_cents - line_discount_cents)
);

create table public.coupon_redemptions (
  id             bigint generated always as identity primary key,
  coupon_id      bigint not null references public.coupons (id),
  order_id       bigint not null references public.orders (id) on delete cascade unique,
  customer_id    uuid references auth.users (id),
  customer_email text,
  redeemed_at    timestamptz not null default now()
);

create table public.inventory_movements (
  id             bigint generated always as identity primary key,
  product_id     bigint not null references public.products (id),
  quantity_delta integer not null,
  reason         text not null,
  order_id       bigint references public.orders (id),
  actor_id       uuid references auth.users (id),
  note           text,
  created_at     timestamptz not null default now(),
  constraint inventory_movements_reason_chk check (reason in ('order', 'restock', 'adjustment', 'cancellation', 'return'))
);

create table public.audit_events (
  id          bigint generated always as identity primary key,
  actor_id    uuid references auth.users (id),
  action      text not null,
  entity_type text not null,
  entity_id   text,
  before_data jsonb,
  after_data  jsonb,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger categories_set_updated_at        before update on public.categories        for each row execute function public.set_updated_at();
create trigger products_set_updated_at          before update on public.products          for each row execute function public.set_updated_at();
create trigger bundles_set_updated_at           before update on public.bundles           for each row execute function public.set_updated_at();
create trigger store_settings_set_updated_at    before update on public.store_settings    for each row execute function public.set_updated_at();
create trigger coupons_set_updated_at           before update on public.coupons           for each row execute function public.set_updated_at();
create trigger customer_profiles_set_updated_at before update on public.customer_profiles for each row execute function public.set_updated_at();
create trigger customer_addresses_set_updated_at before update on public.customer_addresses for each row execute function public.set_updated_at();
create trigger staff_profiles_set_updated_at    before update on public.staff_profiles    for each row execute function public.set_updated_at();
create trigger orders_set_updated_at            before update on public.orders            for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Indexes: foreign keys, RLS/ownership predicates, and public-catalog partials (§11)
-- ---------------------------------------------------------------------------

create index products_category_id_idx        on public.products (category_id);
create index products_public_idx             on public.products (id) where publication_status = 'published' and active;
create index product_images_product_id_idx   on public.product_images (product_id);
create index product_images_public_idx       on public.product_images (product_id) where published;
create index product_specs_product_id_idx    on public.product_specs (product_id);
create index product_features_product_id_idx on public.product_features (product_id);
create index product_box_contents_product_id_idx on public.product_box_contents (product_id);
create index product_relations_related_idx   on public.product_relations (related_product_id);
create index bundle_items_product_id_idx     on public.bundle_items (product_id);
create index bundles_hero_product_id_idx     on public.bundles (hero_product_id);

create index coupons_active_idx              on public.coupons (code) where active;
create index coupon_redemptions_coupon_id_idx on public.coupon_redemptions (coupon_id);

create index customer_addresses_user_id_idx  on public.customer_addresses (user_id);
create index staff_profiles_active_idx       on public.staff_profiles (user_id) where active;

create index orders_customer_id_idx          on public.orders (customer_id);
create index orders_customer_history_idx     on public.orders (customer_id, created_at desc);
create index orders_pending_idx              on public.orders (id) where status = 'pending';
create index orders_coupon_id_idx            on public.orders (coupon_id);
create index order_items_order_id_idx        on public.order_items (order_id);
create index order_items_product_id_idx      on public.order_items (product_id);
create index inventory_movements_product_id_idx on public.inventory_movements (product_id);
create index inventory_movements_order_id_idx   on public.inventory_movements (order_id);
create index audit_events_entity_idx         on public.audit_events (entity_type, entity_id);
