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
- «Solo PayPal.me» vale per quello che il bot offre: il sito non rifiuta il pezzo a chi arrivasse
  al carrello con il suo link, che però in quel caso non viene pubblicato da nessuna parte.
- Una prenotazione non pagata tiene fermi i pezzi fino a 24 ore (un po' di più se nel frattempo
  il bot non viene usato: la scadenza scatta al primo sguardo allo shop o a `/preordini`).
- **Privacy**: il bot raccoglie nome, email, cellulare e Locker su Telegram. L'informativa del sito
  (`/legale/privacy`) va aggiornata dal titolare prima di usarlo con i clienti.

## Da una frase al post

Dal 26/11/2026 il proprietario chiede un'offerta con una frase, e chi lavora per lui la prepara
fino alla bozza. Le sue parole: "ti dico «ho in arrivo 20 CX-20, fammi il post pre-order solo su
Telegram dove la gente deve pagare tramite Stripe sul sito» oppure «ho 3 Battle Pass a 80 euro che
possono pagare solo con PayPal.me»". E ancora: quello che va su Telegram sono "clip o immagini che
fai tu direttamente tramite il sito", mandate sul canale "con i link per pre-ordinare e pagare".

1. **Leggi la frase.** Prodotto, pezzi, prezzo, come si paga. Se manca il prezzo o non è chiaro
   quale edizione sia, chiedilo: non si inventa. Se non dice come si paga, lo sceglie lui sulla
   bozza.
2. **Prodotto a catalogo** (`src/data/catalog.ts`): la voce completa, con `channelOnly: true`,
   `stock: "pre-ordine"` e, se ha detto come si paga, `channelPayment` (`"stripe"`, `"paypal"` o
   `"both"`). Le foto sono solo quelle ufficiali Hasbro o Takara Tomy, con la fonte scritta in
   [`../product-photo-sources.md`](../product-photo-sources.md); card e scontorno si fanno con gli
   script di quel file.
3. **Clip.** Aggiungi il prodotto a `CLIP_SPECS` (`scripts/clips/clip-data.ts`) e a `productClips`
   (`src/data/assets.ts`), poi `pnpm clips`. Il post esce con la clip e, se Telegram non la
   prende, con la foto. Una clip non mostra mai prezzo o disponibilità: li porta il testo sotto.
4. **Database.** Una migrazione con la riga in `products`: pubblicato,
   `availability_override = 'preorder'`, `preorder_allocation` = i pezzi che ha detto. Si applica
   in produzione solo con il suo OK.
5. **PR, CI, unione con il suo OK.** Il sito si pubblica da solo.
6. **Bozza.** Al primo sguardo allo shop (un salvataggio nel gestionale, le 9 del mattino, o
   `/controlla`) il bot gli manda `PRE-ORDINE // solo sul canale` con clip, prezzo, pezzi e tempi
   letti dallo shop, e il solo tasto del pagamento che ha chiesto. Sul canale esce con il suo
   tocco: nessuno pubblica al posto suo.
7. **Controlla.** Il prodotto non compare in negozio, ricerca e sitemap; la sua pagina si apre solo
   con il link ed è `noindex`; il tasto del post porta al carrello con il pezzo dentro (Stripe) o
   al bot (PayPal.me).

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
