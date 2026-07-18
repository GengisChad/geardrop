create type public.promotion_discount_kind as enum ('percentage', 'fixed', 'promotional_price');

create table public.promotions (
  id bigint generated always as identity primary key,
  name text not null check (char_length(trim(name)) between 1 and 160),
  description text,
  discount_kind public.promotion_discount_kind not null,
  discount_value integer not null check (discount_value > 0),
  minimum_subtotal_cents integer not null default 0 check (minimum_subtotal_cents >= 0),
  minimum_quantity integer not null default 1 check (minimum_quantity > 0),
  priority integer not null default 0,
  stackable boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (discount_kind <> 'percentage'::public.promotion_discount_kind or discount_value between 1 and 100)
);

create table public.promotion_products (
  promotion_id bigint not null references public.promotions(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete cascade,
  primary key (promotion_id, product_id)
);
create table public.promotion_categories (
  promotion_id bigint not null references public.promotions(id) on delete cascade,
  category_id bigint not null references public.categories(id) on delete cascade,
  primary key (promotion_id, category_id)
);
create table public.promotion_bundles (
  promotion_id bigint not null references public.promotions(id) on delete cascade,
  bundle_id bigint not null references public.bundles(id) on delete cascade,
  primary key (promotion_id, bundle_id)
);

alter table public.coupons
  drop constraint coupons_code_key,
  drop constraint coupons_code_check,
  add column free_shipping boolean not null default false,
  add column per_customer_limit integer check (per_customer_limit > 0),
  add column first_purchase_only boolean not null default false,
  add column disabled_at timestamptz,
  add constraint coupons_code_nonempty check (char_length(trim(code)) between 1 and 80);

create unique index coupons_code_case_insensitive_idx on public.coupons(lower(code));

create table public.coupon_products (
  coupon_id bigint not null references public.coupons(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete cascade,
  primary key (coupon_id, product_id)
);
create table public.coupon_categories (
  coupon_id bigint not null references public.coupons(id) on delete cascade,
  category_id bigint not null references public.categories(id) on delete cascade,
  primary key (coupon_id, category_id)
);
create table public.coupon_bundles (
  coupon_id bigint not null references public.coupons(id) on delete cascade,
  bundle_id bigint not null references public.bundles(id) on delete cascade,
  primary key (coupon_id, bundle_id)
);

create index promotions_active_priority_idx on public.promotions(priority desc, id) where active;
create index coupon_redemptions_customer_coupon_idx on public.coupon_redemptions(customer_id, coupon_id);

create trigger promotions_set_updated_at before update on public.promotions
for each row execute function private.set_updated_at();

alter table public.promotions enable row level security;
alter table public.promotion_products enable row level security;
alter table public.promotion_categories enable row level security;
alter table public.promotion_bundles enable row level security;
alter table public.coupon_products enable row level security;
alter table public.coupon_categories enable row level security;
alter table public.coupon_bundles enable row level security;

create policy promotions_public_read on public.promotions
for select to anon, authenticated using (
  active and (starts_at is null or starts_at <= statement_timestamp())
  and (ends_at is null or ends_at > statement_timestamp())
);
create policy promotions_manager_all on public.promotions
for all to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role])))
with check ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role])));

create policy promotion_products_public_read on public.promotion_products
for select to anon, authenticated using (exists (
  select 1 from public.promotions where promotions.id = promotion_id and promotions.active
));
create policy promotion_categories_public_read on public.promotion_categories
for select to anon, authenticated using (exists (
  select 1 from public.promotions where promotions.id = promotion_id and promotions.active
));
create policy promotion_bundles_public_read on public.promotion_bundles
for select to anon, authenticated using (exists (
  select 1 from public.promotions where promotions.id = promotion_id and promotions.active
));

create policy promotion_products_manager_all on public.promotion_products
for all to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role])))
with check ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role])));
create policy promotion_categories_manager_all on public.promotion_categories
for all to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role])))
with check ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role])));
create policy promotion_bundles_manager_all on public.promotion_bundles
for all to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role])))
with check ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role])));
create policy coupon_products_manager_all on public.coupon_products
for all to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role])))
with check ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role])));
create policy coupon_categories_manager_all on public.coupon_categories
for all to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role])))
with check ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role])));
create policy coupon_bundles_manager_all on public.coupon_bundles
for all to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role])))
with check ((select private.has_staff_role(array['owner'::public.staff_role, 'admin'::public.staff_role])));

create trigger promotions_audit_admin_mutation after insert or update or delete on public.promotions
for each row execute function private.audit_admin_mutation();
create trigger promotion_products_audit_admin_mutation after insert or update or delete on public.promotion_products
for each row execute function private.audit_admin_mutation();
create trigger promotion_categories_audit_admin_mutation after insert or update or delete on public.promotion_categories
for each row execute function private.audit_admin_mutation();
create trigger promotion_bundles_audit_admin_mutation after insert or update or delete on public.promotion_bundles
for each row execute function private.audit_admin_mutation();
create trigger coupon_products_audit_admin_mutation after insert or update or delete on public.coupon_products
for each row execute function private.audit_admin_mutation();
create trigger coupon_categories_audit_admin_mutation after insert or update or delete on public.coupon_categories
for each row execute function private.audit_admin_mutation();
create trigger coupon_bundles_audit_admin_mutation after insert or update or delete on public.coupon_bundles
for each row execute function private.audit_admin_mutation();

create or replace function public.calculate_cart_pricing(
  p_lines jsonb,
  p_coupon_code text default null,
  p_customer_id uuid default null,
  p_shipping_code text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cart_subtotal bigint;
  cart_quantity bigint;
  shipping_amount bigint;
  promotion_discount bigint := 0;
  current_discount bigint;
  eligible_subtotal bigint;
  coupon_discount bigint := 0;
  applied_promotions jsonb := '[]'::jsonb;
  priced_lines jsonb;
  promotion_record public.promotions%rowtype;
  coupon_record public.coupons%rowtype;
  shipping_record public.shipping_methods%rowtype;
begin
  if p_customer_id is not null and p_customer_id is distinct from (select auth.uid()) then
    raise exception using errcode = '42501', message = 'GD_PRICING_CUSTOMER_MISMATCH';
  end if;
  if jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) < 1
    or jsonb_array_length(p_lines) > 100
    or exists (
      select 1 from jsonb_array_elements(p_lines) as line(value)
      where jsonb_typeof(line.value) <> 'object'
        or jsonb_typeof(line.value -> 'product_id') <> 'number'
        or jsonb_typeof(line.value -> 'quantity') <> 'number'
        or (line.value ->> 'product_id')::bigint <= 0
        or (line.value ->> 'quantity')::integer not between 1 and 100
    )
    or (
      select count(distinct (line.value ->> 'product_id')::bigint)
      from jsonb_array_elements(p_lines) as line(value)
    ) <> jsonb_array_length(p_lines) then
    raise exception using errcode = '22023', message = 'GD_PRICING_INVALID_LINES';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_lines) as line(value)
    left join public.products as product on product.id = (line.value ->> 'product_id')::bigint
    where product.id is null or not product.is_purchasable
      or (line.value ->> 'quantity')::integer > case
        when product.availability_override = 'preorder'::public.availability_override then product.preorder_allocation
        else product.stock_quantity
      end
  ) then
    raise exception using errcode = 'P0001', message = 'GD_PRICING_PRODUCT_UNAVAILABLE';
  end if;

  select coalesce(sum(product.price_cents::bigint * (line.value ->> 'quantity')::integer), 0),
         coalesce(sum((line.value ->> 'quantity')::integer), 0),
         jsonb_agg(jsonb_build_object(
           'product_id', product.id,
           'quantity', (line.value ->> 'quantity')::integer,
           'unit_price_cents', product.price_cents,
           'line_subtotal_cents', product.price_cents::bigint * (line.value ->> 'quantity')::integer
         ) order by product.id)
  into cart_subtotal, cart_quantity, priced_lines
  from jsonb_array_elements(p_lines) as line(value)
  join public.products as product on product.id = (line.value ->> 'product_id')::bigint;

  if cart_subtotal > 2147483647 then
    raise exception using errcode = '22003', message = 'GD_PRICING_TOTAL_TOO_LARGE';
  end if;

  select method.* into shipping_record
  from public.shipping_methods as method
  where method.code = lower(trim(p_shipping_code)) and method.active;
  if not found then
    raise exception using errcode = 'P0001', message = 'GD_PRICING_SHIPPING_INVALID';
  end if;
  shipping_amount := case
    when shipping_record.free_from_cents is not null and cart_subtotal >= shipping_record.free_from_cents then 0
    else shipping_record.price_cents
  end;

  for promotion_record in
    select promotion.* from public.promotions as promotion
    where promotion.active
      and (promotion.starts_at is null or promotion.starts_at <= statement_timestamp())
      and (promotion.ends_at is null or promotion.ends_at > statement_timestamp())
      and cart_subtotal >= promotion.minimum_subtotal_cents
      and cart_quantity >= promotion.minimum_quantity
    order by promotion.priority desc, promotion.id
  loop
    select coalesce(sum(product.price_cents::bigint * (line.value ->> 'quantity')::integer), 0)
    into eligible_subtotal
    from jsonb_array_elements(p_lines) as line(value)
    join public.products as product on product.id = (line.value ->> 'product_id')::bigint
    where (
      not exists (select 1 from public.promotion_products where promotion_id = promotion_record.id)
      and not exists (select 1 from public.promotion_categories where promotion_id = promotion_record.id)
      and not exists (select 1 from public.promotion_bundles where promotion_id = promotion_record.id)
    ) or exists (
      select 1 from public.promotion_products where promotion_id = promotion_record.id and product_id = product.id
    ) or exists (
      select 1 from public.promotion_categories where promotion_id = promotion_record.id and category_id = product.category_id
    ) or exists (
      select 1 from public.promotion_bundles as target
      join public.bundle_items as included on included.bundle_id = target.bundle_id and included.product_id = product.id
      where target.promotion_id = promotion_record.id
        and not exists (
          select 1 from public.bundle_items as required
          where required.bundle_id = target.bundle_id
            and coalesce((select (cart.value ->> 'quantity')::integer from jsonb_array_elements(p_lines) as cart(value)
              where (cart.value ->> 'product_id')::bigint = required.product_id), 0) < required.quantity
        )
    );

    if eligible_subtotal <= 0 then continue; end if;
    current_discount := case promotion_record.discount_kind
      when 'percentage'::public.promotion_discount_kind then (eligible_subtotal * promotion_record.discount_value) / 100
      when 'fixed'::public.promotion_discount_kind then least(eligible_subtotal, promotion_record.discount_value::bigint)
      when 'promotional_price'::public.promotion_discount_kind then (
        select coalesce(sum(greatest(product.price_cents - promotion_record.discount_value, 0)::bigint * (line.value ->> 'quantity')::integer), 0)
        from jsonb_array_elements(p_lines) as line(value)
        join public.products as product on product.id = (line.value ->> 'product_id')::bigint
        where (
          not exists (select 1 from public.promotion_products where promotion_id = promotion_record.id)
          and not exists (select 1 from public.promotion_categories where promotion_id = promotion_record.id)
          and not exists (select 1 from public.promotion_bundles where promotion_id = promotion_record.id)
        ) or exists (select 1 from public.promotion_products where promotion_id = promotion_record.id and product_id = product.id)
           or exists (select 1 from public.promotion_categories where promotion_id = promotion_record.id and category_id = product.category_id)
      )
    end;
    if current_discount > 0 then
      if not promotion_record.stackable and jsonb_array_length(applied_promotions) > 0 then continue; end if;
      promotion_discount := least(cart_subtotal, promotion_discount + current_discount);
      applied_promotions := applied_promotions || jsonb_build_array(promotion_record.id);
      if not promotion_record.stackable then exit; end if;
    end if;
  end loop;

  if nullif(trim(p_coupon_code), '') is not null then
    select coupon.* into coupon_record
    from public.coupons as coupon
    where lower(coupon.code) = lower(trim(p_coupon_code));
    if not found or not coupon_record.active or coupon_record.disabled_at is not null
      or (coupon_record.starts_at is not null and coupon_record.starts_at > statement_timestamp())
      or (coupon_record.expires_at is not null and coupon_record.expires_at <= statement_timestamp())
      or (coupon_record.usage_limit is not null and coupon_record.used_count >= coupon_record.usage_limit)
      or cart_subtotal < coupon_record.minimum_subtotal_cents then
      raise exception using errcode = 'P0001', message = 'GD_PRICING_COUPON_INVALID';
    end if;
    if coupon_record.per_customer_limit is not null and (
      p_customer_id is null or (select count(*) from public.coupon_redemptions where coupon_id = coupon_record.id and customer_id = p_customer_id) >= coupon_record.per_customer_limit
    ) then
      raise exception using errcode = 'P0001', message = 'GD_PRICING_COUPON_INVALID';
    end if;
    if coupon_record.first_purchase_only and (
      p_customer_id is null or exists (select 1 from public.orders where customer_id = p_customer_id and status <> 'cancelled'::public.order_status)
    ) then
      raise exception using errcode = 'P0001', message = 'GD_PRICING_COUPON_INVALID';
    end if;

    select coalesce(sum(product.price_cents::bigint * (line.value ->> 'quantity')::integer), 0)
    into eligible_subtotal
    from jsonb_array_elements(p_lines) as line(value)
    join public.products as product on product.id = (line.value ->> 'product_id')::bigint
    where (
      not exists (select 1 from public.coupon_products where coupon_id = coupon_record.id)
      and not exists (select 1 from public.coupon_categories where coupon_id = coupon_record.id)
      and not exists (select 1 from public.coupon_bundles where coupon_id = coupon_record.id)
    ) or exists (select 1 from public.coupon_products where coupon_id = coupon_record.id and product_id = product.id)
      or exists (select 1 from public.coupon_categories where coupon_id = coupon_record.id and category_id = product.category_id)
      or exists (
        select 1 from public.coupon_bundles as target
        join public.bundle_items as included on included.bundle_id = target.bundle_id and included.product_id = product.id
        where target.coupon_id = coupon_record.id
          and not exists (
            select 1 from public.bundle_items as required where required.bundle_id = target.bundle_id
              and coalesce((select (cart.value ->> 'quantity')::integer from jsonb_array_elements(p_lines) as cart(value)
                where (cart.value ->> 'product_id')::bigint = required.product_id), 0) < required.quantity
          )
      );
    if eligible_subtotal <= 0 then
      raise exception using errcode = 'P0001', message = 'GD_PRICING_COUPON_INVALID';
    end if;
    coupon_discount := case coupon_record.discount_kind
      when 'percentage'::public.discount_kind then (eligible_subtotal * coupon_record.discount_value) / 100
      when 'fixed'::public.discount_kind then least(eligible_subtotal, coupon_record.discount_value::bigint)
    end;
    if coupon_record.maximum_discount_cents is not null then
      coupon_discount := least(coupon_discount, coupon_record.maximum_discount_cents);
    end if;
    coupon_discount := least(greatest(cart_subtotal - promotion_discount, 0), coupon_discount);
    if coupon_record.free_shipping then shipping_amount := 0; end if;
  end if;

  return jsonb_build_object(
    'currency', 'EUR',
    'lines', priced_lines,
    'subtotal_cents', cart_subtotal,
    'promotion_discount_cents', promotion_discount,
    'coupon_discount_cents', coupon_discount,
    'discount_cents', promotion_discount + coupon_discount,
    'shipping_cents', shipping_amount,
    'total_cents', greatest(cart_subtotal - promotion_discount - coupon_discount, 0) + shipping_amount,
    'applied_promotion_ids', applied_promotions,
    'coupon_id', case when coupon_record.id is null then null else to_jsonb(coupon_record.id) end,
    'coupon_code', case when coupon_record.id is null then null else to_jsonb(upper(coupon_record.code)) end
  );
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'GD_PRICING_INVALID_LINES';
end;
$$;

revoke all on function public.calculate_cart_pricing(jsonb, text, uuid, text)
from public, anon, authenticated, service_role;
grant execute on function public.calculate_cart_pricing(jsonb, text, uuid, text) to anon, authenticated;

grant select on public.promotions, public.promotion_products, public.promotion_categories, public.promotion_bundles
to anon, authenticated;
grant select on public.coupon_products, public.coupon_categories, public.coupon_bundles to authenticated;
grant insert, update, delete on public.promotions, public.promotion_products, public.promotion_categories,
  public.promotion_bundles, public.coupon_products, public.coupon_categories, public.coupon_bundles
to authenticated;
grant usage, select on sequence public.promotions_id_seq to authenticated;
