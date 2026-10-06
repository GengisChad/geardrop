-- 2026-09-29, the owner: free shipping moves from 59€ to 100€.
--
-- The stadium box is 45x45x15, so every carrier bills it at its 6 kg volumetric weight and Poste
-- adds a 5,00 out-of-format fee (45 + 2*(45+15) = 165 cm, over the 150 cm limit): a parcel that
-- costs around 12,40 against the 4,90 collected. At 59€ a single arena plus one small piece
-- cleared the threshold, so the shop shipped its most expensive parcel for free.
--
-- The flat rate itself is unchanged at 4,90. Copy lives in src/data/pages.ts; this mirrors it into
-- the managed content_pages rows. Legal pages are static text and have no managed row.

begin;

update public.content_pages
set markdown_source = replace(
  markdown_source,
  'La spedizione standard è gratuita per ordini superiori a 59€.',
  'La spedizione standard è gratuita per ordini superiori a 100€.'
)
where slug = 'faq'
  and markdown_source like '%superiori a 59€%';

update public.content_pages
set markdown_source = replace(
  markdown_source,
  'Spedizione gratuita per ordini superiori a 59€.',
  'Spedizione gratuita per ordini superiori a 100€.'
)
where slug = 'spedizioni'
  and markdown_source like '%superiori a 59€%';

commit;
