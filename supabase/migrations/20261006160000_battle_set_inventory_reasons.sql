-- Opened Battle Sets get their own lines in the ledger: a set opened to sell its pieces apart
-- ('set_opened'), and a piece whose availability follows its sealed sets ('set_linked'). Own
-- migration, as for 'vinted_sale': an enum value cannot be used in the transaction that adds it.

alter type public.inventory_reason add value if not exists 'set_opened';
alter type public.inventory_reason add value if not exists 'set_linked';
