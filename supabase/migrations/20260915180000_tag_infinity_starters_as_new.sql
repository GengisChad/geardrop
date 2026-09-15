begin;

-- Flags the three Infinity Starter preorders as new releases, matching src/data/catalog.ts,
-- so the storefront lists them under "Nuove uscite" and first under "Nuovi arrivi".
-- Additive only: existing tags are left untouched and a rerun inserts nothing.
insert into public.product_tags (product_id, tag)
select product.id, 'novita'::public.promo_tag
from public.products as product
where product.slug in ('glory-valkerion-lf', 'hurricane-enlil-is-7-55t', 'shatter-horus-9-65gb')
on conflict (product_id, tag) do nothing;

commit;
