# Provenienza delle foto prodotto

Regola del proprietario, dal 2026-10-29: una foto prodotto troppo piccola si può sostituire con una
presa da internet, purché sia **fedele** al prodotto venduto (stessa edizione, stessa confezione,
stesso contenuto) e **senza watermark**. Valgono solo le immagini ufficiali del produttore: Hasbro
per Hasbro, Takara Tomy per Takara Tomy. Si trovano sui siti del marchio, oppure ripubblicate senza
modifiche dai suoi negozi su Amazon o da grandi rivenditori. Mai foto di annunci o di utenti, render
di fan o immagini generate; un watermark non si cancella, si cambia foto.

Gli originali stanno in `prodotti/` (Hasbro) e in `assets-source/` (Takara Tomy). Le card, gli
scontorni, le trottole sciolte, i kit e le clip si rigenerano da lì con gli script indicati in
fondo. Per le foto non elencate qui restano valide le note degli script.

## Sostituite il 2026-10-29

| Prodotto | File | Px | Fonte dell'immagine | Pagina | Confezione |
| --- | --- | --- | --- | --- | --- |
| Cobalt Dragoon 2-60C | `prodotti/cobaltdragoon.jpg` | 2000 | `m.media-amazon.com/images/I/81SvI+okTFL.jpg` | amazon.co.uk/dp/B0D9Z364CT, Hasbro G1491 | EN/FR/ES/PT |
| Saber Samurai 2-70L | `prodotti/sabersamurai.jpg` | 2400 | `target.scene7.com/is/image/Target/GUEST_c2dd4441-a80b-4a30-b234-39640dba53a8` | target.com/p/-/A-93566600, Hasbro G1862 (lo stesso master è su Amazon B0DNFPBQKK) | EN/FR/ES/PT |
| Hurricane Enlil IS 7-55T | `prodotti/hurricaneenlil.jpg` | 2000 | `m.media-amazon.com/images/I/71UQqPVECvL.jpg` | amazon.it/dp/B0H5KXJKNG, store Hasbro | EN/FR/DE/ES |
| Shatter Horus 9-65GB | `prodotti/shatterhorus.jpg` | 1969×1994 | `m.media-amazon.com/images/I/817ZZkxRKmL.jpg` | amazon.it/dp/B0H1RDSG4F, Hasbro G4567 | EN/FR/DE/ES |
| Drop Attack Battle Set | `prodotti/dropattack.jpg` | 2000 | `m.media-amazon.com/images/I/81gazOutLuL.jpg` | amazon.it/dp/B0DNFPM6KB, Hasbro G0842 | EN/FR/ES/PT |
| Sneak Attack Battle Set | `prodotti/sneakattack.jpg` | 2000 | `m.media-amazon.com/images/I/71Oi0-QsATL.jpg` | amazon.it/dp/B0G7KXGVSR, store Hasbro | EN/FR/ES/PT |
| Soar Phoenix 9-60GF | `prodotti/phoenixred.jpg` | 2000 | `m.media-amazon.com/images/I/81nvIcSbQeL.jpg` | amazon.it/dp/B0D1YLNVB4, Hasbro F9324 | EN/FR/ES/PT |
| Buster Dran 5-70DB | `prodotti/busterdran.jpg` | 2000 | `m.media-amazon.com/images/I/81p9qhMAIdL.jpg` | amazon.it/dp/B0H1RD5Z8V, Hasbro G3611 | EN/FR/ES/PT |
| Hammer Incendio 3-70H | `prodotti/hammerincendio.jpg` | 2000 | `m.media-amazon.com/images/I/81dxI82B68L.jpg` | amazon.it/dp/B0DNFNS18N, store Hasbro Gaming | EN/FR/ES/PT |
| Shadow Shinobi 1-80MN | `prodotti/shadowshinobi.jpg` | 2000 | `m.media-amazon.com/images/I/71fup85RzHL.jpg` | amazon.it/dp/B0DNFQ4461, store Hasbro | EN/FR/ES/PT |
| Wand Wizard 1-60R | `prodotti/wandwizard.jpg` | 2000 | `m.media-amazon.com/images/I/71RYaeIY2TL.jpg` | amazon.it/dp/B0D87KQ1RH, store Hasbro | EN/FR/ES/PT |
| Glory Valkerion LF | `prodotti/gloryValkerion.jpg` | 1000 | `static.prod.ecom.mueller.de/_default_upload_bucket/G4568EU40_combo_26_tif_50px-margin_1000px_72DPI.jpg` | mueller.de, scheda PPN3207952, file Hasbro G4568EU40 | EN/FR/DE/ES |
| Suppress Superion 0-70LP | `prodotti/suppressSuperion.jpg` | 2000 | `m.media-amazon.com/images/I/81fFs-qRCOL.jpg` | amazon.ca/dp/B0FY73BCPP, store Beyblade, Hasbro G2745 | EN/FR/ES/PT |
| CX-00 Tigarage FT3-60T | `assets-source/tigarage.jpg` | 1200×1500 | `cdn.kyodonewsprwire.jp/prwfile/release/M000076/202607092286/_prw_PI5fl_CJm5XQ7G.jpg` | kyodonewsprwire.jp/release/202607092286, comunicato Takara Tomy | Giapponese |

Le foto Hasbro, tranne Glory Valkerion, sono lo stesso scatto usato prima a 447–554 px, ora in
alta risoluzione. Shatter Horus è ritagliato di 31 px a sinistra e 3 px sopra e sotto, per togliere la
cornice nera aggiunta dalla copia Amazon; nient'altro è ritoccato. Prima, Glory Valkerion era la
foto di una scatola contro un muro presa da un annuncio, con il watermark coperto a mano: ora è il
packshot Hasbro. Il formato più grande che Hasbro dà ai rivenditori europei è 1000 px.

## Ancora da migliorare

- **UX-00 Glory Valkyrie LF** (750 px, foto del partner): l'unica foto ufficiale della scatola
  sarebbe su Takara Tomy Mall, che oggi non risponde. Il sito Takara Tomy ha solo il render del
  contenuto (`beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/BXG63@2.png`).
- **CX-00 Evangelion Deck Set** (878 px, foto del partner): il sito Takara Tomy ha un render
  ufficiale del contenuto senza scatola (`.../lineup/_image/BXG57@2.png`, 1172×1418). Si può usare
  come seconda foto della galleria, se il proprietario vuole.

## Rigenerare

Si cancellano i file derivati del prodotto (card, `cutout/`, `tops/`, `boxes/` e i kit che lo usano),
poi si lanciano gli script. Senza `--force` rifanno solo quello che manca:

```
python scripts/normalize_images.py
python scripts/cutout_products.py
python scripts/compose_bundle_images.py
python scripts/cutout_takara.py
node scripts/build-loose-tops.mjs
pnpm clips
```

Se cambia l'inquadratura di una foto con la trottola accanto alla scatola, vanno rimisurati i
cerchi in `TOP_CROPS` e i ritagli in `COMPOSITES` di `scripts/cutout_products.py`.
