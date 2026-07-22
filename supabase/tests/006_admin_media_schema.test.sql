begin;
select plan(33);

select has_table('public', 'media_assets', 'normalized media assets table exists');

select has_column('public', 'products', 'short_name', 'products have a short name');
select has_column('public', 'products', 'manage_stock', 'products have a stock-management switch');
select has_column('public', 'products', 'low_stock_threshold', 'products have a low-stock threshold');
select has_column('public', 'products', 'allow_backorder', 'products have a backorder switch');
select has_column('public', 'products', 'preorder_release_date', 'products have a preorder release date');
select has_column('public', 'products', 'seo_title', 'products have an SEO title');
select has_column('public', 'products', 'seo_description', 'products have an SEO description');

select has_column('public', 'media_assets', 'id', 'media assets have an id');
select has_column('public', 'media_assets', 'bucket_id', 'media assets store the bucket');
select has_column('public', 'media_assets', 'object_path', 'media assets store the object path');
select has_column('public', 'media_assets', 'original_filename', 'media assets store the original filename');
select has_column('public', 'media_assets', 'mime_type', 'media assets store the MIME type');
select has_column('public', 'media_assets', 'byte_size', 'media assets store the byte size');
select has_column('public', 'media_assets', 'width', 'media assets store width');
select has_column('public', 'media_assets', 'height', 'media assets store height');
select has_column('public', 'media_assets', 'alt_text', 'media assets store alt text');
select has_column('public', 'media_assets', 'uploaded_by', 'media assets store the uploader');
select has_column('public', 'media_assets', 'created_at', 'media assets store creation time');
select has_column('public', 'media_assets', 'updated_at', 'media assets store update time');

select has_column('public', 'product_images', 'media_asset_id', 'product images may link to media');
select has_column('public', 'product_images', 'is_primary', 'product images identify the primary image');
select fk_ok(
  'public', 'product_images', 'media_asset_id',
  'public', 'media_assets', 'id',
  'product image media links are referentially valid'
);

select results_eq(
  $$
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.media_assets'::regclass
  $$,
  array[true],
  'media assets have RLS enabled'
);
select results_eq(
  $$
    select enumlabel
    from pg_catalog.pg_enum
    where enumtypid = 'public.product_relation_type'::regtype
      and enumlabel in ('cross_sell', 'compatible')
    order by enumsortorder
  $$,
  array['cross_sell', 'compatible']::name[],
  'admin relation types are available in order'
);
select results_eq(
  $$select count(*)::bigint from storage.buckets where id = 'product-images'$$,
  array[1::bigint],
  'product-images bucket exists'
);
select results_eq(
  $$select public from storage.buckets where id = 'product-images'$$,
  array[false],
  'product-images bucket stays private'
);
select results_eq(
  $$select file_size_limit from storage.buckets where id = 'product-images'$$,
  array[10485760::bigint],
  'product-images bucket has a conservative 10 MiB limit'
);
select results_eq(
  $$
    select allowed.mime_type
    from storage.buckets as bucket
    cross join lateral unnest(bucket.allowed_mime_types) as allowed(mime_type)
    where bucket.id = 'product-images'
    order by allowed.mime_type
  $$,
  array['image/avif', 'image/jpeg', 'image/png', 'image/webp']::text[],
  'product-images allows only PNG, JPEG, WebP, and AVIF'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and tablename = 'product_images'
      and indexname = 'product_images_one_primary_idx'
      and indexdef ilike '%unique%where is_primary%'
  $$,
  array[1::bigint],
  'product images have a partial unique primary-image index'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname in ('media_assets_uploader_created_idx', 'product_images_media_asset_id_idx')
  $$,
  array[2::bigint],
  'media lookup foreign keys and recency are indexed'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname in (
        'products_admin_search_idx',
        'products_admin_status_updated_idx',
        'products_admin_low_stock_idx'
      )
  $$,
  array[3::bigint],
  'admin product search, sort, and low-stock filters are indexed'
);

insert into public.product_images (
  product_id, src, width, height, alt, sort_order, published, is_primary
)
select id, '/primary-contract-one.png', 10, 10, 'Primary one', 9000, false, true
from public.products
where sku = 'wizard-arrow-4-80b';

select throws_ok(
  $$
    insert into public.product_images (
      product_id, src, width, height, alt, sort_order, published, is_primary
    )
    select id, '/primary-contract-two.png', 10, 10, 'Primary two', 9001, false, true
    from public.products
    where sku = 'wizard-arrow-4-80b'
  $$,
  '23505',
  'duplicate key value violates unique constraint "product_images_one_primary_idx"',
  'a product cannot have two primary images'
);

select * from finish();
rollback;
