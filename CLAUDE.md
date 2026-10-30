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
(non versionati: si pubblicano sui social). La clip della galleria non ripete il logo, che la
pagina mostra già nell'intestazione; il reel lo anima in apertura.

I reel su riprese vere (battaglie, test) prendono motion design e musica originale sopra il montaggio
con `scripts/clips/footage/`: vedi il suo README.

## Foto prodotto

Regola del proprietario, dal 2026-10-29: se una foto prodotto non è di buona qualità, si può
prendere da internet, purché sia fedele al prodotto venduto (stessa edizione e confezione) e senza
watermark. Solo immagini ufficiali Hasbro o Takara Tomy; mai foto di annunci, e un watermark non
si cancella. La fonte di ogni foto va scritta in
[`docs/product-photo-sources.md`](docs/product-photo-sources.md), che spiega anche come rigenerare
card, scontorni, kit e clip.

## Sito: motion design dentro "Fast and calm"

Dal 2026-10-29 il proprietario vuole motion design anche nello shop, alle regole di `PRODUCT.md`:
- ogni animazione parte una volta e si ferma, solo per stato e feedback, mai in loop;
- niente che ritardi la prima schermata: all'apertura della pagina l'immagine principale non si
  anima mai; l'unico movimento approvato per lei è il passaggio della foto dalla card alla scheda;
- tutto si ferma con "riduci movimento";
- totali e quanto manca alla spedizione gratuita vengono dal preventivo del server, mai calcolati
  nel browser.
