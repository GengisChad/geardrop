-- The two "Da sapere prima di comprare" notes quoted WBO tournament rules — the Ranked
-- Clause on Shadow Shinobi's metal tip, and Wand Wizard's blade being out of 1on1 since
-- 2025. The owner competes on the Italian national circuit, where both pieces are legal,
-- so those lines warned his own buyers about a restriction that does not apply to them,
-- in the box they read while deciding.
--
-- Shadow Shinobi keeps the part that is a fact about the buyer's own stadium rather than
-- a rule: the metal tip can mark the floor. Wand Wizard has no caveat left to give, so it
-- takes the "Starter completo" line its siblings carry at the same position.

with seed(product_slug, title, description, sort_order) as (
  values
  ('shadow-shinobi-1-80mn', 'Da sapere prima di comprare', 'La punta in metallo può segnare il fondo dello stadio', 3),
  ('wand-wizard-1-60r', 'Starter completo', 'Trottola e lanciatore con ripcord inclusi', 3)
)
insert into public.product_features (product_id, title, description, sort_order)
select product.id, seed.title, seed.description, seed.sort_order
from seed join public.products as product on product.slug = seed.product_slug
on conflict (product_id, sort_order) do update set title = excluded.title, description = excluded.description;
