-- 2026-11-03, the owner: seven more two-colour deck cases, one photo each, "sotto i nuovi portadeck
-- che stanno al prezzo di 18". Same family, same price and no stock limit as the first seven
-- (20261024120000), so the rows keep the counter the shop never shows (9999).
--
-- Catalogue copy and prices live in src/data/catalog.ts; this gives the live database the rows
-- the Stripe webhook scales stock from and the admin counts. Stripe is aligned separately with
-- pnpm stripe:products --apply.
--
-- They sort right after the first seven (19-25 on the live database), so the family's card keeps
-- its place in the shop. A replay changes nothing: new rows are only inserted once.

begin;

with seed(slug, colours, label) as (
  values
  ('porta-deck-viola-menta', 'viola con scritta verde menta e clip bianche', 'Viola e menta'),
  ('porta-deck-argento-nero', 'argento con scritta e clip nere', 'Argento e nero'),
  ('porta-deck-verde-nero', 'verde con scritta e clip nere', 'Verde e nero'),
  ('porta-deck-verde-rosso', 'verde con scritta e clip rosse', 'Verde e rosso'),
  ('porta-deck-blu-bianco', 'blu con scritta e clip bianche', 'Blu e bianco'),
  ('porta-deck-bianco-blu', 'bianco con scritta e clip blu', 'Bianco e blu'),
  ('porta-deck-arancione-nero', 'arancione con scritta nera e clip bianche', 'Arancione e nero')
),
numbered as (
  select seed.*, 25 + row_number() over () as sort_order from seed
),
inserted as (
  insert into public.products (
    category_id, slug, sku, name, tagline, description, price_cents,
    compare_at_price_cents, publication_status, active, stock_quantity,
    availability_override, preorder_allocation, allow_backorder, blade_type, rating, review_count, sort_order
  )
  select
    category.id, numbered.slug, upper(numbered.slug), 'Porta Deck Bicolore ' || numbered.label,
    'Tre trottole al sicuro, in due colori.',
    'Il porta deck bicolore tiene un deck completo di Beyblade X: tre scomparti, uno per trottola, ognuno con la sua chiusura a clip. Entrano anche i bey Expanded e Infinity. Questo è '
      || lower(numbered.label) || ': corpo, scritta e clip in due colori. Stampato in 3D. Accessorio non ufficiale: non è prodotto né certificato da Hasbro o Takara Tomy.',
    1800, null, 'published'::public.publication_status, true, 9999,
    null, 0, false, null, 0, 0, numbered.sort_order
  from numbered
  join public.categories as category on category.slug = 'accessori'
  -- Only new rows: a replay must never reset a counter the shop has already sold from. Not an
  -- ON CONFLICT: the live database keys the slug per organisation (the back-office tables), so
  -- no single-column conflict target exists in both schemas.
  where not exists (select 1 from public.products as existing where existing.slug = numbered.slug)
  returning id, slug, stock_quantity
),
images as (
  insert into public.product_images (product_id, src, width, height, alt, sort_order, published, is_primary)
  select inserted.id, '/products/' || inserted.slug || '.webp', 1000, 1000,
    'Porta deck a tre scomparti stampato in 3D, ' || numbered.colours, 0, true, true
  from inserted
  join numbered on numbered.slug = inserted.slug
  on conflict (product_id, sort_order) do nothing
  returning product_id
)
insert into public.inventory_movements (product_id, delta, stock_after, reason, note)
select inserted.id, inserted.stock_quantity, inserted.stock_quantity, 'initial'::public.inventory_reason,
  'Porta deck bicolore, senza limite di scorta (03/11/2026)'
from inserted;

commit;
