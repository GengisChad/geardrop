-- The owner's rule (2026-09-21): a pre-order with a fixed number of pieces sells that number and
-- no more. When its allocation reaches zero it reads 'esaurito' until the owner adds pieces.
-- It was already closed to purchase (is_purchasable needs allocation), but it still read
-- 'pre-ordine', so the shop kept calling a finished drop a pre-order. A pre-order with stock
-- on the shelf, an open pre-order and the automatic one are unchanged.
--
-- The deck cases go from €20 to €24,50 (catalog.ts; Stripe is aligned by pnpm stripe:products).

begin;

alter table public.products
  alter column stock_status set expression as (
    case
      when availability_override = 'preorder'::public.availability_override
        and preorder_allocation <= 0
        and stock_quantity <= 0 then 'esaurito'::public.stock_status
      when availability_override = 'preorder'::public.availability_override then 'pre-ordine'::public.stock_status
      when availability_override = 'incoming'::public.availability_override then 'in-arrivo'::public.stock_status
      when stock_quantity > 0 then 'disponibile'::public.stock_status
      when allow_backorder then 'pre-ordine'::public.stock_status
      else 'esaurito'::public.stock_status
    end
  );

update public.products
set price_cents = 2450
where slug in (
  'porta-deck-giallo', 'porta-deck-verde-lime', 'porta-deck-azzurro', 'porta-deck-blu',
  'porta-deck-rosa', 'porta-deck-fucsia', 'porta-deck-bianco'
)
  and price_cents = 2000;

commit;
