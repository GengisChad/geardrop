-- 2026-10-24, the owner: seven two-colour deck cases (one photo each), and every deck case at
-- €18 instead of €24,50 ("li paghiamo 6 euro, quindi abbiamo margine"). No stock limit: "scorta
-- non ne mettere, ne abbiamo tanti", so the rows keep the counter the shop never shows (9999).
--
-- Catalogue copy and prices live in src/data/catalog.ts; this gives the live database the rows
-- the Stripe webhook scales stock from and the admin counts. Stripe is aligned separately with
-- pnpm stripe:products --apply. The kits' prices are not database rows (bundles have none).
--
-- A replay changes nothing: new rows are only inserted once, and the price is already €18.

begin;

with seed(slug, colours, label) as (
  values
  ('porta-deck-nero-blu', 'nero con scritta e clip blu', 'Nero e blu'),
  ('porta-deck-nero-rosso', 'nero con scritta e clip rosse', 'Nero e rosso'),
  ('porta-deck-nero-oro', 'nero con scritta e clip oro', 'Nero e oro'),
  ('porta-deck-giallo-nero', 'giallo con scritta nera e clip grigie', 'Giallo e nero'),
  ('porta-deck-rosso-oro', 'rosso con scritta e clip oro', 'Rosso e oro'),
  ('porta-deck-viola-verde', 'viola con scritta e clip verdi', 'Viola e verde'),
  ('porta-deck-viola-argento', 'viola con scritta e clip argento', 'Viola e argento')
),
numbered as (
  select seed.*, 18 + row_number() over () as sort_order from seed
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
  'Porta deck bicolore, senza limite di scorta (24/10/2026)'
from inserted;

-- Every single-colour case from €24,50 to €18.
update public.products
set price_cents = 1800
where slug in ('porta-deck-giallo', 'porta-deck-verde-lime', 'porta-deck-azzurro', 'porta-deck-blu',
               'porta-deck-rosa', 'porta-deck-fucsia', 'porta-deck-bianco')
  and price_cents <> 1800;

commit;
