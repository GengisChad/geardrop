alter table public.inventory_movements
  add column balance_kind text not null default 'stock'
    check (balance_kind in ('stock','preorder')),
  add column balance_after integer check (balance_after >= 0);
update public.inventory_movements set balance_after=stock_after where balance_after is null;
update public.inventory_movements as movement set
  balance_kind='preorder',balance_after=null
where movement.order_id is not null and exists(
  select 1 from public.order_items
  where order_id=movement.order_id and product_id=movement.product_id and reservation_kind='preorder'
);
comment on column public.inventory_movements.balance_after is
  'NULL only for legacy preorder movements whose exact allocation history cannot be reconstructed.';

create function private.annotate_inventory_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.balance_kind='preorder' or (new.order_id is not null and exists(
    select 1 from public.order_items
    where order_id=new.order_id and product_id=new.product_id and reservation_kind='preorder'
  )) then
    new.balance_kind := 'preorder';
    select preorder_allocation into new.balance_after from public.products where id=new.product_id;
  else
    new.balance_kind := 'stock';
    new.balance_after := new.stock_after;
  end if;
  return new;
end;
$$;
revoke all on function private.annotate_inventory_balance() from public,anon,authenticated,service_role;
create trigger inventory_movements_annotate_balance
before insert on public.inventory_movements
for each row execute function private.annotate_inventory_balance();

create function private.record_staff_preorder_allocation_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.preorder_allocation is distinct from new.preorder_allocation
    and private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role]) then
    insert into public.inventory_movements(
      product_id,delta,stock_after,balance_kind,balance_after,reason,actor_user_id,note
    ) values (
      new.id,new.preorder_allocation-old.preorder_allocation,new.stock_quantity,'preorder',
      new.preorder_allocation,'manual_adjustment',(select auth.uid()),'Allocazione preordine aggiornata'
    );
  end if;
  return new;
end;
$$;
revoke all on function private.record_staff_preorder_allocation_change() from public,anon,authenticated,service_role;
create trigger products_record_preorder_allocation_change
after update of preorder_allocation on public.products
for each row execute function private.record_staff_preorder_allocation_change();

drop policy order_notes_staff_read on public.order_notes;
drop policy order_status_events_staff_read on public.order_status_events;
create policy order_notes_manager_read on public.order_notes for select to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role])));
create policy order_status_events_manager_read on public.order_status_events for select to authenticated
using ((select private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role])));

create or replace function public.add_order_note(p_order_id bigint,p_note text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare actor_id uuid:=(select auth.uid()); note_id bigint;
begin
  if not private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role]) then
    raise exception using errcode='42501',message='GD_ORDER_MANAGER_REQUIRED';
  end if;
  insert into public.order_notes(order_id,author_user_id,note)
  values(p_order_id,actor_id,trim(p_note)) returning id into note_id;
  insert into public.audit_events(actor_user_id,action,entity_type,entity_id,after_state)
  values(actor_id,'order.note_added','orders',p_order_id::text,jsonb_build_object('note_id',note_id));
  return note_id;
end;
$$;
revoke all on function public.add_order_note(bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.add_order_note(bigint,text) to authenticated;

create function public.save_footer_configuration(p_configuration jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare column_record record; item_record record; social_record record; column_id bigint;
begin
  if not private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role]) then
    raise exception using errcode='42501',message='GD_CONTENT_STAFF_REQUIRED';
  end if;
  if jsonb_typeof(p_configuration->'columns') is distinct from 'array'
    or jsonb_typeof(p_configuration->'social_links') is distinct from 'array' then
    raise exception using errcode='22023',message='GD_FOOTER_INVALID_PAYLOAD';
  end if;

  delete from public.social_links;
  delete from public.footer_columns;
  for column_record in
    select value,ordinality-1 as position
    from jsonb_array_elements(p_configuration->'columns') with ordinality
  loop
    insert into public.footer_columns(
      column_key,title,sort_order,publication_status,active,published_at
    ) values (
      column_record.value->>'key',column_record.value->>'title',column_record.position,
      (column_record.value->>'publication_status')::public.publication_status,
      (column_record.value->>'active')::boolean,
      case when column_record.value->>'publication_status'='published' then now() else null end
    ) returning id into column_id;
    for item_record in
      select value,ordinality-1 as position
      from jsonb_array_elements(column_record.value->'items') with ordinality
    loop
      insert into public.footer_items(column_id,label,href,active,sort_order)
      values(column_id,item_record.value->>'label',item_record.value->>'href',
        (item_record.value->>'active')::boolean,item_record.position);
    end loop;
  end loop;
  for social_record in
    select value,ordinality-1 as position
    from jsonb_array_elements(p_configuration->'social_links') with ordinality
  loop
    insert into public.social_links(
      platform_key,label,href,sort_order,publication_status,active,published_at
    ) values (
      social_record.value->>'platform_key',social_record.value->>'label',
      social_record.value->>'href',social_record.position,
      (social_record.value->>'publication_status')::public.publication_status,
      (social_record.value->>'active')::boolean,
      case when social_record.value->>'publication_status'='published' then now() else null end
    );
  end loop;
end;
$$;
revoke all on function public.save_footer_configuration(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.save_footer_configuration(jsonb) to authenticated;

create function public.set_manual_order_enablement_check(
  p_key text,p_status public.enablement_check_status,p_evidence text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid());
begin
  if not private.has_staff_role(array['owner'::public.staff_role]) then
    raise exception using errcode='42501',message='GD_ORDER_OWNER_REQUIRED';
  end if;
  if p_key in ('store_identity','shipping','catalog_stock') or p_status='pending' or nullif(trim(p_evidence),'') is null
    or char_length(trim(p_evidence)) > 1000 then
    raise exception using errcode='22023',message='GD_ORDER_CHECK_INVALID';
  end if;
  update public.order_enablement_checks set status=p_status,evidence=trim(p_evidence),
    verified_at=now(),verified_by=actor_id where key=p_key;
  if not found then raise exception using errcode='P0002',message='GD_ORDER_CHECK_NOT_FOUND'; end if;
  insert into public.audit_events(actor_user_id,action,entity_type,entity_id,after_state)
  values(actor_id,'store.order_check_verified','order_enablement_checks',p_key,
    jsonb_build_object('status',p_status,'evidence',trim(p_evidence)));
end;
$$;
revoke all on function public.set_manual_order_enablement_check(text,public.enablement_check_status,text)
  from public,anon,authenticated,service_role;
grant execute on function public.set_manual_order_enablement_check(text,public.enablement_check_status,text)
  to authenticated;

create function public.record_staff_invite(
  p_user_id uuid,p_email text,p_display_name text,p_role public.staff_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid());
begin
  if not private.has_staff_role(array['owner'::public.staff_role]) then
    raise exception using errcode='42501',message='GD_STAFF_OWNER_REQUIRED';
  end if;
  insert into public.staff_profiles(
    user_id,display_name,role,invite_email,invite_status,invited_at,active,created_by,updated_by
  ) values (
    p_user_id,trim(p_display_name),p_role,lower(trim(p_email)),'invited',now(),true,actor_id,actor_id
  );
  insert into public.audit_events(actor_user_id,action,entity_type,entity_id,after_state)
  values(actor_id,'staff.invited','staff_profiles',p_user_id::text,
    jsonb_build_object('role',p_role,'invite_email',lower(trim(p_email))));
end;
$$;

create function public.record_staff_login()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid()); previous_status public.staff_invite_status;
begin
  if not private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role]) then
    raise exception using errcode='42501',message='GD_STAFF_REQUIRED';
  end if;
  select invite_status into previous_status from public.staff_profiles where user_id=actor_id for update;
  update public.staff_profiles set invite_status='active',accepted_at=coalesce(accepted_at,now()),
    last_login_at=now(),updated_by=actor_id where user_id=actor_id;
  if previous_status='invited' then
    insert into public.audit_events(actor_user_id,action,entity_type,entity_id,after_state)
    values(actor_id,'staff.invite_accepted','staff_profiles',actor_id::text,jsonb_build_object('status','active'));
  end if;
end;
$$;

revoke all on function public.record_staff_invite(uuid,text,text,public.staff_role)
  from public,anon,authenticated,service_role;
revoke all on function public.record_staff_login() from public,anon,authenticated,service_role;
grant execute on function public.record_staff_invite(uuid,text,text,public.staff_role) to authenticated;
grant execute on function public.record_staff_login() to authenticated;

create function public.update_product_image_metadata(
  p_product_id bigint,p_image_id bigint,p_alt text,p_published boolean,p_is_primary boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role,'editor'::public.staff_role]) then
    raise exception using errcode='42501',message='GD_PRODUCT_STAFF_REQUIRED';
  end if;
  update public.product_images set alt=trim(p_alt),published=p_published
  where id=p_image_id and product_id=p_product_id;
  if not found then raise exception using errcode='P0002',message='GD_PRODUCT_IMAGE_NOT_FOUND'; end if;
  if p_is_primary then
    update public.product_images set is_primary=(id=p_image_id) where product_id=p_product_id;
  end if;
end;
$$;
revoke all on function public.update_product_image_metadata(bigint,bigint,text,boolean,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.update_product_image_metadata(bigint,bigint,text,boolean,boolean)
  to authenticated;
