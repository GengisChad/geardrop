alter table public.products
  add column is_low_stock boolean generated always as (
    manage_stock
    and stock_quantity > 0
    and stock_quantity <= low_stock_threshold
    and publication_status <> 'archived'::public.publication_status
  ) stored not null;

create index products_admin_is_low_stock_idx
  on public.products(updated_at desc, id desc)
  where is_low_stock;
