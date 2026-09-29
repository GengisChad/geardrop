-- La coda dei pre-ordini: chi aspetta la merce, quanto ne copre lo stock di oggi (in ordine di
-- arrivo, senza contare due volte lo stesso pezzo) e chi è già stato avvisato.
begin;
select plan(15);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email, '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
from (values
  ('00000000-0000-0000-0000-000000004801'::uuid, 'preorder-owner@example.com'),
  ('00000000-0000-0000-0000-000000004802'::uuid, 'preorder-editor@example.com')
) as people(id, email);
insert into public.staff_profiles (user_id, role, display_name) values
  ('00000000-0000-0000-0000-000000004801', 'owner', 'Preorder owner'),
  ('00000000-0000-0000-0000-000000004802', 'editor', 'Preorder editor');
insert into public.organization_members (organization_id, user_id, role)
select organization.id, member.user_id, member.role::public.staff_role
from (values
  ('geardrop', '00000000-0000-0000-0000-000000004801'::uuid, 'owner'),
  ('geardrop', '00000000-0000-0000-0000-000000004802'::uuid, 'editor')
) as member(slug, user_id, role)
join public.organizations as organization on organization.slug = member.slug
on conflict (organization_id, user_id) do update set role = excluded.role, active = true;

create temporary table fx (name text primary key, id bigint not null) on commit drop;
grant select on fx to authenticated;

do $fixture$
declare
  geardrop bigint := (select id from public.organizations where slug = 'geardrop');
  v_category bigint;
  v_product bigint;
  v_other bigint;
  v_order bigint;
begin
  insert into public.categories (organization_id, slug, name, tagline, description)
  values (geardrop, 'preorder-category', 'Preorder', 't', 'd') returning id into v_category;
  -- Due pezzi a scaffale: bastano al primo ordine, non al secondo.
  insert into public.products (organization_id, category_id, slug, sku, name, tagline, description, price_cents, stock_quantity)
  values (geardrop, v_category, 'preorder-bey', 'PREORDER-BEY', 'Bey atteso', 't', 'd', 2000, 2) returning id into v_product;
  insert into public.products (organization_id, category_id, slug, sku, name, tagline, description, price_cents, stock_quantity)
  values (geardrop, v_category, 'preorder-altro', 'PREORDER-ALTRO', 'Altro atteso', 't', 'd', 1000, 0) returning id into v_other;

  -- Ordine più vecchio: 2 pezzi in pre-ordine, coperti dallo stock.
  insert into public.orders (organization_id, order_number, email, status, payment_status, subtotal_cents,
    shipping_cents, total_cents, shipping_method_code, shipping_address_snapshot, billing_address_snapshot,
    idempotency_key, created_at)
  values (geardrop, 'GD-PRE-1', 'primo@example.com', 'confirmed', 'paid', 4000, 0, 4000, 'standard', '{}', '{}',
    gen_random_uuid(), now() - interval '3 days')
  returning id into v_order;
  insert into public.order_items (order_id, product_id, product_name_snapshot, sku_snapshot, quantity,
    unit_price_cents, line_total_cents, image_src_snapshot, preorder_quantity, reservation_kind)
  values (v_order, v_product, 'Bey atteso', 'PREORDER-BEY', 2, 2000, 4000, '/p.webp', 2, 'preorder');
  insert into fx values ('primo', v_order);

  -- Ordine più recente: stesso prodotto, ma i pezzi sono già del primo.
  insert into public.orders (organization_id, order_number, email, status, payment_status, subtotal_cents,
    shipping_cents, total_cents, shipping_method_code, shipping_address_snapshot, billing_address_snapshot,
    idempotency_key, created_at)
  values (geardrop, 'GD-PRE-2', 'secondo@example.com', 'confirmed', 'paid', 3000, 0, 3000, 'standard', '{}', '{}',
    gen_random_uuid(), now() - interval '1 day')
  returning id into v_order;
  insert into public.order_items (order_id, product_id, product_name_snapshot, sku_snapshot, quantity,
    unit_price_cents, line_total_cents, image_src_snapshot, preorder_quantity, reservation_kind)
  values (v_order, v_product, 'Bey atteso', 'PREORDER-BEY', 1, 2000, 2000, '/p.webp', 1, 'preorder'),
    (v_order, v_other, 'Altro atteso', 'PREORDER-ALTRO', 1, 1000, 1000, '/p.webp', 1, 'preorder');
  insert into fx values ('secondo', v_order);

  -- Ordine senza pre-ordini: non deve comparire in coda.
  insert into public.orders (organization_id, order_number, email, status, payment_status, subtotal_cents,
    shipping_cents, total_cents, shipping_method_code, shipping_address_snapshot, billing_address_snapshot, idempotency_key)
  values (geardrop, 'GD-PRE-3', 'terzo@example.com', 'confirmed', 'paid', 2000, 0, 2000, 'standard', '{}', '{}', gen_random_uuid())
  returning id into v_order;
  insert into public.order_items (order_id, product_id, product_name_snapshot, sku_snapshot, quantity,
    unit_price_cents, line_total_cents, image_src_snapshot)
  values (v_order, v_product, 'Bey atteso', 'PREORDER-BEY', 1, 2000, 2000, '/p.webp');
  insert into fx values ('senza_preordine', v_order), ('product', v_product);
end;
$fixture$;

select has_column('public', 'orders', 'preorder_ready_notified_at', 'l''ordine ricorda quando il cliente è stato avvisato');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004801","role":"authenticated"}', true);
set local role authenticated;

create temporary view coda as
  select * from public.get_preorder_queue((select id from public.organizations where slug = 'geardrop'));

select results_eq(
  $$select order_number from coda order by created_at$$,
  $$values ('GD-PRE-1'), ('GD-PRE-2')$$,
  'in coda solo gli ordini pagati con pezzi in pre-ordine, dal più vecchio'
);
select results_eq(
  $$select preorder_units, covered_units, ready from coda where order_number = 'GD-PRE-1'$$,
  $$values (2, 2, true)$$,
  'il primo ordine è coperto dallo stock presente'
);
select results_eq(
  $$select preorder_units, covered_units, ready from coda where order_number = 'GD-PRE-2'$$,
  $$values (2, 0, false)$$,
  'il secondo non conta i pezzi già impegnati dal primo'
);
select is(
  (select waiting -> 0 ->> 'nome' from coda where order_number = 'GD-PRE-1'),
  'Bey atteso',
  'la coda dice quale prodotto si aspetta'
);
select is(
  (select (waiting -> 0 ->> 'coperti')::integer from coda where order_number = 'GD-PRE-2'),
  0,
  'e quanti pezzi sono coperti riga per riga'
);
select is(
  (select notified_at from coda where order_number = 'GD-PRE-1'),
  null,
  'nessuno è ancora stato avvisato'
);

-- Arriva la merce: lo stock sale e anche il secondo ordine diventa servibile.
reset role;
update public.products set stock_quantity = 10 where id = (select id from fx where name = 'product');
update public.products set stock_quantity = 5 where sku = 'PREORDER-ALTRO';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004801","role":"authenticated"}', true);
set local role authenticated;

select results_eq(
  $$select order_number, ready from coda order by created_at$$,
  $$values ('GD-PRE-1', true), ('GD-PRE-2', true)$$,
  'con la merce in magazzino entrambi gli ordini sono pronti'
);

select lives_ok(
  $$select public.mark_preorder_ready_notified((select id from fx where name = 'primo'))$$,
  'il socio segna che il cliente è stato avvisato'
);
select isnt(
  (select notified_at from coda where order_number = 'GD-PRE-1'),
  null,
  'la coda mostra chi è già stato avvisato'
);
select is(
  (select count(*)::integer from public.audit_events where action = 'order.preorder_ready_notified'
    and entity_id = (select id from fx where name = 'primo')::text),
  1,
  'l''avviso finisce nell''attività'
);
select throws_ok(
  $$select public.mark_preorder_ready_notified((select id from fx where name = 'senza_preordine') + 10000)$$,
  '22023', 'GD_ORDER_INVALID_TRANSITION', 'un ordine che non esiste non si avvisa'
);

-- Un ordine già spedito esce dalla coda e non si avvisa più: vale l'email di spedizione.
reset role;
update public.orders set status = 'shipped', shipped_at = now() where id = (select id from fx where name = 'primo');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004801","role":"authenticated"}', true);
set local role authenticated;
select results_eq($$select order_number from coda$$, $$values ('GD-PRE-2')$$, 'l''ordine spedito lascia la coda');
select throws_ok(
  $$select public.mark_preorder_ready_notified((select id from fx where name = 'primo'))$$,
  '22023', 'GD_ORDER_INVALID_TRANSITION', 'dopo la spedizione conta l''email di spedizione'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004802","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.get_preorder_queue((select id from public.organizations where slug = 'geardrop'))$$,
  '42501', 'GD_ORDER_MANAGER_REQUIRED', 'un editor non vede la coda dei pre-ordini'
);

select * from finish();
rollback;
