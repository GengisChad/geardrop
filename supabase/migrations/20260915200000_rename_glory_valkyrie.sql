begin;

-- The owner confirmed this product is sold as Glory Valkyrie LF. The row is renamed in place,
-- so orders, inventory movements, tags and relations keep pointing at the same product id.
update public.products
set slug = 'glory-valkyrie-lf',
    sku = 'GLORY-VALKYRIE-LF',
    name = 'Glory Valkyrie LF',
    description = 'Glory Valkyrie LF è una trottola d''attacco a rotazione destra della linea UX: la blade integra il ratchet in un unico pezzo e il Bit Low Flat (LF), a punta piatta e bassa, la spinge in movimenti rapidi e aggressivi per agganciare l''Xtreme Line e scatenare l''Xtreme Dash. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).'
where slug = 'glory-valkerion-lf';

update public.product_images as image
set src = '/products/glory-valkyrie-lf.webp',
    alt = 'Confezione Beyblade X Glory Valkyrie LF bianca e oro con lanciatore e trottola'
from public.products as product
where product.id = image.product_id
  and product.slug = 'glory-valkyrie-lf'
  and image.src = '/products/glory-valkerion-lf.webp';

update public.product_box_contents as box_item
set content = '1 × Trottola Glory Valkyrie LF'
from public.products as product
where product.id = box_item.product_id
  and product.slug = 'glory-valkyrie-lf'
  and box_item.content = '1 × Trottola Glory Valkerion LF';

commit;
