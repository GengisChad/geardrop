create or replace function private.valid_country_codes(value text[])
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(cardinality(value) between 1 and 50,false)
    and not exists(select 1 from unnest(value) as code where code !~ '^[A-Z]{2}$')
    and cardinality(value)=cardinality(array(select distinct code from unnest(value) as code));
$$;
revoke all on function private.valid_country_codes(text[]) from public,anon,authenticated,service_role;
grant execute on function private.valid_country_codes(text[]) to authenticated;

alter table public.shipping_methods
  add column description text check (description is null or char_length(description)<=1000),
  add column enabled_country_codes text[] not null default array['IT']::text[]
    check (private.valid_country_codes(enabled_country_codes)),
  add column estimate_min_days integer not null default 1 check (estimate_min_days between 0 and 365),
  add column estimate_max_days integer not null default 5 check (estimate_max_days between 0 and 365),
  add constraint shipping_methods_estimate_range check (estimate_min_days <= estimate_max_days);

alter table public.site_settings
  add column store_name text not null default '' check (char_length(store_name)<=160),
  add column legal_name text not null default '' check (char_length(legal_name)<=200),
  add column vat_number text check (vat_number is null or vat_number ~ '^[A-Z0-9 .-]{2,32}$'),
  add column tax_code text check (tax_code is null or tax_code ~ '^[A-Z0-9]{2,32}$'),
  add column support_email text check (support_email is null or support_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  add column support_phone text check (support_phone is null or char_length(support_phone) between 5 and 40),
  add column street_address text check (street_address is null or char_length(street_address)<=240),
  add column city text check (city is null or char_length(city)<=120),
  add column postal_code text check (postal_code is null or char_length(postal_code)<=20),
  add column country_code text not null default 'IT' check (country_code ~ '^[A-Z]{2}$'),
  add column legal_notice text check (legal_notice is null or char_length(legal_notice)<=10000),
  add column maintenance_mode boolean not null default false,
  add column maintenance_message text check (maintenance_message is null or char_length(maintenance_message)<=1000),
  add column upload_max_bytes bigint not null default 10485760 check (upload_max_bytes between 1048576 and 52428800),
  add column default_seo_title text not null default '' check (char_length(default_seo_title)<=70),
  add column default_seo_description text check (default_seo_description is null or char_length(default_seo_description)<=180),
  add column default_og_image_url text check (default_og_image_url is null or default_og_image_url ~ '^https://'),
  add column instagram_url text check (instagram_url is null or instagram_url ~ '^https://'),
  add column facebook_url text check (facebook_url is null or facebook_url ~ '^https://'),
  add column tiktok_url text check (tiktok_url is null or tiktok_url ~ '^https://'),
  add column youtube_url text check (youtube_url is null or youtube_url ~ '^https://'),
  add constraint site_settings_maintenance_message check (not maintenance_mode or nullif(trim(maintenance_message),'') is not null);

insert into public.order_enablement_checks(key,label,status) values
  ('store_identity','Identità negozio completa','pending'),
  ('shipping','Metodo di spedizione attivo','pending'),
  ('catalog_stock','Prodotto acquistabile con stock','pending'),
  ('payments','Provider pagamenti verificato','pending')
on conflict(key) do update set label=excluded.label;

create trigger shipping_methods_audit_admin_mutation after insert or update or delete on public.shipping_methods
for each row execute function private.audit_admin_mutation();
create trigger site_settings_audit_admin_mutation after update on public.site_settings
for each row execute function private.audit_admin_mutation();

revoke select on public.site_settings from anon;
grant select(singleton,accept_orders,currency,max_quantity_per_line,store_name,legal_name,vat_number,tax_code,support_email,support_phone,street_address,city,postal_code,country_code,legal_notice,maintenance_mode,maintenance_message,upload_max_bytes,default_seo_title,default_seo_description,default_og_image_url,instagram_url,facebook_url,tiktok_url,youtube_url,updated_at) on public.site_settings to anon;
revoke update on public.site_settings from authenticated;
grant update(currency,max_quantity_per_line,updated_at,updated_by,store_name,legal_name,vat_number,tax_code,support_email,support_phone,street_address,city,postal_code,country_code,legal_notice,maintenance_mode,maintenance_message,upload_max_bytes,default_seo_title,default_seo_description,default_og_image_url,instagram_url,facebook_url,tiktok_url,youtube_url) on public.site_settings to authenticated;

create or replace function public.set_order_acceptance(p_enabled boolean,p_confirmation text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor_id uuid:=(select auth.uid()); incomplete_count integer;
begin
  if not private.has_staff_role(array['owner'::public.staff_role]) then
    raise exception using errcode='42501',message='GD_ORDER_OWNER_REQUIRED';
  end if;
  if (p_enabled and p_confirmation<>'ATTIVA ORDINI') or (not p_enabled and p_confirmation<>'DISATTIVA ORDINI') then
    raise exception using errcode='22023',message='GD_ORDER_CONFIRMATION_INVALID';
  end if;
  update public.order_enablement_checks set
    status=case when exists(select 1 from public.site_settings where singleton and nullif(trim(store_name),'') is not null and nullif(trim(legal_name),'') is not null and support_email is not null) then 'passed'::public.enablement_check_status else 'failed'::public.enablement_check_status end,
    evidence='Campi identità e contatto riletti dal database',verified_at=now(),verified_by=actor_id
  where key='store_identity';
  update public.order_enablement_checks set
    status=case when exists(select 1 from public.shipping_methods where active and private.valid_country_codes(enabled_country_codes)) then 'passed'::public.enablement_check_status else 'failed'::public.enablement_check_status end,
    evidence='Metodi attivi riletti dal database',verified_at=now(),verified_by=actor_id
  where key='shipping';
  update public.order_enablement_checks set
    status=case when exists(select 1 from public.products where active and publication_status='published' and is_purchasable) then 'passed'::public.enablement_check_status else 'failed'::public.enablement_check_status end,
    evidence='Catalogo e stock riletti dal database',verified_at=now(),verified_by=actor_id
  where key='catalog_stock';
  if p_enabled then
    select count(*) into incomplete_count from public.order_enablement_checks where status<>'passed';
    if incomplete_count>0 then raise exception using errcode='55000',message='GD_ORDER_CHECKLIST_INCOMPLETE'; end if;
  end if;
  update public.site_settings set accept_orders=p_enabled,updated_by=actor_id where singleton;
  insert into public.audit_events(actor_user_id,action,entity_type,entity_id,after_state)
  values(actor_id,'store.order_acceptance_changed','site_settings','singleton',jsonb_build_object('accept_orders',p_enabled));
end;
$$;
revoke all on function public.set_order_acceptance(boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.set_order_acceptance(boolean,text) to authenticated;
