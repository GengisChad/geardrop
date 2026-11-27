# Il bot Telegram delle news

Dal 26/11/2026 (proprietario: "creare bot telegram per news su geardrop ecc"). Le sue scelte:
news su **nuovi arrivi, pezzi tornati disponibili, offerte e prezzi ribassati e tier list**;
escono su un **canale pubblico**; il bot le prepara e lui decide (**bozza + OK**).

Solo cose dello shop: la sera stessa, vista la bozza di un suo video, ha tolto i video di
YouTube ("deve pubblicare sito, bundle ecc., non roba del mio youtube"). Il bot non legge più
il canale YouTube.

## Come funziona

1. Il bot guarda lo shop: il catalogo che il sito serve (prezzi e disponibilità del gestionale sopra
   `src/data/catalog.ts`, letti senza cache) e le tier list pubblicate su `/meta`.
2. Confronta con quello che aveva visto l'ultima volta (`telegram_news_memory`) e per ogni novità
   crea una bozza (`telegram_news_drafts`).
3. Manda la bozza al proprietario, nella sua chat privata con il bot, con due tasti.
4. **Pubblica**: il post viene riscritto dai dati dello shop di quel momento e mandato sul canale.
   Se nel frattempo non è più vero (pezzo di nuovo esaurito, prezzo risalito) non esce, e il bot
   dice perché. **Scarta**: la bozza sparisce e non viene più proposta.

Nessun prezzo e nessuna disponibilità sono scritti a mano o presi dalla memoria del bot: ogni post
legge il prodotto dallo shop e usa `formatPrice` e le stesse etichette della scheda prodotto.

Quando guarda:
- dopo un salvataggio del gestionale che può essere una notizia (movimento di magazzino, carico,
  conteggio, reso, prezzo, scheda prodotto, tier list);
- una volta al giorno (`/api/cron/telegram-news`, Vercel Cron alle 08:00 UTC), per quello che non
  passa dal gestionale, come un listino applicato con una migrazione;
- quando il proprietario scrive `/controlla` al bot.

La prima volta non annuncia niente: ricorda quello che c'è già in vendita.

## Regole dei post

| Novità | Quando | Titolo |
| --- | --- | --- |
| Nuovo arrivo | prodotto che lo shop non aveva; se entra a catalogo esaurito, al primo giorno in vendita | `NUOVO ARRIVO //`, `NUOVO KIT //`, `NUOVO IN PRE-ORDINE //` |
| Tornato disponibile | da esaurito a vendibile (i kit no: la notizia è il pezzo) | `DI NUOVO DISPONIBILE //`, `PRE-ORDINI RIAPERTI //` |
| Prezzo ribassato | prezzo sotto il più basso degli ultimi 30 giorni | `PREZZO RIBASSATO //` |
| Pre-ordine sul canale | prodotto `channelOnly` con pezzi, non ancora in negozio ([`telegram-preorders.md`](telegram-preorders.md)) | `PRE-ORDINE // solo sul canale` |
| Tier list | un mese pubblicato per la prima volta | `META // novembre 2026` |

- I colori di un articolo (porta deck) sono un post solo.
- Un prodotto che ha una clip (`productClips`, fatta con `pnpm clips`) esce con la clip; gli altri
  con la foto. La clip non mostra prezzo o disponibilità: li porta il testo, letto dallo shop.
- Un prodotto che ha un'immagine fatta apposta per il post (`telegramPostImages` in
  `src/data/assets.ts`, file in `public/telegram/`) esce con quella, al posto di clip e foto.
  Vale la stessa regola: niente prezzo, pezzi o date nell'immagine.
- Un pezzo che non parte subito dice i tempi con le parole della scheda prodotto.
- Il prezzo ribassato si confronta con il prezzo più basso dei 30 giorni prima (art. 17-bis del
  Codice del consumo); se la scheda mostra un prezzo barrato, il post mostra quello. Un prezzo che
  scende dopo un rialzo recente non è annunciato come ribasso.
- Mai un confronto con altri negozi ("prezzi più bassi") e mai la fonte dei dati del meta.
- I link allo shop portano `utm_source=telegram`, così l'ordine registra da dove è arrivato
  (`orders.attribution_*`).
- Al massimo 8 bozze per volta; le altre con `/bozze`.

## Sicurezza

- Token, chat del proprietario e segreto del webhook stanno solo in `.env.local` e su Vercel. Gli
  script non li stampano.
- Il webhook accetta solo le chiamate con il segreto che Telegram rimanda; senza
  `TELEGRAM_WEBHOOK_SECRET` rifiuta tutti.
- Pubblica solo l'account del proprietario (`TELEGRAM_OWNER_CHAT_ID`): un tasto premuto da altri
  viene rifiutato, e chi scrive al bot riceve al più il nome del canale.
- Le due tabelle hanno la sicurezza per riga attiva e nessuna policy: le legge solo la chiave del
  server.

## Configurazione (una volta)

1. Su Telegram, con **@BotFather**: `/newbot`, scegli nome e username. Ti dà il token: mettilo in
   `.env.local` come `TELEGRAM_BOT_TOKEN` (mai in chat, mai in un commit).
2. Apri il bot e scrivigli `/start`, poi `pnpm telegram link`: salva la tua chat in `.env.local`
   (`TELEGRAM_OWNER_CHAT_ID`).
3. Prova senza canale: lascia vuoto `TELEGRAM_CHANNEL_ID`. «Pubblica» manda il post nella tua chat.
4. Crea il canale pubblico, aggiungi il bot come **amministratore** con il permesso di pubblicare e
   metti `TELEGRAM_CHANNEL_ID=@nomecanale`. `pnpm telegram check` dice se il bot lo vede.
5. Applica la migrazione `20261126120000_telegram_news_bot.sql` al database di produzione.
6. Su Vercel (Production) metti `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_CHAT_ID`,
   `TELEGRAM_CHANNEL_ID` e `TELEGRAM_WEBHOOK_SECRET`, poi ripubblica. `CRON_SECRET` c'è già.
7. `pnpm telegram webhook set`: dice a Telegram di chiamare `https://geardropshop.it/api/telegram/webhook`.
   Se il segreto non c'era lo crea in `.env.local`: in quel caso va messo su Vercel **prima** di
   questo passo.

## Comandi

| Comando | Cosa fa |
| --- | --- |
| `pnpm telegram check` | Chi è il bot e cosa è configurato, senza stampare segreti |
| `pnpm telegram link` | Salva la chat di chi ha scritto `/start` al bot |
| `pnpm telegram webhook set` / `info` / `delete` | Collega, controlla o scollega il sito |
| `pnpm telegram poll` | Prova in locale: passa a `pnpm dev` i tasti e i comandi (senza webhook attivo) |

Al bot, in chat privata: `/controlla` (guarda lo shop adesso), `/bozze` (mostra di nuovo le bozze in
attesa), `/preordini`, `/riepilogo` (il riepilogo della sera, adesso).

## Prova in locale

Con `.env.local` compilato e il webhook non impostato:

```
pnpm dev
pnpm telegram poll
```

In un altro terminale, il primo sguardo (non annuncia niente, risponde `firstLook: true`); il
segreto è quello di `CRON_SECRET`:

```
curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/telegram-news
```

Poi `/controlla` dal telefono dopo un cambio di stock o di prezzo.

## File

- `src/lib/telegram/news.ts`: cosa è una novità (puro, senza Telegram né database).
- `src/lib/telegram/messages.ts`: i testi dei post e i tasti.
- `src/lib/telegram/bot.ts`: guarda, bozza, pubblica, scarta, comandi.
- `src/lib/telegram/api.ts`, `supabase-store.ts`, `runtime.ts`: Telegram, tabelle, collegamento allo shop.
- `src/lib/telegram/owner-alerts.ts`, `owner-runtime.ts`: gli avvisi per il proprietario.
- `src/app/api/telegram/webhook/route.ts`, `src/app/api/cron/telegram-news/route.ts`, `src/app/api/cron/telegram-summary/route.ts`.
- Test: `tests/unit/telegram-*.test.ts`, `supabase/tests/054_telegram_news_bot.test.sql`.

## Dai post Instagram al canale

Dal 27/11/2026 (proprietario: "tutto quello che pubblichi su IG mandalo anche su telegram con
collegamento al pagamento del sito"). Un'immagine o un video pubblicato su Instagram diventa una
bozza per il canale:

```
pnpm telegram social <file> --prodotto=<slug> [--testo="..."]
pnpm telegram social <file> --testo="..." [--pagina=/negozio]
```

1. Il comando carica il file nella chat del proprietario con il bot, senza notifica: così Telegram
   lo tiene e ne dà l'id.
2. Chiede al sito (`POST /api/telegram/social`, con `TELEGRAM_WEBHOOK_SECRET`) di scrivere la
   bozza. Il sito la mostra al proprietario come ogni altra, con «Pubblica» e «Scarta», poi il
   caricamento viene cancellato.
3. Sopra ci sono le parole di `--testo`, poi le righe dello shop lette al momento: nome, prezzo
   (barrato se c'è un'offerta) e disponibilità. Il tasto mette il pezzo nel carrello del sito
   (`/carrello?aggiungi=<slug>`): «Compra sul sito», o «Pre-ordina sul sito».
4. Un pezzo in pre-ordine solo su Telegram ha il tasto del suo pre-ordine (carrello o bot, come ha
   scelto il proprietario). Senza prodotto il tasto apre la pagina dello shop indicata.
5. Esce sul canale solo con il suo tocco. Se nel frattempo il pezzo è esaurito, non esce e il bot
   dice perché.

Con `--pubblica` il post non passa dalla bozza: va subito sul canale. Serve al pubblicatore
automatico di Instagram, che lo lancia appena lo stesso post è uscito su Instagram, così il
proprietario non deve ricordarsi niente (27/11/2026: "vorrei che li programmi e pubblichi tu,
sennò io mi scordo. Deve essere un meccanismo automatico ed efficiente"). L'OK al post Instagram
vale anche per la sua copia sul canale. Il testo e il tasto vengono comunque dallo shop: un pezzo
esaurito non esce, e il proprietario riceve una riga nella chat con il bot. Lo stesso post esce
una volta sola anche se il comando viene rilanciato.

Va lanciato dalla cartella che ha `.env.local` (token, chat del proprietario, segreto del webhook).
Telegram accetta immagini fino a 10 MB e video fino a 50 MB.

## «Avvisami» su Telegram

Dal 27/11/2026. Sulla scheda di un prodotto esaurito o in arrivo, sotto il modulo email, c'è
«Oppure avvisami su Telegram»: apre il bot con `/start av-<slug>`.

- Il bot tiene la chat nella stessa lista «Avvisami» delle email (`restock_requests`, colonna
  `telegram_chat_id`), così il conteggio delle richieste nel gestionale le include.
- Se il pezzo si può già comprare, il bot lo dice subito e dà il tasto **Compra**.
- Appena il pezzo torna acquistabile sul sito, a ogni sguardo allo shop (salvataggio nel
  gestionale, le 9 del mattino, `/controlla`) il bot manda un messaggio privato con prezzo,
  disponibilità e **Compra**, che apre il carrello con il pezzo dentro. Poi cancella la richiesta.
- Un pre-ordine solo Telegram non conta come acquistabile: si aspetta che arrivi sul sito.
- «Non avvisarmi più» toglie la richiesta; dopo sei mesi si cancella da sola, come quelle email.
- Il tasto «Invia avvisi» del gestionale manda solo le email: quelle Telegram partono da sole.
- Un salvataggio nel gestionale fa scadere subito la cache dei prodotti dello shop, così il carrello
  vende già quello che il messaggio annuncia. Un pezzo rimesso in vendita con una migrazione non
  passa da lì: prima di `/controlla` aspetta 5 minuti, come per le bozze.

## Avvisi per te

Dal 27/11/2026 il bot scrive al proprietario, in privato, anche senza che lui chieda:

- **Ordine pagato**: appena il webhook Stripe registra un ordine nuovo. Numero, totale, pezzi,
  spedizione, codice sconto e canale della visita, le scorte basse che l'ordine ha lasciato, il
  tasto «Apri l'ordine». Un solo messaggio per ordine: i tentativi ripetuti di Stripe tacciono.
- **Allarme**: se il webhook non riesce a leggere o registrare un pagamento, una volta per sessione
  Stripe (memoria `alarm:paid-without-order:<sessione>`). Stripe riprova per tre giorni.
- **Riepilogo delle 21** (cron `/api/cron/telegram-summary`, 20:00 UTC: 21 d'inverno, 22 d'estate):
  ordini e incasso del giorno, ordini pagati non spediti, pre-ordini Telegram da pagare, Avvisami in
  attesa, scorte basse, e i pagamenti Stripe delle ultime 26 ore senza ordine. Se la chiave Stripe
  non può leggere le sessioni, il riepilogo lo dice invece di tacere.

Nessuno di questi messaggi porta dati del cliente (nome, indirizzo, email, telefono): restano nel
gestionale e nell'email dell'ordine. Non servono variabili nuove: `CRON_SECRET` e
`STRIPE_SECRET_KEY` ci sono già.

## Ingresso dal sito

Dal 26/11/2026 (proprietario: "un bel pulsante su geardropshop per entrare nella community
telegram per pre-orders, news ecc", e la sera stessa: "serve che il banner telegram sia più
visibile, anche in alto nel sito") il sito porta al canale `t.me/geardropshop` da quattro punti:

- la striscia viola in cima a ogni pagina del negozio, sopra l'header
  (`src/components/layout/telegram-strip.tsx`); non compare su carrello, checkout, account e
  accesso, dove non deve esserci niente tra il cliente e il pagamento;
- la fascia viola in home, subito dopo il primo scaffale (`src/components/home/telegram-band.tsx`);
- il tasto in fondo al menu del telefono (`src/components/layout/mobile-menu.tsx`);
- la riga dei social nel footer (`SOCIAL_LINKS` in `src/lib/navigation.ts`, dove un link nuovo va
  in fondo: vedi il commento lì).

L'indirizzo del canale sta in un posto solo, `TELEGRAM_CHANNEL_URL`. Il tocco su fascia e menu è
contato in Analytics come `join_group` (`group_id: telegram`, con `placement`), solo per chi ha
accettato le statistiche. Il testo della fascia dice solo quello che il canale porta davvero.
