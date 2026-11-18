-- The barcode printed on the product's box (owner, 2026-11-18: "codici ed etichette").
--
-- EAN-13 on Hasbro and Takara Tomy boxes, UPC-A (12), EAN-8 or GTIN-14. Scanned when a parcel is
-- checked at the warehouse, and the identifier Merchant Center has been asking for. The check
-- digit is verified by the admin before saving; the database keeps the shape and one product per
-- code inside each company, so a scan never matches two products.

alter table public.products add column gtin text;

alter table public.products
  add constraint products_gtin_shape check (gtin is null or gtin ~ '^([0-9]{8}|[0-9]{12,14})$');

create unique index products_organization_gtin_key on public.products (organization_id, gtin) where gtin is not null;

comment on column public.products.gtin is
  'Barcode on the box (EAN-13, UPC-A, EAN-8 or GTIN-14), digits only; scanned at packing and sent to Merchant Center.';
