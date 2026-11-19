-- Il carrello consiglia i pezzi che gli ordini pagati tenevano insieme: il server legge le righe
-- d'ordine con la propria chiave, i visitatori no.
begin;
select plan(6);

select ok(
  has_column_privilege('service_role', 'public.orders', 'payment_status', 'SELECT'),
  'the server can tell a paid order'
);
select ok(
  has_column_privilege('service_role', 'public.orders', 'organization_id', 'SELECT'),
  'the server can keep to the shop''s own orders'
);
select ok(
  has_column_privilege('service_role', 'public.order_items', 'sku_snapshot', 'SELECT'),
  'the server can read which piece a line sold'
);
select ok(
  has_column_privilege('service_role', 'public.order_items', 'quantity', 'SELECT'),
  'the server can read how many'
);
select ok(
  not has_column_privilege('anon', 'public.order_items', 'sku_snapshot', 'SELECT'),
  'a guest cannot read order lines'
);
select ok(
  not has_column_privilege('anon', 'public.orders', 'payment_status', 'SELECT'),
  'a guest cannot read orders'
);

select * from finish();
rollback;
