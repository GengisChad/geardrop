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
2. **Post sul canale.** Il bot ti manda la bozza `PRE-ORDINE // solo sul canale` con prezzo, pezzi
   e tempi. Con «Pubblica» esce sul canale con un tasto solo, **Pre-ordina**, che apre il bot.
3. **Nel bot.** Chi compra sceglie quanti pezzi (al massimo 3) e come pagare:
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
  vendita passa dal checkout del sito.
- Una prenotazione non pagata tiene fermi i pezzi fino a 24 ore (un po' di più se nel frattempo
  il bot non viene usato: la scadenza scatta al primo sguardo allo shop o a `/preordini`).
- **Privacy**: il bot raccoglie nome, email, cellulare e Locker su Telegram. L'informativa del sito
  (`/legale/privacy`) va aggiornata dal titolare prima di usarlo con i clienti.

## Configurazione

- `PAYPAL_ME_HANDLE` in `.env.local` e su Vercel: il nome dopo `paypal.me/`. Senza, il bot offre
  solo il checkout del sito.
- Migrazione `20261126130000_telegram_preorders.sql` (dopo quella del bot).
- Un pre-ordine nuovo: voce nel catalogo (`src/data/catalog.ts`) con `channelOnly: true` e
  `stock: "pre-ordine"`, e la riga in `products` con `availability_override = 'preorder'` e
  `preorder_allocation` = pezzi ordinati. Senza la riga nel database il prodotto resta nascosto.

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
