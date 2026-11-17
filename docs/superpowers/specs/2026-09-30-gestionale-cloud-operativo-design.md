# Gestionale cloud operativo — design

**Data:** 30 settembre 2026

**Stato:** approvato in conversazione; da sottoporre a review del documento

**Branch di partenza:** `feat/gestionale-cloud` da `feat/gestionale-unico` (`daecd31`)

**Riferimenti:** `docs/operations/geardrop-beta.md`, `docs/operations/multi-organization-foundation.md`, `docs/operations/warehouse-costs.md`, `docs/operations/pricing-agent.md`

## 1. Obiettivo

Costruire un gestionale cloud privato, separato dal sito Gear Drop e dal suo pannello `/admin`, che diventi il sistema operativo condiviso dei soci per Gear Drop e, in seguito, Oryvenne.

Il gestionale deve usare i dati reali del negozio Gear Drop senza copie o sincronizzazioni intermedie: ordini, proiezioni dello stato dei pagamenti, stock e clienti vivono nello stesso progetto Supabase già usato dal sito. Stripe resta la fonte autorevole per il pagamento. L'applicazione, il dominio e il deploy del gestionale sono invece indipendenti dal deploy dello storefront.

Il prodotto deve coprire il ciclo completo:

- vendita online, preordini, preparazione e spedizione;
- acquisti ai fornitori, merce attesa, ricezioni parziali e costi;
- stock fisico, riservato e disponibile;
- IVA e profitto gestionale;
- forecast, trend, rotazione e suggerimenti di riordino;
- proposte commerciali, prezzi e marketing assistiti da IA;
- automazioni affidabili, tracciate e approvate quando producono effetti commerciali.

## 2. Decisioni vincolanti

1. **Gestionale e sito sono applicazioni e deploy separati.** Un deploy o guasto del gestionale non deve interrompere il sito; un disservizio del database Supabase condiviso può coinvolgere entrambi.
2. **Il database resta unico.** Gear Drop e Oryvenne condividono il progetto Supabase ma ogni record aziendale appartiene a una sola organizzazione.
3. **Nessuna sincronizzazione tra database.** Il gestionale legge e scrive direttamente sul modello autorevole, protetto da RLS, RPC e membership.
4. **Il sito resta il canale di vendita.** Storefront, checkout Stripe e webhook continuano a funzionare anche se i job gestionali sono temporaneamente fermi, finché Supabase, Stripe e il percorso sincrono del checkout sono disponibili.
5. **Le automazioni non prendono decisioni commerciali irreversibili.** Report, calcoli, forecast, alert e anomalie possono essere automatici. Prezzi, emissione di ordini ai fornitori, campagne e messaggi promozionali o ad hoc richiedono approvazione owner. Conferme ordine, pagamento e spedizione possono partire automaticamente solo da eventi verificati e template transazionali già approvati.
6. **Oryvenne parte vuota.** La struttura multi-azienda esiste dal primo rilascio, ma catalogo e processi Oryvenne vengono attivati dopo la stabilizzazione di Gear Drop.
7. **L'IVA è gestionale.** Il sistema conserva aliquote e snapshot e calcola margini; non sostituisce contabilità fiscale, dichiarativi o fatturazione elettronica. Le regole definitive sono validate dal commercialista.
8. **Il rollout è progressivo e reversibile operativamente.** Migrazioni additive, feature flag, backup, stop delle nuove scritture e replay degli eventi; nessun rollback distruttivo del database.

Queste decisioni sostituiscono l'alternativa descritta in `docs/operations/gestionale-online.md` che prevedeva un progetto Supabase separato dal negozio.

## 3. Architettura

### 3.1 Applicazioni

- **Storefront Gear Drop:** applicazione pubblica già operativa, responsabile di catalogo pubblico, carrello, checkout e pagamenti.
- **Gestionale cloud:** applicazione Next.js privata con dominio e progetto Vercel dedicati. Non espone storefront, registrazione staff pubblica o pagine indicizzabili.
- **Supabase condiviso:** Postgres, Auth, Storage e Realtime sono la fonte autorevole per entrambe le applicazioni.
- **Stripe:** resta il sistema autorevole per il pagamento. I webhook firmati confermano ordini e stock.
- **Job cloud:** elaborazioni schedulate per metriche, forecast, retry, riconciliazioni e agenti. Nessun job critico dipende da un browser aperto.

Il repository può restare unico, ma deve produrre due deploy indipendenti. Il confine è applicativo: moduli storefront e gestionale non importano pagine o configurazioni l'uno dell'altro; condividono solo contratti di dominio, tipi Supabase e componenti esplicitamente comuni.

### 3.2 Autenticazione e autorizzazione

- La schermata di accesso del gestionale è propria, ma usa Supabase Auth.
- Non esiste registrazione pubblica dello staff.
- Un utente entra solo con `staff_profiles.active = true` e una membership attiva nell'organizzazione selezionata.
- Ruoli iniziali: `owner`, `admin`, `editor`, con autorizzazioni applicate sia nell'interfaccia sia nel database.
- I permessi derivano sempre da `organization_members.role` dell'organizzazione corrente. `staff_profiles` descrive identità e stato globale dello staff ma non autorizza operazioni aziendali; la stessa persona può quindi essere `owner` in Gear Drop e `editor` in Oryvenne senza ereditarne i privilegi.
- MFA è obbligatoria per gli owner prima del go-live del gestionale; l'eventuale estensione a tutto lo staff è una decisione successiva.
- L'accesso dei clienti del negozio non viene modificato dall'obbligo MFA dello staff.

Matrice iniziale dei privilegi:

- `owner`: configura azienda, team, sicurezza e feature flag; vede l'aggregato fra aziende; approva prezzi, emissione degli ordini fornitore, campagne e messaggi non transazionali; autorizza rettifiche e override, nonché replay con effetti esterni;
- `admin`: gestisce ordini, ricezioni, picking, spedizioni e resi dell'azienda assegnata; prepara proposte e può ritentare operazioni idempotenti prive di nuovi effetti esterni, ma non può approvare le azioni commerciali riservate agli owner;
- `editor`: gestisce contenuti di catalogo e bozze marketing e consulta le analisi dell'azienda assegnata; non modifica stock, costi, incassi, spedizioni o configurazioni di sicurezza.

Il principio resta il privilegio minimo. Ogni permesso è verificato lato server e database e coperto da test; nascondere un controllo nell'interfaccia non costituisce autorizzazione. Per sessioni owner e azioni sensibili il server e le RPC richiedono `aal2`, non soltanto la presenza visiva dell'MFA. Il recupero è approvato da un secondo owner; se non esiste, segue una procedura amministrativa documentata, auditata e conclusa con nuova iscrizione MFA.

### 3.3 Isolamento aziendale

- Ogni record aziendale porta `organization_id` oppure lo eredita in modo non ambiguo dal genitore.
- RLS, vincoli composti, RPC e query applicative impediscono letture o scritture fra Gear Drop e Oryvenne.
- Ogni job e ogni esecuzione IA opera su una sola organizzazione.
- La vista aggregata fra aziende è disponibile solo agli owner e richiede una scelta esplicita; non è mai il contesto predefinito.
- I file usano bucket privati e percorsi prefissati da `organization_id`; le policy Storage verificano membership e ruolo con le stesse regole dei record Postgres. URL firmati hanno durata breve e non attraversano aziende.

## 4. Navigazione e moduli

La navigazione target è:

1. **Oggi** — priorità operative, anomalie, ordini da preparare, merce attesa, approvazioni.
2. **Vendite** — ordini clienti, preordini, resi, rimborsi, clienti e vendite manuali future.
3. **Acquisti** — fornitori, ordini di acquisto, scadenze, ricezioni e fatture/DDT.
4. **Magazzino** — inventario, movimenti, ubicazioni, costi, valorizzazione e rettifiche.
5. **Spedizioni** — picking, etichette, tracking, eccezioni e resi.
6. **Analisi** — profitto, sell-through, rotazione, copertura, forecast, trend e report.
7. **Prezzi** — osservazioni di mercato, politiche, proposte e decisioni.
8. **Marketing** — segmenti, opportunità, campagne, offerte, bozze e risultati.
9. **Automazioni** — job, webhook, integrazioni, errori, retry e costi IA.
10. **Impostazioni** — aziende, team, costi, IVA, corrieri, fonti, feature flag e sicurezza.

## 5. Flussi autorevoli

### 5.1 Vendita e fulfillment

```text
checkout sito
  → ordine e prenotazione in Supabase
  → pagamento Stripe
  → webhook firmato e persistito
  → conferma ordine e stock
  → coda Oggi
  → presa in carico
  → picking ed etichetta
  → spedizione e tracking
  → profitto aggiornato
```

Requisiti:

- prenotazione atomica e fail-closed sullo stock;
- il ledger dei movimenti confermati è la fonte autorevole dello stock fisico per organizzazione, SKU e ubicazione; le quantità aggregate sono viste o snapshot ricostruibili;
- `disponibile = fisico vendibile - prenotazioni fisiche attive - quantità bloccata`, con risultato mai negativo; sono attive e concorrono al `riservato` le prenotazioni `pending`, `confirmed` e `manual_review`, mentre `released`, `expired` e `consumed` non vi concorrono. Lo stock di sicurezza riduce separatamente la quantità pubblicabile al sito;
- una prenotazione ordinaria non può portare le prenotazioni fisiche oltre il fisico vendibile. Un preordine eccedente è domanda impegnata/backorder, non stock fisico negativo e non merce disponibile: resta separato finché una ricezione non lo alloca atomicamente;
- merce attesa da ordini fornitore aperti è mostrata come `incoming` e non aumenta il disponibile prima della ricezione confermata;
- stati espliciti della prenotazione: `pending`, `confirmed`, `manual_review`, `released`, `expired`, `consumed`;
- `confirmed` solo dopo conferma autorevole del pagamento; rilascio o scadenza con transizione idempotente;
- il pagamento non scarica il fisico: mantiene la prenotazione in `confirmed`. Lo scarico avviene una sola volta quando la merce lascia il controllo del magazzino; nella stessa transazione si registra il movimento di uscita e si porta la prenotazione a `consumed`, così il disponibile non viene ridotto due volte;
- timeout configurabile per checkout abbandonati, senza liberare stock quando lo stato Stripe è incerto: prima si riconcilia con Stripe, poi si conferma o rilascia; l'incertezza residua va in `manual_review`;
- webhook e riconciliazioni idempotenti;
- nessun ordine, incasso o movimento duplicato;
- preordini separati dagli ordini preparabili;
- una transizione fallita resta visibile nella coda anomalie e può essere ritentata.

### 5.2 Acquisti e merce in entrata

```text
forecast o richiesta manuale
  → proposta di riordino
  → approvazione owner
  → ordine al fornitore
  → merce attesa
  → una o più ricezioni
  → movimenti valorizzati e costo medio
  → allocazione ai preordini
  → proposta di avviso cliente
```

Un ordine di acquisto conserva fornitore, valuta, regime IVA, righe, quantità ordinate/ricevute/annullate, prezzi netti, trasporto, dazi, date promesse, riferimenti e documenti. Le ricezioni possono essere parziali. Una correzione usa storni o movimenti compensativi; non riscrive la storia.

### 5.3 Analisi e forecast

Snapshot giornalieri per organizzazione e SKU alimentano:

- vendite 7/30/90 giorni;
- sell-through e rotazione;
- giorni di copertura;
- domanda da preordini e ordini aperti;
- lead time fornitori;
- stagionalità, trend e calendario uscite;
- margine e profitto realizzato;
- suggerimenti di riordino con quantità, data, evidenze e confidenza.

Le metriche derivate sono ricostruibili dai movimenti e dagli ordini. Gli snapshot accelerano le letture ma non diventano la fonte autorevole.

### 5.4 Prezzi, marketing e vendite assistite

Il sistema produce proposte, non azioni dirette:

- variazioni prezzo con pavimento di margine e limiti di variazione;
- prodotti da promuovere o smaltire;
- opportunità di bundle e cross-sell;
- segmenti minimizzati;
- bozze di campagne, offerte e messaggi;
- calendario commerciale;
- confronto fra proposta, decisione e risultato.

Ogni proposta contiene organizzazione, autore automatico, evidenze, confidenza, impatto previsto, policy violate e scadenza. Un owner può approvare, modificare o rifiutare con nota. Solo l'approvazione produce il comando operativo e l'audit collega il comando alla proposta.

I dati personali non entrano nel contesto IA salvo una funzione esplicita che ne richieda il minimo indispensabile. Nessuna esecuzione IA vede dati di due aziende.

L'approvazione owner autorizza il contenuto e la decisione commerciale, ma non sostituisce la base autorizzativa del destinatario. Prima di ogni invio marketing il sistema applica consenso o altra base validata, finalità e canale consentiti, suppression list e disiscrizioni. La revoca blocca gli invii futuri senza ritardo operativo. Invii, rifiuti, bounce, reclami e disiscrizioni vengono riconciliati dal provider e restano auditabili; i messaggi transazionali usano flussi e template separati.

## 6. Dati e componenti da aggiungere

Il modello esistente viene esteso con componenti separati e tracciabili:

- `purchase_orders` e `purchase_order_lines`;
- ricezioni collegate agli ordini di acquisto e supporto quantità parziali;
- `inventory_reservations` per stock fisico, con scadenza, stato e riferimento ordine, e impegni `incoming`/backorder separati per i preordini non ancora coperti dal fisico;
- ubicazioni di magazzino e assegnazioni SKU;
- adapter spedizioni, etichette ed eventi corriere;
- `integration_events`/outbox, inbox di deduplicazione e `webhook_deliveries`;
- `idempotency_keys` per i comandi con effetti;
- snapshot analitici per SKU e organizzazione;
- proposte di riordino e relative decisioni;
- campagne, bozze, approvazioni e risultati;
- coda anomalie unica con retry e risoluzione;
- feature flag per organizzazione e modulo.

Ogni nuova tabella esposta deve avere RLS, grant espliciti, indici sulle colonne di policy e test positivi/negativi per membro e non membro. Le viste rivolte a ruoli autenticati usano `security_invoker = true` oppure non vengono esposte.

## 7. Affidabilità e automazioni

### 7.1 Regole

- Ogni comando mutante o con effetti esterni riceve una chiave di idempotenza.
- La mutazione di dominio e il relativo evento outbox vengono scritti atomicamente nella stessa transazione; se una delle due scritture fallisce, falliscono entrambe.
- Webhook ed eventi in ingresso entrano prima in una inbox persistente con vincolo univoco su provider e identificativo evento; duplicati e replay non ripetono gli effetti.
- I job ritentano con backoff e limite massimo.
- Dopo il limite, l'evento entra nella coda anomalie con contesto sufficiente alla risoluzione.
- Il replay è esplicito, autorizzato e auditato.
- Le correzioni contabili e di magazzino sono compensazioni; non cancellano i movimenti confermati.
- n8n può orchestrare notifiche o flussi non critici, ma non è fonte autorevole e non è necessario al checkout.

### 7.2 Livelli di autonomia

**Automatico:** calcoli, snapshot, report, forecast, alert, rilevamento anomalie, retry, riconciliazioni in sola lettura e notifiche transazionali originate da eventi verificati usando template approvati e versionati.

**Con approvazione owner:** prezzi, emissione di ordini ai fornitori, campagne, messaggi promozionali o ad hoc ai clienti e pubblicazione promozioni.

**Manuale protetto:** storni, rettifiche stock, override dei costi, cambio di policy e attivazione dei moduli in produzione.

## 8. IVA, costi e profitto

Il sistema conserva snapshot per evitare che una modifica futura cambi il passato:

- aliquota IVA della vendita per riga/ordine;
- costo unitario netto al movimento di scarico;
- commissione di pagamento;
- costo corriere;
- imballo;
- rimborsi e sconti;
- valuta e cambio quando necessario.

Il `ricavo netto IVA` è l'importo attribuito a righe e spedizione dopo sconti e rimborsi, al netto dell'IVA. Un rimborso non viene quindi sottratto una seconda volta. Resi e rimborsi parziali vengono allocati per riga: se un articolo torna vendibile, il movimento ripristina stock e storna il relativo costo merce; se è perso o non vendibile, il costo resta sostenuto. Commissioni non restituite, spedizione di andata e ritorno e imballo restano costi effettivi.

Formula gestionale iniziale:

```text
profitto = ricavo netto IVA
         - costo merce netto degli storni
         - costi corriere effettivi
         - commissioni non recuperate
         - imballo
```

Se una voce obbligatoria manca, il profitto è `incompleto`; il sistema non stima silenziosamente. Le regole su acquisti intracomunitari, OSS e commissioni vengono configurate solo dopo conferma del commercialista.

## 9. Sicurezza e segreti

- Nel browser compare solo la publishable key Supabase.
- Secret key Supabase, Stripe, Anthropic e credenziali dei provider restano server-side nel deployment cloud.
- Nessun segreto viene scritto nel repository, nel bundle client o nei log.
- Gli helper `security definer` vivono in schema non esposto. Gli entrypoint RPC invocati dall'app vivono in uno schema API esplicitamente esposto, sono sottili, fissano `search_path = ''`, verificano attore, organizzazione, ruolo e livello AAL e revocano `EXECUTE` a `PUBLIC`, concedendolo solo ai ruoli necessari.
- Le sessioni staff possono essere revocate; un profilo disattivato perde l'accesso a tutte le aziende.
- Audit per accessi, approvazioni, cambi prezzi, ordini fornitori, movimenti, spedizioni, feature flag e replay.

## 10. Deploy e rollout

### 10.1 Ambienti

- **Locale:** Supabase Docker e dati fittizi.
- **Staging:** copia recente e protetta della produzione, minimizzata o mascherata per i dati personali non necessari, cifrata, accessibile solo al team autorizzato, con retention e cancellazione definite. Email, SMS, webhook e chiamate a fornitori reali sono bloccati tecnicamente e verificati con test, non soltanto disabilitati nell'interfaccia.
- **Produzione:** deploy Vercel separato del gestionale e stesso Supabase del sito.

### 10.2 Sequenza

1. Correggere il test di scoping perché sia indipendente da LF/CRLF e ristabilire una baseline completamente verde.
2. Ripetere la rehearsal sull'ultima copia della produzione e riconciliare conteggi, importi, stock, owner e migrazioni.
3. Pubblicare il gestionale cloud su staging con scritture esterne disabilitate.
4. Eseguire E2E e prova operativa con ordini reali copiati.
5. Creare e verificare il backup di produzione.
6. Applicare migrazioni additive compatibili con il codice corrente dopo approvazione e dry run, senza attivare le nuove capacità.
7. Pubblicare il gestionale produzione inizialmente in sola lettura; feature gate e capability check impediscono query verso componenti di schema non ancora disponibili durante ogni fase expand-first.
8. Abilitare una capacità alla volta: inventario, acquisti, fulfillment, profitto, automazioni.
9. Osservare Gear Drop, riconciliare ogni differenza e chiudere le anomalie.
10. Attivare Oryvenne vuota, quindi catalogo e processi propri con un rollout separato.

### 10.3 Rollback operativo

Il rollback usa feature flag e stop delle nuove scritture, riporta l'operatore al percorso precedente e conserva gli eventi per il replay. Non annulla distruttivamente migrazioni o movimenti già registrati.

## 11. Verifica e criteri di go-live

Gate tecnici:

- lint, typecheck, test unitari e build;
- pgTAP su schema, RLS, RPC e invarianti;
- test upgrade su una base popolata;
- database lint/advisors;
- E2E per ruoli, organizzazioni e flussi principali;
- smoke test in staging e produzione;
- confronto dei tipi Supabase generati.

Condizioni operative:

- zero dati visibili fra aziende senza autorizzazione;
- zero duplicazioni di ordini, pagamenti, prenotazioni, movimenti o spedizioni;
- nessuno stock negativo non motivato;
- differenze di stock e importi spiegate e approvate;
- ordini e preordini del campione riconciliati al 100%;
- job falliti e webhook arretrati visibili e ritentabili;
- profitto espone chiaramente ogni voce mancante;
- segreti assenti da browser, repository e log;
- owner protetti da MFA.

## 12. Monitoraggio

La pagina Automazioni e gli alert devono mostrare almeno:

- job falliti o in ritardo;
- webhook non elaborati;
- retry esauriti;
- stock negativo o incoerente;
- differenze di riconciliazione;
- errori di login e membership;
- code di approvazione ferme;
- costo, durata e fallimenti delle esecuzioni IA;
- salute delle integrazioni corriere e marketing.

## 13. Decomposizione dell'implementazione

Il programma è troppo ampio per un unico piano. Viene realizzato con piani indipendenti e verificabili:

1. **Fondazione cloud e collegamento sicuro a Gear Drop** — deploy separato, modalità privata, baseline, staging, rehearsal, sola lettura e feature flag.
2. **Checkout riservato ed eventi affidabili** — prenotazioni, webhook persistenti/idempotenti, riconciliazione e coda anomalie.
3. **Acquisti e merce in entrata** — ordini fornitori, merce attesa, ricezioni parziali, costi e allocazione preordini.
4. **Magazzino e logistica in uscita** — ubicazioni, picking, adapter corriere, etichette, tracking e resi.
5. **Analitica commerciale** — snapshot, rotazione, copertura, forecast, trend e report.
6. **Marketing, vendite e approvazioni** — segmenti, opportunità, campagne, proposte e misurazione.
7. **API e automazioni** — chiavi, webhook in uscita, scheduler, n8n opzionale e monitoring.
8. **Oryvenne** — catalogo iniziale, processi propri, configurazioni fiscali e go-live separato.

Ogni piano termina con staging, verifica, documentazione operativa e stop gate. Il piano successivo non eredita debito non classificato dal precedente.

## 14. Fuori perimetro iniziale

- contabilità generale e dichiarativi;
- fatturazione elettronica/FatturaPA;
- sincronizzazione bancaria;
- variazione automatica dei prezzi senza approvazione;
- invio automatico di campagne senza approvazione;
- dipendenza critica da n8n;
- app mobile nativa e modalità offline;
- database separati da sincronizzare;
- multi-magazzino avanzato finché non richiesto da un flusso reale.

## 15. Primo risultato utilizzabile

Il primo rilascio è considerato utilizzabile quando i soci possono aprire un dominio gestionale separato, autenticarsi, scegliere Gear Drop, vedere dati reali riconciliati in sola lettura e installare l'app dal browser se desiderato, senza che il deploy modifichi il funzionamento del sito. La PWA può conservare soltanto la shell e una pagina offline priva di dati sensibili: risposte API, dati gestionali e informazioni personali usano `no-store` e vengono rimossi al logout. Le scritture vengono abilitate solo dopo i gate del modulo corrispondente.
