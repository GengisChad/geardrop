-- The deck case shows one picture for every colour (owner's choice, 2026-09-21): the yellow case
-- above "Scegli il tuo colore" and a swatch per colour, built by scripts/cut_deck_cases.py. The
-- per-colour cut-outs and the line-up it replaces are gone from the site.

begin;

delete from public.product_images as image
using public.products as product
where product.id = image.product_id
  and product.slug like 'porta-deck-%'
  and image.sort_order > 0;

update public.product_images as image
set src = '/products/porta-deck.webp',
  width = 1000,
  height = 1000,
  alt = 'Porta deck Beyblade X giallo a tre scomparti, disponibile in giallo, verde lime, azzurro, blu, rosa, fucsia e bianco'
from public.products as product
where product.id = image.product_id
  and product.slug like 'porta-deck-%'
  and image.sort_order = 0;

commit;
