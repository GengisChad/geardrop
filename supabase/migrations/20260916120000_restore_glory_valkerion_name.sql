begin;

-- The owner confirmed the product really is Glory Valkerion LF, as printed on the box, so the
-- earlier rename to "Glory Valkyrie" is reverted in place: orders, inventory movements, tags and
-- relations keep pointing at the same product id.
update public.products
set slug = 'glory-valkerion-lf',
    sku = 'GLORY-VALKERION-LF',
    name = 'Glory Valkerion LF',
    description = 'Glory Valkerion LF è una trottola d''attacco a rotazione destra della linea UX: la blade integra il ratchet in un unico pezzo e il Bit Low Flat (LF), a punta piatta e bassa, la spinge in movimenti rapidi e aggressivi per agganciare l''Xtreme Line e scatenare l''Xtreme Dash. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).'
where slug = 'glory-valkyrie-lf';

update public.product_images as image
set src = '/products/glory-valkerion-lf.webp',
    alt = 'Confezione Beyblade X Glory Valkerion LF bianca e oro con lanciatore e trottola'
from public.products as product
where product.id = image.product_id
  and product.slug = 'glory-valkerion-lf'
  and image.src = '/products/glory-valkyrie-lf.webp';

update public.product_box_contents as box_item
set content = '1 × Trottola Glory Valkerion LF'
from public.products as product
where product.id = box_item.product_id
  and product.slug = 'glory-valkerion-lf'
  and box_item.content = '1 × Trottola Glory Valkyrie LF';

commit;
