begin;
select plan(5);

-- A funded pre-order sells its allocation and no more (owner's rule, 2026-09-21).
insert into public.categories(slug,name,tagline,description,active,publication_status,published_at)
values('sold-out-preorder-cat','Sold out','S','S',true,'published',now());
insert into public.products(category_id,slug,sku,name,tagline,description,price_cents,publication_status,active,stock_quantity,allow_backorder,availability_override,preorder_allocation)
values
  ((select id from public.categories where slug='sold-out-preorder-cat'),'funded-last','FUNDED-LAST','Funded last','F','F',2500,'published',true,0,true,'preorder',1),
  ((select id from public.categories where slug='sold-out-preorder-cat'),'funded-shelf','FUNDED-SHELF','Funded shelf','F','F',2500,'published',true,2,true,'preorder',0),
  ((select id from public.categories where slug='sold-out-preorder-cat'),'open-pre','OPEN-PRE','Open pre','O','O',2500,'published',true,0,true,null,0);

select results_eq($$select stock_status::text, is_purchasable from public.products where slug = 'funded-last'$$,
  $$values ('pre-ordine'::text, true)$$, 'a funded pre-order with pieces left sells as a pre-order');
update public.products set preorder_allocation = 0 where slug = 'funded-last';
select results_eq($$select stock_status::text, is_purchasable from public.products where slug = 'funded-last'$$,
  $$values ('esaurito'::text, false)$$, 'at zero allocation it is sold out, backorder switch or not');
update public.products set preorder_allocation = 5 where slug = 'funded-last';
select results_eq($$select stock_status::text, is_purchasable from public.products where slug = 'funded-last'$$,
  $$values ('pre-ordine'::text, true)$$, 'new pieces from the owner reopen it');
select results_eq($$select stock_status::text, is_purchasable from public.products where slug = 'funded-shelf'$$,
  $$values ('pre-ordine'::text, true)$$, 'a pre-order with stock on the shelf still sells');
select results_eq($$select stock_status::text, is_purchasable from public.products where slug = 'open-pre'$$,
  $$values ('pre-ordine'::text, true)$$, 'an open pre-order keeps selling without a limit');

select * from finish();
rollback;
