-- /meta existed with nothing linking to it: a page a visitor can only reach by typing the
-- URL. The header menu and the shop column of the footer now carry it.
--
-- Targeted rather than a rewrite of the menu. The owner edits navigation from the panel,
-- so this inserts the one entry and moves only the two promotional items that sit after
-- it; anything else he has arranged is left exactly where he put it.

begin;
select pg_advisory_xact_lock(hashtext('20261005110000_meta_enters_the_navigation'));

-- Header: Meta sits after the categories and before the promotional entries.
with menu as (
  select id from public.navigation_menus where menu_key = 'main'
)
insert into public.navigation_items (menu_id, parent_id, label, href, active, sort_order)
select menu.id, null, 'Meta', '/meta', true, 5
from menu
where not exists (
  select 1 from public.navigation_items as item
  where item.menu_id = menu.id and item.href = '/meta'
);

update public.navigation_items as item
set sort_order = case item.href when '/negozio?sort=novita' then 6 else 7 end
from public.navigation_menus as menu
where item.menu_id = menu.id
  and menu.menu_key = 'main'
  and item.href in ('/negozio?sort=novita', '/prodotto/duo-horus-enlil')
  and item.parent_id is null;

-- Footer, shop column: last under the categories, above "Nuovi arrivi".
with column_row as (
  select id from public.footer_columns where column_key = 'shop'
)
insert into public.footer_items (column_id, label, href, active, sort_order)
select column_row.id, 'Meta attuale', '/meta', true, 5
from column_row
where not exists (
  select 1 from public.footer_items as item
  where item.column_id = column_row.id and item.href = '/meta'
);

update public.footer_items as item
set sort_order = 6
from public.footer_columns as column_row
where item.column_id = column_row.id
  and column_row.column_key = 'shop'
  and item.href = '/negozio?sort=novita';

commit;
