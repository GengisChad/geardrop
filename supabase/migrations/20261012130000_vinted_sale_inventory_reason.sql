-- The shop sells on Vinted too (Vinted Pro, opened 2026-10-06), from the same shelf as the site.
-- A Vinted sale takes stock off that shelf, and the ledger says where it went instead of hiding it
-- under a manual correction. The value lives in its own migration: Postgres refuses to use an
-- enum value in the transaction that adds it, and the next migration's functions write it.

alter type public.inventory_reason add value if not exists 'vinted_sale';
