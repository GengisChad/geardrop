# Beta Gear Drop: dal negozio di oggi al gestionale

Il gestionale nasce dall'admin che i soci già usano su `geardropshop.it/admin`. La beta lo porta
a lavorare sui **dati veri di Gear Drop** — ordini, stock, clienti — aggiungendo magazzino a costo,
profitto, stazione di spedizione, previsioni e agente prezzi. Oryvenne resta com'è: esiste come
azienda vuota e si completerà dopo.

Regola di fondo: **prima la prova generale su una copia, poi il rilascio con backup**. Nessun passo
di questo documento si esegue senza l'ok dei soci.

## Cosa cambia per chi compra

Niente. Il sito, il carrello e il pagamento Stripe restano identici. Cambia solo cosa vedono i soci
dopo il login.

## 1. Prova generale su una copia (nessun rischio)

Serve Docker Desktop aperto e la stringa di connessione del database del negozio
(Supabase → Project Settings → Database → Connection string → URI, con la password del database).

```powershell
$env:PROD_DB_URL = "postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"
pnpm beta:rehearse
```

Lo script, **in sola lettura sulla produzione**:

1. scarica un backup completo in `backup/` (schema e dati) — da conservare fino a rilascio riuscito;
2. elenca le migration mancanti in produzione;
3. ripristina il backup sullo stack locale, applica le migration e confronta i conteggi di ogni
   tabella prima e dopo: se una sola riga sparisce, si ferma con un errore;
4. controlla che tutte le righe risultino di Gear Drop, che ogni ordine abbia la sua aliquota IVA e
   che i soci siano owner.

Poi si apre il gestionale sulla copia (`avvia-gestionale\Avvia gestionale.cmd`) e si prova con
ordini e prodotti veri: ordini, "Da spedire", etichette, previsioni.

⚠️ Il backup contiene dati personali dei clienti: resta sul PC, non si carica su GitHub
(`backup/` è già escluso) e si cancella dopo il rilascio.

### Cosa ha detto la prova del 29 settembre 2026

- Produzione: **48 migration applicate, 10 da applicare** (aziende, magazzino a costo, previsioni,
  agente prezzi).
- Nessuna riga persa: 27 prodotti, 21 ordini, 25 righe d'ordine, 29 movimenti, 42 eventi.
  Tutto risulta di Gear Drop, ogni ordine ha la sua aliquota IVA, i due owner ci sono.
- Sulla copia non si ripristinano `storage` e le tabelle interne di `auth`: in produzione girano
  una versione più recente e non servono alla prova. Le immagini dei prodotti quindi non si vedono
  nella copia; il resto sì.
- **Da spedire mostra 18 ordini**: sono ordini pagati mai marcati come spediti nell'admin. Dopo il
  rilascio vanno chiusi (Spedisci, anche senza email) o restano lì per sempre.
- **Previsioni**: 5 prodotti da riordinare per pre-ordini già venduti — 15 Suppress Superion,
  7 Glory Valkerion, 2 Cobalt Drake, 2 Mirage Clock, 1 Tread Croc.
- Profitto di tutti gli ordini "incompleto" finché non si caricano costi e commissioni: è il
  primo giorno di beta, punti 3 e 4 più sotto.

## 2. Rilascio in produzione (con approvazione)

Solo dopo una prova generale riuscita, in un orario di poco traffico:

```powershell
pnpm tsx scripts/verify-geardrop-project.ts --project-ref <ref>
pnpm exec supabase link --project-ref <ref>
pnpm exec supabase migration list           # cosa manca
pnpm exec supabase db push --dry-run        # leggere l'elenco
pnpm exec supabase db push                  # solo dopo l'ok dei soci
```

Mai `db reset`, `--include-seed` o `migration repair` sulla produzione: il catalogo e gli ordini
veri sono già lì. Le migration aggiungono soltanto; nessuna cancella dati.

Poi l'app: il ramo `feat/gestionale-unico` va portato su `main` (pull request) e distribuito dal
progetto Vercel del negozio, che serve sia il sito sia `/admin`. Variabili da aggiungere in Vercel
(Production):

| Variabile | Valore | Serve a |
| --- | --- | --- |
| `NEXT_PUBLIC_STOREFRONT_ORGANIZATION` | `geardrop` | dire all'app quale azienda ha il negozio pubblico |
| `ANTHROPIC_API_KEY` | chiave Anthropic | agente prezzi e assistente (facoltativa) |

`GESTIONALE_ONLY` **non** va impostata: il negozio deve continuare a rispondere.

## 3. Primo giorno di beta

1. **Impostazioni → Costi predefiniti**: aliquota IVA 22% e costo imballo.
2. **Spedizioni**: per ogni metodo, "Costo corriere per noi" (es. 4,00). Ritiro a mano: 0.
3. **Carichi merce → Carico di apertura**: incollare `SKU;costo` (i porta deck a 14,00 sono già
   pronti in `outputs/2026-09-28-costi-apertura-geardrop.md`).
4. **Commissioni Stripe degli ordini passati**, così anche i vecchi ordini mostrano il profitto:

```powershell
pnpm beta:fees             # anteprima
pnpm beta:fees --apply     # scrive le commissioni lette da Stripe
```

5. **Prezzi IA → Fonti e politica**: approvare i negozi concorrenti da monitorare (Amazon escluso)
   e controllare margine minimo, variazione massima e arrotondamento.
6. Installare l'app: da `geardropshop.it/admin`, "Installa" nel browser su PC, "Aggiungi a Home"
   su iPhone.

## 4. Cosa guardare durante la beta

- **Ordini**: ogni ordine pagato deve mostrare un profitto, o dire quale costo manca.
- **Da spedire**: gli ordini pagati compaiono subito; l'etichetta stampa indirizzo e contenuto.
- **Inventario**: dopo il carico di apertura, "Solo senza costo" dovrebbe restare quasi vuoto.
- **Previsioni**: dopo qualche giorno di vendite, copertura e riordini iniziano ad avere senso.
- **Attività**: ogni modifica è registrata con autore e momento.

## Se qualcosa va storto

- **App**: da Vercel si torna al deploy precedente in un minuto; il database resta com'è (le
  migration sono additive, le pagine vecchie continuano a leggerlo).
- **Database**: si ripristina il backup di `backup/` sul progetto, oppure il backup automatico
  giornaliero di Supabase.
- **Ordini**: il webhook Stripe riprova per tre giorni, quindi un ordine arrivato durante un
  disservizio entra da solo appena il sito torna a posto.
