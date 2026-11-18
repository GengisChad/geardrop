-- Il codice a barre della scatola: solo cifre (8 o 12-14) e mai lo stesso su due prodotti della
-- stessa azienda, così una scansione al controllo pacco non può indicare due pezzi.
begin;
select plan(5);

select has_column('public', 'products', 'gtin', 'products keep the barcode of their box');
select col_is_null('public', 'products', 'gtin', 'a product may have no barcode');

create temporary table pick on commit drop as
select id from public.products
where organization_id = (select id from public.organizations where slug = 'geardrop')
order by id
limit 2;

select lives_ok(
  $$update public.products set gtin = '5010996214645' where id = (select min(id) from pick)$$,
  'an EAN-13 is saved'
);
select throws_ok(
  $$update public.products set gtin = '5010996214645' where id = (select max(id) from pick)$$,
  '23505',
  null,
  'two products of one company cannot share a barcode'
);
select throws_ok(
  $$update public.products set gtin = 'ABC123' where id = (select max(id) from pick)$$,
  '23514',
  null,
  'a barcode is digits only, 8 or 12 to 14 of them'
);

select * from finish();
rollback;
