# Istruzioni per Claude

## Video: sempre anche motion design

Regola del proprietario, dal 2026-10-29. Ogni video che crei o monti per GEAR//DROP (reel,
short, YouTube, video prodotto) include anche motion design, non solo il montaggio.

Motion design vuol dire grafica animata, per esempio:
- titoli e testi animati, con il logo GEAR//DROP animato;
- callout sul prodotto, con nome e codice del pezzo;
- transizioni e overlay grafici coerenti tra loro.

Lo stile è quello X-Rail descritto in [`PRODUCT.md`](PRODUCT.md): lime e viola con i loro
significati, lo slash "//", gli sticker, il codice del pezzo e il rail.

Le clip prodotto si generano con `pnpm clips` (cartella `scripts/clips/`): i dati arrivano dal
catalogo e non contengono mai prezzo, disponibilità o "Novità", perché un video non si aggiorna.
Le clip della galleria finiscono in `public/video/products/`, i reel verticali in `out/clips/`
(non versionati: si pubblicano sui social).

## Sito: motion design dentro "Fast and calm"

Dal 2026-10-29 il proprietario vuole motion design anche nello shop, alle regole di `PRODUCT.md`:
- ogni animazione parte una volta e si ferma, solo per stato e feedback, mai in loop;
- niente che ritardi la prima schermata: l'immagine principale non si anima mai in entrata;
- tutto si ferma con "riduci movimento";
- i numeri mostrati vengono dal server, mai calcolati nel browser.
