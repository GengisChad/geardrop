# GEAR//DROP — Reference Audit

Analisi dei materiali forniti, eseguita **prima** dell'implementazione. Questo documento è la
fonte di verità per token, componenti e comportamenti. Ogni scelta di design nel codice deve
essere riconducibile a una riga di questo file.

## 1. Inventario dei materiali

Forniti 7 mockup di pagina + 3 file logo. Nessuna cartella `/public/reference` o
`/public/products` era presente: è stata creata da `scripts/build-assets.py`.
Gli originali sono conservati intatti in `assets-source/`.

| File in `assets-source/` | Cosa mostra | Ruolo |
| --- | --- | --- |
| `mockup-home-upper.png` (941×1672) | Header, hero, tile categorie, legenda stati, "IN EVIDENZA", trust band | Home, parte alta |
| `mockup-home-lower.png` (1122×1402) | "ULTIMI DROP", "PIÙ VENDUTI", bundle banner, trust bar, "SCELTI PER IL COMPETITIVO", club band, footer | Home, parte bassa |
| `mockup-catalog-desktop.png` (1122×1402) | Hero categoria, sidebar filtri, griglia 4 col, paginazione | Catalogo desktop |
| `mockup-catalog-mobile.png` (941×1672) | Griglia 2 col, filtri+ordina, sticky cart bar, bottom tab bar | Catalogo mobile |
| `mockup-pdp-stadium-desktop.png` (1122×1402) | Galleria, colonna acquisto, feature list, tab, "SI ABBINA BENE CON" | PDP desktop |
| `mockup-pdp-cobalt-mobile.png` (941×1672) | PDP mobile, specifiche, accordion, sticky buy bar | PDP mobile |
| `mockup-design-system.png` (1122×1402) | **Design system v1.0** — 14 sezioni con hex e scale espliciti | **Fonte di verità primaria** |
| `logo-lockup.png` (2508×627) | Emblema + wordmark | Header desktop |
| `logo-emblem.png` (1254×1254) | Solo emblema | Favicon, loader, mobile, badge |
| `logo-wordmark.png` (2508×627) | Solo wordmark | Lockup alternativi |

> `mockup-design-system.png` è etichettato "DESIGN SYSTEM • v1.0" e dichiara i valori a testo.
> Dove i mockup di pagina lo contraddicono, **vince il design system**.

## 2. Palette (sezione 04, valori dichiarati)

### Primari
| Token | Hex | Uso osservato |
| --- | --- | --- |
| Acid Lime | `#C6FF00` | CTA primaria, prezzi in hero, accento "//" , icone carrello, riga attiva |
| Violetto | `#7A3CFF` | Badge, bordi hover, focus, cerchi trust, loader, paginazione attiva |
| Grafite | `#121417` | Fondo footer/announcement bar, testo titoli, bottone "AGGIUNGI" |
| Grigio 700 | `#2A2D34` | Superfici scure secondarie |
| Bianco | `#FFFFFF` | Card, superfici prodotto |

### Neutri
`Grigio 100 #F5F6F8` · `Grigio 200 #E9EBEE` · `Grigio 300 #D7DCE3` · `Grigio 400 #B9BEC7` · `Grigio 600 #7A808C`

### Gradienti
- **Lime Glow** — lime pieno → lime pallido
- **Violet Energy** — violetto pieno → violetto pallido

### Colori di stato (sezione 03)
| Stato | Trattamento |
| --- | --- |
| `DISPONIBILE` | verde, testo scuro su fondo tenue |
| `IN ARRIVO` | giallo/ambra |
| `ESAURITO` | rosso |
| `PRE-ORDINE` | violetto |
| `NOVITÀ` / `OFFERTA` / `LIMITED` / `ESCLUSIVA` | pill promozionali |

Il verde di stato è **distinto** dall'Acid Lime: lime = azione, verde = disponibilità.

## 3. Tipografia (sezione 05)

- **Titoli** — dichiarati "DIN NEXT / EUROSTILE EXTENDED": grottesco largo, squadrato,
  maiuscolo, tracking stretto. Entrambi sono font commerciali → nel codice si usa
  **Archivo** (variabile, asse `wdth` esteso), il più vicino libero e self-hostable.
- **Body** — **Inter / Regular**, usato così com'è.

| Livello | Dichiarato | Note |
| --- | --- | --- |
| H1 | 48/56 Bold | "PRONTI ALLA BATTAGLIA." |
| H2 | 32/40 Bold | "LANCIA, COMBATTI, VINCI." |
| H3 | 20/28 SemiBold | |
| Body | 16/24 Regular | |
| Small | 12/16 Regular | |

Il pattern hero è **due righe grafite + una riga lime** (mockup home-upper, design system).
I titoli di sezione sono maiuscoli + un **glifo `///` lime** come marcatore ("ULTIMI DROP ///",
"IN EVIDENZA ///", "SI ABBINA BENE CON ///", "PRODOTTI CORRELATI ///").

## 4. Struttura delle pagine

### Home
1. Announcement bar (grafite): spedizione gratuita 59€ · nuovi drop · club
2. Header: lockup, nav, ricerca, account, carrello con badge
3. Hero: eyebrow Beyblade X, H1 su 3 righe, sottotesto, CTA lime + CTA secondaria, dots carosello
4. 4 tile categoria (Beyblade, Lanciatori, Stadi, Accessori) con chevron
5. Legenda 4 stati stock
6. "IN EVIDENZA" — carosello prodotti
7. Trust band scura (4 voci, cerchi violetti, angolo tagliato)
8. "ULTIMI DROP" — carosello, frecce laterali, "VEDI TUTTI"
9. "PIÙ VENDUTI" — carosello con badge rank numerati (1 lime, 2-5 grafite/arancio)
10. Bundle banner scuro: "SCATENA IL TUO POTENZIALE", prezzo scontato, badge risparmio
11. Trust bar chiara (4 voci)
12. "SCELTI PER IL COMPETITIVO" — 4 card tipo (Attacco/Difesa/Stamina/Bilanciato)
13. Club band: 5% sconto, drop in anteprima, punti fedeltà, regali
14. Newsletter + community + social
15. Footer: 4 colonne link, lockup, payment badge, copyright

### Catalogo
Hero categoria con art prodotto · breadcrumb · sidebar filtri (categorie con conteggi,
disponibilità con checkbox colorati, tipo, range prezzo, "APPLICA FILTRI") · barra "N prodotti
trovati" + "ORDINA PER" · griglia 4 col · paginazione · trust band.
Mobile: filtri e ordina diventano bottoni, griglia 2 col, toggle griglia/lista.

### PDP
Breadcrumb · galleria (immagine grande + thumbnail strip, badge NOVITÀ) · colonna acquisto
(eyebrow, H1, rating, prezzo + "IVA inclusa", pannello stato, descrizione, feature list con
icone, quantità, CTA lime + wishlist) · trust bar · tab o accordion · "SI ABBINA BENE CON".
Mobile: accordion invece di tab, sticky buy bar in basso.

## 5. Componenti ricorrenti

| Componente | Regole osservate |
| --- | --- |
| **Product card** | Fondo bianco, immagine su plate chiaro, cuore wishlist in alto a destra, badge tipo in alto a sinistra, nome, stato, prezzo, bottone full-width. Hover = bordo violetto + bottone lime. |
| **Bottone primario** | Lime pieno, testo grafite, maiuscolo, freccia → |
| **Bottone secondario** | Grafite con bordo violetto |
| **Bottone terziario** | Bianco, bordo violetto, icona carrello |
| **Bottone card** | Grafite pieno, testo/icona lime (varianti: AVVISAMI bianco se esaurito, PRE-ORDINA violetto) |
| **Badge stato** | Pill piccolo, maiuscolo, 12px |
| **Trust item** | Icona in cerchio + titolo + sottotitolo su 2 righe |
| **Sezione** | Titolo maiuscolo + `///` lime + link "VEDI TUTTI" con freccia in cerchio lime |

Stati card dichiarati (sezione 09): `STANDARD`, `HOVER`, `OUT OF STOCK`, `PRE-ORDINE`.
Stati bottone (sezione 06): `Default`, `Hover`, `Pressed`, `Disabled`.

## 6. Comportamenti desktop / mobile

| | Desktop | Mobile |
| --- | --- | --- |
| Nav | Barra orizzontale + dropdown | Hamburger + **bottom tab bar** (Home, Negozio, Arrivi, Preferiti, Account) |
| Catalogo | Sidebar filtri persistente, 4 col | Filtri in sheet, 2 col |
| PDP | Tab | Accordion |
| Carrello | Badge in header | **Sticky bar**: "N PRODOTTI NEL CARRELLO", totale, "VAI AL CHECKOUT" |
| PDP acquisto | Colonna laterale | **Sticky buy bar** con thumbnail, prezzo, CTA |

## 7. Invarianti di progetto

1. Il wordmark è **solo asset**: mai ricostruito con font, mai contornato, mai ricolorato.
2. L'emblema è l'elemento ripetibile: favicon, loader, mobile, dettagli.
3. **Un solo lime per schermata come azione primaria** — il lime significa "compra".
4. Il violetto non è mai un fondo esteso: è bordo, badge, accento.
5. I titoli sono sempre maiuscoli; il body non lo è mai.
6. I prodotti stanno su superfici **chiare** in ogni mockup (unica eccezione: bundle banner).
7. Prezzi in formato italiano: `€24,99` — virgola decimale, simbolo prima.
8. Il glifo `///` è il marcatore di sezione, sempre lime, mai decorativo altrove.
9. I mockup **non** vengono mai usati come immagini nel sito: sono solo reference.

## 8. Catalogo estratto dai mockup

Prezzi e nomi ricorrenti nei mockup (usati come dati del mock provider):

| Prodotto | Prezzo | Tipo | Stato |
| --- | --- | --- | --- |
| Stadio Beystadium X Attack Set | €49,99 | Kit arena | Disponibile · Novità |
| Wizard Arrow 4-80B | €24,99 | Attacco | Disponibile |
| Cobalt Dragoon 2-60C Starter Pack | €34,99 | Attacco | In arrivo |
| Phoenix Wing 9-60GF | €24,99 | Bilanciato | Esaurito |
| Shark Edge 3-60LF | €24,99 | Difesa | Disponibile |
| Dran Sword 4-80DB | €24,99 | Stamina | In arrivo |
| Dran Buster 1-60A | €24,99 | Attacco | Disponibile |
| Sneak Attack Battle Set | €64,99 | Kit arena | Pre-ordine |

Bundle campione: €79,99 da €99,96 (−20%, risparmio €19,97). Spedizione gratuita sopra €59.

### Incoerenze nei mockup e come sono state risolte

I mockup sono generati e si contraddicono tra loro. Decisioni prese:

- **Stadio**: `catalog-mobile` lo chiama "Set Arena Beyblade X" a €29,99; `catalog-desktop`,
  `home-*` e la PDP lo chiamano "Stadio Beystadium X Attack Set" a €49,99 → vince la maggioranza.
- **Phoenix Wing**: le pagine lo danno `DISPONIBILE`, il design system lo usa come esempio
  `OUT OF STOCK` → impostato `ESAURITO`, così il percorso "AVVISAMI" è raggiungibile nella UI reale.
- **Cobalt Dragoon**: la PDP mostra sia `IN ARRIVO` sia un pannello `PRE-ORDINE` → tenuto
  `IN ARRIVO` (acquistabile, spedito appena disponibile), coerente con gli altri mockup.
- **Conteggi filtri**: il catalogo mostra "78 prodotti". Sono fiction del mockup: i conteggi
  reali sono derivati dai dati, non hardcodati.
- **Recensioni**: numeri diversi tra design system e home → usati quelli di `home-lower`.

## 9. Limiti noti degli asset

1. **Nessuna fotografia prodotto è stata fornita.** Le immagini esistono solo dentro i mockup,
   quindi sono state ritagliate da lì (unica sorgente disponibile; il brief vieta di scaricare
   immagini dal web). Risoluzioni risultanti:
   - Stadio 530×472 e Cobalt Dragoon 430×459 — buone
   - le altre 6 trottole ≈ 170–215 px — **basse per una PDP**
   Sono adeguate per le card, deboli sulla galleria PDP ingrandita.
   → Sostituire i file in `public/products/` con scatti reali; `src/data/assets.ts` centralizza
   i percorsi, quindi non serve toccare i componenti.
2. **Categorie Lanciatori e Accessori senza prodotti**: i mockup mostrano le tile e le voci di
   nav, ma non danno mai nome+prezzo di un lanciatore o accessorio venduto singolarmente.
   Non sono stati inventati SKU: le due categorie mostrano l'empty state già previsto dal design
   system (sezione 14).
3. **Logo Beyblade X**: appare nei mockup ma è un marchio di terzi. Non è stato estratto né
   ricostruito come asset: l'eyebrow è reso tipograficamente. GEAR//DROP è un rivenditore, i nomi
   prodotto sono uso nominativo lecito.
4. I font dichiarati (DIN Next, Eurostile) sono commerciali → sostituiti con Archivo (§3).
5. **I file logo non hanno canale alpha.** Sono RGB con una scacchiera finta-trasparenza
   (`#FEFEFE` / `#F7F7F7`) **disegnata dentro i pixel**. Così com'erano si vedevano come un
   riquadro chiaro su qualsiasi superficie non bianca. `scripts/build-assets.py` rimuove la
   scacchiera e ritaglia; l'artwork non viene mai toccato. Restano scacchierate solo le
   contro-forme chiuse (i buchi di D/R/O/P, il centro dell'emblema), non raggiungibili dal
   bordo: invisibili su fondo chiaro, per questo il logo si usa **solo su superfici chiare**.
   → Chiedere al brand i sorgenti vettoriali (o PNG con alpha vera).
6. **Manca la variante del lockup per fondo scuro.** Il footer dei mockup usa un lockup con
   "GEAR" bianco; quello fornito ha "GEAR" grafite, illeggibile sul footer grafite.
   Ricolorarlo (es. `invert`) sarebbe reinterpretare il logo, vietato dal brief → nel footer sta
   su una placca chiara, esattamente come fornito.
   → Chiedere al brand il lockup per fondo scuro e sostituire la placca.
7. **Contrasto del lime.** Acid Lime `#C6FF00` su `grey-100` dà 1.10:1; persino il verde usato
   dai mockup nell'hero (`#A8D304`) si ferma a 1.62:1, sotto il 3:1 richiesto per il testo
   grande. Il token `--color-lime-ink` (`#7B9A03`, 3.00:1) è il lime più vicino per tinta che
   supera la soglia, e si usa per il testo lime su chiaro. Su grafite si usa l'Acid Lime pieno
   (15.6:1). Stesso motivo per la pill "OFFERTA", ridisegnata grafite-su-lime (§5, `labels.ts`).

## 10. Migrazione idempotente nel CMS Supabase

`src/data/content-seed.ts` raccoglie esclusivamente la copy pubblica già revisionata in questo
repository: dieci sezioni homepage, il menu principale, quattro colonne footer e sette pagine
informative. `scripts/generate-supabase-seed.ts` la converte in `supabase/seed.sql` usando chiavi
naturali stabili; il seed può essere eseguito più volte e aggiorna la copy senza ripubblicare
contenuti disattivati o sovrascrivere l'ordinamento scelto dall'admin.

Il seed crea i nuovi prodotti con stock `0` e lascia `accept_orders=false`. Non inserisce ordini,
clienti, staff, promozioni, coupon, utilizzi, movimenti inventario o eventi audit. I percorsi delle
immagini già revisionate restano asset statici locali: `media_asset_id` rimane nullo finché un file
non viene caricato davvero nello Storage tramite il flusso admin autenticato.
