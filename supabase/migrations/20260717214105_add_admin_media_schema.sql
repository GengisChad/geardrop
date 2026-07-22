alter type public.product_relation_type add value if not exists 'cross_sell';
alter type public.product_relation_type add value if not exists 'compatible';

alter table public.products add column short_name text;
alter table public.products add column manage_stock boolean not null default true;
alter table public.products add column low_stock_threshold integer not null default 5;
alter table public.products add column allow_backorder boolean not null default false;
alter table public.products add column preorder_release_date date;
alter table public.products add column seo_title text;
alter table public.products add column seo_description text;

alter table public.products
  add constraint products_short_name_nonempty
  check (short_name is null or nullif(btrim(short_name), '') is not null),
  add constraint products_low_stock_threshold_nonnegative
  check (low_stock_threshold >= 0);

create table public.media_assets (
  id bigint generated always as identity primary key,
  bucket_id text not null default 'product-images'
    check (bucket_id = 'product-images'),
  object_path text not null
    check (object_path = btrim(object_path) and object_path <> ''),
  original_filename text not null
    check (nullif(btrim(original_filename), '') is not null),
  mime_type text not null
    check (mime_type in ('image/png', 'image/jpeg', 'image/webp', 'image/avif')),
  byte_size bigint not null
    check (byte_size > 0 and byte_size <= 10485760),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  alt_text text not null check (nullif(btrim(alt_text), '') is not null),
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket_id, object_path)
);

-- Enable RLS in the same migration that creates the exposed table so a later
-- migration failure cannot leave it temporarily readable without policies.
alter table public.media_assets enable row level security;

create or replace function private.preserve_media_asset_provenance()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.uploaded_by is distinct from old.uploaded_by then
    raise exception using errcode = '23514', message = 'GD_MEDIA_UPLOADER_IMMUTABLE';
  end if;
  return new;
end;
$$;

revoke all on function private.preserve_media_asset_provenance()
from public, anon, authenticated;

create trigger media_assets_preserve_provenance
before update of uploaded_by on public.media_assets
for each row execute function private.preserve_media_asset_provenance();

alter table public.product_images
  add column media_asset_id bigint references public.media_assets(id) on delete set null,
  add column is_primary boolean not null default false;

create unique index product_images_one_primary_idx
  on public.product_images(product_id)
  where is_primary;
create index product_images_media_asset_id_idx
  on public.product_images(media_asset_id)
  where media_asset_id is not null;
create index media_assets_uploader_created_idx
  on public.media_assets(uploaded_by, created_at desc);

create index products_admin_search_idx
  on public.products using gin (
    to_tsvector(
      'simple'::regconfig,
      coalesce(name, '') || ' ' ||
      coalesce(short_name, '') || ' ' ||
      coalesce(sku, '') || ' ' ||
      coalesce(slug, '')
    )
  );
create index products_admin_status_updated_idx
  on public.products(publication_status, updated_at desc, id desc);
create index products_admin_low_stock_idx
  on public.products(stock_quantity, updated_at desc)
  where manage_stock and publication_status <> 'archived'::public.publication_status;

create trigger media_assets_set_updated_at
before update on public.media_assets
for each row execute function private.set_updated_at();

-- Bucket configuration is migration-owned. Object writes and deletes remain Storage API-only.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'product-images',
  'product-images',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/avif']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
