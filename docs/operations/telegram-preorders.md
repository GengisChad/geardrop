# Pre-ordini solo su Telegram

Dal 26/11/2026 (proprietario: "pre order non sul sito ma solo su telegram, caricati sul sito ma
nascosti finché poi effettivamente in magazzino. Ordino 30 pezzi, faccio i pre order e ne prendono
10, in magazzino poi tornano 20. Possono pagare anche con PayPal.me su telegram"). Le sue scelte:
la lista dei pre-ordini la tiene il bot (il gestionale in un secondo passo), la spedizione si paga
subito insieme al pezzo, e oltre a PayPal.me c'è un tasto che apre il checkout del sito.

Si appoggia al bot delle news: vedi [`telegram-news-bot.md`](telegram-news-bot.md).

## Come funziona

1. **Prodotto nascosto.** Il pezzo è nel catalogo con `channelOnly: true` e nel gestionale come
   pre-ordine con i pezzi ordinati (30). Finché resta un pre-ordine non compare in negozio,
   ricerca, home, sitemap, feed Google e suggerimenti del carrello; la sua pagina esiste solo per
   chi ha il link ed è `noindex`.
2. **Post sul canale, e come si paga.** Il bot ti manda la bozza `PRE-ORDINE // solo sul canale`
   con prezzo, pezzi e tempi. Pubblicandola decidi tu come si paga quel pre-ordine (proprietario,
   26/11: "decidiamo noi quali solo con PayPal e quali con Stripe"), con tre tasti:
   - **Pubblica · solo Stripe**: il tasto **Pre-ordina** del canale apre direttamente il carrello
     del sito con il pezzo dentro. Tutto tracciato: ordine nel gestionale, niente conferme a mano.
   - **Pubblica · solo PayPal.me**: **Pre-ordina** apre il bot, che offre solo PayPal.me.
   - **Pubblica · Stripe e PayPal.me**: **Pre-ordina** apre il bot e sceglie chi compra.

   Senza `PAYPAL_ME_HANDLE` c'è solo il primo tasto. La scelta vale per quel prodotto finché non
   ripubblichi il suo pre-ordine con un altro tasto.
3. **Nel bot** (quando non è solo Stripe). Chi compra sceglie quanti pezzi (al massimo 3) e, se
   hai lasciato tutti e due i modi, come pagare:
   - **Carta, PayPal o Revolut sul sito**: si apre il carrello del sito con il pezzo dentro. Da lì
     è un ordine normale: Locker, pagamento, ordine nel gestionale, pezzi scalati da soli. Il bot
     non riserva niente.
   - **PayPal.me**: il bot chiede nome, email, cellulare e CAP, propone i Locker InPost vicini,
     mostra il totale (pezzi + Locker 4,90, gratis da 100 €) e, alla conferma, toglie i pezzi dal
     conteggio per 24 ore e dà il link PayPal.me con l'importo esatto e un codice (`GDT-…`) da
     scrivere nella nota.
4. **Tu confermi.** Ti arriva la scheda `PRE-ORDINE IN ATTESA` con i dati e due tasti. PayPal.me
   non avvisa nessuno: quando vedi il pagamento tocchi **Pagato** e chi compra riceve la conferma.
   **Annulla** libera i pezzi. Dopo 24 ore senza «Pagato» la prenotazione scade da sola, i pezzi
   tornano disponibili e il bot lo dice a tutti e due; se il pagamento era arrivato in ritardo,
   «È stato pagato» la riprende finché ci sono pezzi.
5. **Arrivo.** Quando la merce arriva carichi a magazzino quello che resta (30 − 10 = 20) e togli
   il pre-ordine dal prodotto: compare sul sito da solo e il bot ti propone `NUOVO ARRIVO //`.
   I pre-ordini pagati con PayPal.me li spedisci dalla lista di `/preordini`.

## Sul sito «In arrivo» con «Avvisami», in pre-ordine su Telegram

Dal 26/11/2026 (proprietario, per il CX-20: "mettili sul sito con avvisami e solo 8 in pre order
per telegram", e subito dopo: "sul sito devi mettere «in arrivo»", non esaurito). Con
`channelOnly: "avvisami"` al posto di `true` il prodotto non è nascosto:

- il negozio, la ricerca e la sua pagina lo mostrano **«In arrivo», con «Avvisami»** al posto del
  carrello, e sotto il modulo c'è il rimando al canale Telegram. Nei filtri si trova sotto
  «In arrivo». A Google resta non acquistabile (`OutOfStock`), perché sul sito non si può ordinare;
- i pezzi messi da parte (`preorder_allocation`, 8 su 20 per il CX-20) si vendono solo dal carrello
  che apre il post del canale, o dal bot con PayPal.me;
- quando la merce arriva carichi a magazzino quello che resta e togli il pre-ordine: il prodotto
  diventa disponibile e chi ha lasciato l'email con «Avvisami» viene avvisato come sempre.

Le pagine del negozio leggono il prodotto con `shopView()` (`src/lib/commerce/channel-only.ts`); il
preventivo del carrello no, ed è per questo che il carrello può venderlo. Nel catalogo la voce si
scrive `stock: "esaurito"`: i pezzi del pre-ordine stanno solo nel database. Quel campo decide solo
se si può comprare dal sito; la parola e il colore che il cliente vede li danno `stockLabel()` e
`stockTone()` (`src/lib/labels.ts`), che per questi prodotti dicono «In arrivo». Non si usa lo
stato `in-arrivo` vero, né l'override `incoming` nel database: quello stato si può mettere nel
carrello, e l'override toglierebbe il pre-ordine a Telegram.

## Dove si contano i pezzi

In un posto solo: `products.preorder_allocation`, lo stesso numero che usa il checkout del sito.
Una prenotazione PayPal.me lo abbassa (`telegram_preorder_hold`), un ordine dal sito lo abbassa
come sempre, una prenotazione annullata o scaduta lo rialza. Quindi sito e Telegram non possono
vendere lo stesso pezzo, e il numero che resta è quello da caricare a magazzino.

## Limiti di questo primo passo

- **I pre-ordini PayPal.me non sono ordini del gestionale**: niente etichetta InPost automatica,
  niente email, niente pagina «il tuo ordine». Li trovi con `/preordini` (nome, email, cellulare,
  Locker) e li spedisci a mano. Quelli pagati dal checkout del sito invece sono ordini normali.
- Un rimborso PayPal.me lo fai tu su PayPal: «Annulla» libera solo i pezzi.
- PayPal.me nel bot solo per i pezzi che viaggiano in Locker; uno stadio o un pezzo in conto
  vendita passa dal checkout del sito, anche se avevi scelto «solo PayPal.me».
- Il prodotto nascosto è nascosto dal negozio che il sito usa oggi (catalogo con le giacenze sopra).
  Il provider che legge tutto dal database (`supabase-provider.ts`, non in uso in produzione) non
  conosce `channelOnly`: prima di passare a quello, il segno va portato nel database.
- «Solo PayPal.me» vale per quello che il bot offre: il sito non rifiuta il pezzo a chi arrivasse
  al carrello con il suo link, che però in quel caso non viene pubblicato da nessuna parte.
- Una prenotazione non pagata tiene fermi i pezzi fino a 24 ore (un po' di più se nel frattempo
  il bot non viene usato: la scadenza scatta al primo sguardo allo shop o a `/preordini`).
- **Privacy**: il bot raccoglie nome, email, cellulare e Locker su Telegram. L'informativa del sito
  (`/legale/privacy`) lo dice dal 26/11/2026, con Telegram e PayPal tra chi riceve i dati. Dice
  anche che di una prenotazione non pagata o annullata si cancella dopo 30 giorni tutto ciò che
  identifica chi l'ha fatta: lo fa il bot a ogni sguardo allo shop (`forget` nello store,
  `UNPAID_DATA_DAYS` in `preorder-rules.ts`). Se cambi il numero, cambialo in tutti e due i posti.

## Da una frase al post

Dal 26/11/2026 il proprietario chiede un'offerta con una frase, e chi lavora per lui la prepara
fino alla bozza. Le sue parole: "ti dico «ho in arrivo 20 CX-20, fammi il post pre-order solo su
Telegram dove la gente deve pagare tramite Stripe sul sito» oppure «ho 3 Battle Pass a 80 euro che
possono pagare solo con PayPal.me»". E ancora: quello che va su Telegram sono "clip o immagini che
fai tu direttamente tramite il sito", mandate sul canale "con i link per pre-ordinare e pagare".

1. **Leggi la frase.** Prodotto, pezzi, prezzo, come si paga. Se manca il prezzo o non è chiaro
   quale edizione sia, chiedilo: non si inventa. Se non dice come si paga, lo sceglie lui sulla
   bozza.
2. **Prodotto a catalogo** (`src/data/catalog.ts`): la voce completa, con `channelOnly: true` e
   `stock: "pre-ordine"` se deve restare nascosto, oppure `channelOnly: "avvisami"` e
   `stock: "esaurito"` se lo vuole sul sito, dove si legge «In arrivo» con «Avvisami». Se ha detto come si paga,
   `channelPayment` (`"stripe"`, `"paypal"` o `"both"`). Le foto sono solo quelle ufficiali Hasbro o Takara Tomy, con la fonte scritta in
   [`../product-photo-sources.md`](../product-photo-sources.md); card e scontorno si fanno con gli
   script di quel file.
3. **Immagine o clip.** Per un post curato il proprietario vuole un'immagine fatta con Codex
   (26/11/2026: "fai dei bei post anche usando codex per fare le immagini del post"): 4:5,
   1080×1350, sfondo nero, il pezzo vero in grande, testo pulito, viola per i pre-ordini e lime per
   il disponibile, niente fulmini, scintille o neon. I riferimenti sono solo i render ufficiali; il
   pezzo generato si confronta con il render e, se è cambiato, ci va sopra lo scontorno ufficiale;
   il logo vero lo si appoggia a mano; ogni parola si rilegge. Il file va in `public/telegram/` e
   in `telegramPostImages` (`src/data/assets.ts`). In alternativa, la clip: aggiungi il prodotto a `CLIP_SPECS` (`scripts/clips/clip-data.ts`) e a `productClips`
   (`src/data/assets.ts`), poi `pnpm clips`. Il post esce con la clip e, se Telegram non la
   prende, con la foto. Una clip non mostra mai prezzo o disponibilità: li porta il testo sotto.
4. **Database.** Una migrazione con la riga in `products`: pubblicato,
   `availability_override = 'preorder'`, `preorder_allocation` = i pezzi che ha detto. Si applica
   in produzione solo con il suo OK.
5. **PR, CI, unione con il suo OK.** Il sito si pubblica da solo. Per un prodotto che si paga con
   Stripe, dopo l'unione serve anche `pnpm stripe:products --apply <slug>`, sempre con il suo OK:
   senza il prodotto su Stripe il checkout del sito non lo fa pagare. Con lo slug si crea solo
   quello, e gli altri prodotti restano come sono.
6. **Prova il carrello sul sito vero, prima della bozza.** Il sito legge le giacenze da una cache
   di 5 minuti (`cacheStorefrontRead`, tag `products`), che sopravvive a una pubblicazione: subito
   dopo la migrazione il carrello può ancora dire «Esaurito». Apri
   `/carrello?preordine=<slug>` e aspetta di leggere «Pre-ordine» con i pezzi giusti. Solo allora
   fai guardare lo shop al bot.
7. **Bozza.** Al primo sguardo allo shop (un salvataggio nel gestionale, le 9 del mattino, o
   `/controlla`) il bot gli manda `PRE-ORDINE // solo sul canale` con immagine, prezzo, pezzi e
   tempi letti dallo shop, e il solo tasto del pagamento che ha chiesto. Sul canale esce con il
   suo tocco: nessuno pubblica al posto suo.
8. **Controlla.** Un prodotto nascosto non compare in negozio, ricerca e sitemap, e la sua pagina
   si apre solo con il link ed è `noindex`; uno «In arrivo» si vede con «Avvisami». Il tasto del
   post porta al carrello con il pezzo dentro (Stripe) o al bot (PayPal.me). Un prodotto solo
   PayPal.me non va creato su Stripe: così il checkout del sito non può venderlo.

Un pezzo già in vendita sul sito non può essere «solo su Telegram»: per quello basta la notizia
normale del bot. Un'offerta solo Telegram di pezzi già in casa, da spedire subito, non c'è ancora:
il prodotto nascosto oggi è un pre-ordine, con i tempi di un pre-ordine.

## Configurazione

- `PAYPAL_ME_HANDLE` in `.env.local` e su Vercel: il nome dopo `paypal.me/`. Senza, il bot offre
  solo il checkout del sito.
- Migrazione `20261126130000_telegram_preorders.sql` (dopo quella del bot).
- Un pre-ordine nuovo: voce nel catalogo (`src/data/catalog.ts`) con `channelOnly: true` e
  `stock: "pre-ordine"`, e la riga in `products` con `availability_override = 'preorder'` e
  `preorder_allocation` = pezzi ordinati. Senza la riga nel database il prodotto resta nascosto.
  Con `channelPayment` nella voce del catalogo la bozza offre un solo modo di pagare.

## Comandi al bot

- `/preordini`: chi ha pre-ordinato, pagato o in attesa, con i dati per spedire.
- Per provarlo: apri tu stesso il tasto **Pre-ordina** del post. Il bot tratta anche te come un
  cliente, e le schede arrivano nella stessa chat.

## File

- `src/lib/telegram/preorder-rules.ts`: regole (pezzi per persona, totale, link PayPal.me, codice).
- `src/lib/telegram/preorders.ts`: la conversazione, la conferma, la scadenza, la lista.
- `src/lib/telegram/supabase-preorder-store.ts`, `supabase/migrations/20261126130000_telegram_preorders.sql`.
- Sito: `Product.channelOnly` (`src/lib/commerce/types.ts`), `live-stock-overlay.ts`,
  `mock-provider.ts`, `src/components/cart/preorder-arrival.tsx`.
- Test: `tests/unit/telegram-preorders.test.ts`, `supabase/tests/055_telegram_preorders.test.sql`.
