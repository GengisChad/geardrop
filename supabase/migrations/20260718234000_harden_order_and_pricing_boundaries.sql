-- Keep the original implementation private to privileged callers and put the
-- operational kill switch in front of every order creation.
alter function public.create_order(text,text,jsonb,jsonb,jsonb,text,text,uuid)
  rename to create_order_unchecked;
alter function public.create_order_unchecked(text,text,jsonb,jsonb,jsonb,text,text,uuid)
  set schema private;

revoke all on function private.create_order_unchecked(text,text,jsonb,jsonb,jsonb,text,text,uuid)
  from public,anon,authenticated,service_role;

create function public.create_order(
  p_email text,
  p_phone text,
  p_shipping_address jsonb,
  p_billing_address jsonb,
  p_lines jsonb,
  p_coupon_code text,
  p_shipping_code text,
  p_idempotency_key uuid
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_id bigint;
  maximum_quantity integer;
  intake_enabled boolean;
begin
  select accept_orders,max_quantity_per_line into intake_enabled,maximum_quantity
  from public.site_settings
  where singleton
  for key share;
  if not found or not intake_enabled then
    raise exception using errcode='55000',message='GD_ORDER_INTAKE_DISABLED';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) as line(value)
    where jsonb_typeof(line.value) <> 'object'
      or jsonb_typeof(line.value -> 'quantity') <> 'number'
      or (line.value ->> 'quantity')::integer > maximum_quantity
  ) then
    raise exception using errcode='22023',message='GD_ORDER_QUANTITY_LIMIT';
  end if;
  order_id := private.create_order_unchecked(
    p_email,p_phone,p_shipping_address,p_billing_address,p_lines,
    p_coupon_code,p_shipping_code,p_idempotency_key
  );
  return order_id;
end;
$$;

revoke all on function public.create_order(text,text,jsonb,jsonb,jsonb,text,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.create_order(text,text,jsonb,jsonb,jsonb,text,text,uuid)
  to service_role;

create function public.save_promotion_with_targets(
  p_promotion jsonb,
  p_product_ids bigint[],
  p_category_ids bigint[],
  p_bundle_ids bigint[]
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare target_id bigint := nullif(p_promotion->>'id','')::bigint;
begin
  if not private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role]) then
    raise exception using errcode='42501',message='GD_PROMOTION_MANAGER_REQUIRED';
  end if;
  p_product_ids := coalesce(p_product_ids,array[]::bigint[]);
  p_category_ids := coalesce(p_category_ids,array[]::bigint[]);
  p_bundle_ids := coalesce(p_bundle_ids,array[]::bigint[]);
  if exists (select unnest(p_product_ids) except select id from public.products)
    or exists (select unnest(p_category_ids) except select id from public.categories)
    or exists (select unnest(p_bundle_ids) except select id from public.bundles) then
    raise exception using errcode='23503',message='GD_PROMOTION_TARGET_NOT_FOUND';
  end if;

  if target_id is null then
    insert into public.promotions(
      name,description,discount_kind,discount_value,minimum_subtotal_cents,
      minimum_quantity,priority,stackable,starts_at,ends_at,active
    ) values (
      p_promotion->>'name',nullif(p_promotion->>'description',''),
      (p_promotion->>'discount_kind')::public.promotion_discount_kind,
      (p_promotion->>'discount_value')::integer,
      (p_promotion->>'minimum_subtotal_cents')::integer,
      (p_promotion->>'minimum_quantity')::integer,(p_promotion->>'priority')::integer,
      (p_promotion->>'stackable')::boolean,nullif(p_promotion->>'starts_at','')::timestamptz,
      nullif(p_promotion->>'ends_at','')::timestamptz,(p_promotion->>'active')::boolean
    ) returning id into target_id;
  else
    update public.promotions set
      name=p_promotion->>'name',description=nullif(p_promotion->>'description',''),
      discount_kind=(p_promotion->>'discount_kind')::public.promotion_discount_kind,
      discount_value=(p_promotion->>'discount_value')::integer,
      minimum_subtotal_cents=(p_promotion->>'minimum_subtotal_cents')::integer,
      minimum_quantity=(p_promotion->>'minimum_quantity')::integer,
      priority=(p_promotion->>'priority')::integer,stackable=(p_promotion->>'stackable')::boolean,
      starts_at=nullif(p_promotion->>'starts_at','')::timestamptz,
      ends_at=nullif(p_promotion->>'ends_at','')::timestamptz,active=(p_promotion->>'active')::boolean
    where id=target_id;
    if not found then raise exception using errcode='P0002',message='GD_PROMOTION_NOT_FOUND'; end if;
  end if;

  delete from public.promotion_products where promotion_id=target_id;
  delete from public.promotion_categories where promotion_id=target_id;
  delete from public.promotion_bundles where promotion_id=target_id;
  insert into public.promotion_products(promotion_id,product_id)
    select target_id,id from unnest(p_product_ids) as ids(id);
  insert into public.promotion_categories(promotion_id,category_id)
    select target_id,id from unnest(p_category_ids) as ids(id);
  insert into public.promotion_bundles(promotion_id,bundle_id)
    select target_id,id from unnest(p_bundle_ids) as ids(id);
  return target_id;
end;
$$;

create function public.save_coupon_with_targets(
  p_coupon jsonb,
  p_product_ids bigint[],
  p_category_ids bigint[],
  p_bundle_ids bigint[]
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare target_id bigint := nullif(p_coupon->>'id','')::bigint;
begin
  if not private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role]) then
    raise exception using errcode='42501',message='GD_COUPON_MANAGER_REQUIRED';
  end if;
  p_product_ids := coalesce(p_product_ids,array[]::bigint[]);
  p_category_ids := coalesce(p_category_ids,array[]::bigint[]);
  p_bundle_ids := coalesce(p_bundle_ids,array[]::bigint[]);
  if exists (select unnest(p_product_ids) except select id from public.products)
    or exists (select unnest(p_category_ids) except select id from public.categories)
    or exists (select unnest(p_bundle_ids) except select id from public.bundles) then
    raise exception using errcode='23503',message='GD_COUPON_TARGET_NOT_FOUND';
  end if;

  if target_id is null then
    insert into public.coupons(
      code,discount_kind,discount_value,free_shipping,minimum_subtotal_cents,
      maximum_discount_cents,usage_limit,per_customer_limit,first_purchase_only,
      starts_at,expires_at,active,disabled_at
    ) values (
      upper(trim(p_coupon->>'code')),(p_coupon->>'discount_kind')::public.discount_kind,
      (p_coupon->>'discount_value')::integer,(p_coupon->>'free_shipping')::boolean,
      (p_coupon->>'minimum_subtotal_cents')::integer,
      nullif(p_coupon->>'maximum_discount_cents','')::integer,
      nullif(p_coupon->>'usage_limit','')::integer,nullif(p_coupon->>'per_customer_limit','')::integer,
      (p_coupon->>'first_purchase_only')::boolean,nullif(p_coupon->>'starts_at','')::timestamptz,
      nullif(p_coupon->>'expires_at','')::timestamptz,(p_coupon->>'active')::boolean,null
    ) returning id into target_id;
  else
    update public.coupons set
      code=upper(trim(p_coupon->>'code')),discount_kind=(p_coupon->>'discount_kind')::public.discount_kind,
      discount_value=(p_coupon->>'discount_value')::integer,free_shipping=(p_coupon->>'free_shipping')::boolean,
      minimum_subtotal_cents=(p_coupon->>'minimum_subtotal_cents')::integer,
      maximum_discount_cents=nullif(p_coupon->>'maximum_discount_cents','')::integer,
      usage_limit=nullif(p_coupon->>'usage_limit','')::integer,
      per_customer_limit=nullif(p_coupon->>'per_customer_limit','')::integer,
      first_purchase_only=(p_coupon->>'first_purchase_only')::boolean,
      starts_at=nullif(p_coupon->>'starts_at','')::timestamptz,
      expires_at=nullif(p_coupon->>'expires_at','')::timestamptz,
      active=(p_coupon->>'active')::boolean,disabled_at=null
    where id=target_id;
    if not found then raise exception using errcode='P0002',message='GD_COUPON_NOT_FOUND'; end if;
  end if;

  delete from public.coupon_products where coupon_id=target_id;
  delete from public.coupon_categories where coupon_id=target_id;
  delete from public.coupon_bundles where coupon_id=target_id;
  insert into public.coupon_products(coupon_id,product_id)
    select target_id,id from unnest(p_product_ids) as ids(id);
  insert into public.coupon_categories(coupon_id,category_id)
    select target_id,id from unnest(p_category_ids) as ids(id);
  insert into public.coupon_bundles(coupon_id,bundle_id)
    select target_id,id from unnest(p_bundle_ids) as ids(id);
  return target_id;
end;
$$;

create function public.duplicate_coupon_with_targets(p_coupon_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare source public.coupons%rowtype; target_id bigint;
begin
  if not private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role]) then
    raise exception using errcode='42501',message='GD_COUPON_MANAGER_REQUIRED';
  end if;
  select * into source from public.coupons where id=p_coupon_id for share;
  if not found then raise exception using errcode='P0002',message='GD_COUPON_NOT_FOUND'; end if;
  insert into public.coupons(
    code,discount_kind,discount_value,minimum_subtotal_cents,maximum_discount_cents,
    usage_limit,used_count,starts_at,expires_at,active,free_shipping,per_customer_limit,
    first_purchase_only,disabled_at
  ) values (
    source.code||'-COPIA',source.discount_kind,source.discount_value,source.minimum_subtotal_cents,
    source.maximum_discount_cents,source.usage_limit,0,source.starts_at,source.expires_at,false,
    source.free_shipping,source.per_customer_limit,source.first_purchase_only,null
  ) returning id into target_id;
  insert into public.coupon_products select target_id,product_id from public.coupon_products where coupon_id=p_coupon_id;
  insert into public.coupon_categories select target_id,category_id from public.coupon_categories where coupon_id=p_coupon_id;
  insert into public.coupon_bundles select target_id,bundle_id from public.coupon_bundles where coupon_id=p_coupon_id;
  return target_id;
end;
$$;

revoke all on function public.save_promotion_with_targets(jsonb,bigint[],bigint[],bigint[]) from public,anon,authenticated,service_role;
revoke all on function public.save_coupon_with_targets(jsonb,bigint[],bigint[],bigint[]) from public,anon,authenticated,service_role;
revoke all on function public.duplicate_coupon_with_targets(bigint) from public,anon,authenticated,service_role;
grant execute on function public.save_promotion_with_targets(jsonb,bigint[],bigint[],bigint[]) to authenticated;
grant execute on function public.save_coupon_with_targets(jsonb,bigint[],bigint[],bigint[]) to authenticated;
grant execute on function public.duplicate_coupon_with_targets(bigint) to authenticated;
