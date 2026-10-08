-- 2026-10-08, the owner: a product whose shelf is empty no longer sells as an open pre-order.
-- Open pre-orders (stock 0, no allocation, allow_backorder) had no arrival date, and mixed with
-- pieces in stock they forced a second parcel to the same buyer. From now on such a product is
-- sold out, and the page offers "Avvisami" instead; nobody can buy past the shelf either.
--
-- The pre-orders of a new release with a fixed allocation (availability_override 'preorder')
-- are not affected: they keep selling their allocation. The rule that a pre-order never shares
-- a cart with pieces that ship now lives in the storefront (src/lib/commerce/separate-preorders.ts).
--
-- This turns allow_backorder off (the reverse of 20260917140000). stock_status and
-- is_purchasable are computed, so every product at zero reads 'esaurito' at once.

begin;

update public.products
set allow_backorder = false
where allow_backorder;

commit;
