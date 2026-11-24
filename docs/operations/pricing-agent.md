# Agente IA: prezzi di mercato e assistente

L'agente non decide mai. Legge i dati dell'azienda in cui si lavora, scrive solo osservazioni di
mercato e proposte di prezzo; un socio approva, corregge o rifiuta ogni proposta, e solo
l'approvazione cambia il prezzo (con audit che nomina la proposta). Owner e admin soltanto.

## Attivazione

1. Variabile server-only `ANTHROPIC_API_KEY` (mai con prefisso `NEXT_PUBLIC_`). Senza, pagine e
   pulsanti restano visibili ma spenti. Facoltativa `COPILOT_MODEL` (default `claude-sonnet-5`).
2. **Prezzi IA → Fonti e politica**: approvare i domini dei concorrenti (dominio nudo, es.
   `negozio.it`; Amazon rifiutato per decisione dei soci) e impostare la politica: margine minimo
   sul costo, variazione massima per proposta, giorni di attesa, arrotondamento (,90 di default),
   prodotti per analisi.
3. **Prezzi IA → Avvia analisi**: 1–3 minuti. Il costo stimato di ogni esecuzione (token e
   ricerche web, in dollari) è in tabella "Esecuzioni".

## Come lavora un'analisi

1. Sceglie i prodotti pubblicati mai osservati o osservati da più tempo (poi i più venduti).
2. **Analista di mercato** (`claude-sonnet-5`): ricerca e lettura web limitate ai domini approvati
   (`allowed_domains`); registra le offerte con un solo strumento, che il database rifiuta se il
   dominio non è approvato o il prodotto non è dell'azienda. Il contenuto delle pagine è trattato
   come dato: nessuna istruzione trovata sul web può fare altro che registrare un'osservazione.
3. **Consulente prezzi** (`claude-opus-5-5`): vede prezzo, costo medio, margine, vendite 7/30/90,
   copertura, tendenza e osservazioni; propone con motivazione, evidenze e confidenza. Il database
   arrotonda, confronta con la politica (margine, variazione, attesa) e segna "fuori politica"
   senza scartare. Una nuova proposta sostituisce quella ancora in attesa sullo stesso prodotto.
4. Un'analisi alla volta per azienda; un'esecuzione rimasta aperta scade dopo 30 minuti.

## Assistente

`/admin/assistente`: domande su magazzino, previsioni, ordini, profitto, mercato e proposte. Gli
ordini arrivano senza nome, email, telefono o indirizzo. Ogni domanda è registrata come esecuzione
`copilot` con il suo costo.

L'assistente non scrive mai da solo: prepara una scheda, e la modifica parte solo quando chi chiede
preme «Conferma», con i suoi permessi e la stessa azione del tasto del gestionale
(`src/lib/ai/copilot-actions.ts`). Può preparare: stato, spedizione e note di un ordine; movimenti di
magazzino; prezzo e costo; dal 2026-11-24 anche la scheda di un prodotto (nome, nome breve, SKU,
tagline, descrizione, categoria, tipo blade, prezzo barrato, pubblicazione) e le sue specifiche,
feature e confezione. Rimborsi, annullamenti e coupon restano nella scheda dell'ordine.

## Quello che la scheda prodotto manda al sito

Il sito legge testi e foto dal catalogo nel codice (`src/data/catalog.ts`) e dal database prezzo e
giacenza. Dal 2026-11-24 ogni salvataggio dalla scheda (o dall'assistente) segna in
`products.storefront_fields` i campi cambiati, e il sito prende dal database proprio quelli: nome,
tagline, descrizione, categoria, tipo blade, specifiche, feature, confezione, foto e tag
(`src/lib/commerce/storefront-content.ts`, migrazione `20261124120000`). Il resto resta quello del
catalogo. Limiti:

- lo slug di un prodotto del sito non si cambia dalla scheda: è l'indirizzo della pagina e la chiave
  di giacenza, Stripe e ordini;
- le foto caricate nella libreria media non vanno sul sito, che serve solo i suoi file;
- un prodotto nuovo creato dalla scheda non compare sul sito finché non entra nel catalogo;
- il nome sulla pagina di pagamento Stripe segue il catalogo con `pnpm stripe:products --apply`.

## Valutare prima di fidarsi

Per 60–90 giorni confrontare proposte, decisioni e vendite: le decisioni con nota restano in
"Decisioni recenti". Nessuna esecuzione automatica a orario finché la qualità non è dimostrata.

## Riferimenti tecnici

- Migrazione `20261009091010_add_pricing_agent.sql`: `market_sources`, `pricing_policies`,
  `agent_runs`, `market_observations`, `pricing_proposals` (tier A); RPC `start_agent_run`,
  `finish_agent_run`, `record_market_observation`, `propose_price`, `decide_pricing_proposal`,
  `save_pricing_policy`.
- Client API senza dipendenze `src/lib/ai/claude-api.ts` (modelli, versioni degli strumenti web,
  prezzi), ciclo strumenti `agent-loop.ts`, agente `pricing-agent.ts`, assistente `copilot.ts`.
- Test: pgTAP `047_pricing_agent`, unit `ai-agent`.
