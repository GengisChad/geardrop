# GearDrop staging rollout — playbook

Indice operativo per portare online il primo ambiente remoto dedicato, **GearDrop Development**,
a partire dal Full Admin Checkpoint completato (28/28 task, PR #2 draft). Questo documento
sequenzia le procedure già scritte altrove; non le ripete. Ogni fase ha un file di riferimento.

Non esegue nulla da solo: è la mappa. Nessun passo qui autorizza un'operazione remota — le
autorizzazioni restano quelle già stabilite in `full-admin-setup.md` e
`full-admin-rollout-checklist.md`.

## Prerequisiti

- Full Admin Checkpoint verde sullo SHA che si intende distribuire (vedi corpo PR #2 per
  l'evidenza CI corrente).
- Nessun progetto Supabase remoto già collegato in questo worktree (`supabase status` locale non
  conta: quello è lo stack CLI effimero).
- Non lavorare in `C:\Users\feder\Downloads\GearDrop` (worktree della storefront pubblica, altro
  branch). Questo playbook vale solo per `codex/admin-supabase`.

## Sequenza

### 1. Preflight di sicurezza (sempre, prima di ogni comando remoto)

```powershell
$env:EXPECTED_SUPABASE_PROJECT_REF = "<ref del progetto GearDrop Development>"
$env:EXPECTED_SUPABASE_PROJECT_NAME = "GearDrop Development"
pnpm tsx scripts/verify-geardrop-project.ts --project-ref <ref-dichiarato> --project-name "<nome-dichiarato>"
```

Fallisce (exit code diverso da 0) se nome o ref non coincidono esattamente con l'atteso, se il ref
è nella lista `FORBIDDEN_SUPABASE_PROJECT_REFS` (usarla per registrare esplicitamente il ref di
IBNApp una volta noto), o se una delle due variabili attese manca. Non prosegue mai in modo
permissivo: un mismatch blocca, non avvisa soltanto. Vedi `scripts/verify-geardrop-project.ts`.

Il controllo "schema applicativo estraneo" è a livello database, non qui: lo esegue la prima
migration (`20260717185534_assert_dedicated_project.sql`) che aborta con
`GD_DEDICATED_PROJECT_REQUIRED` se il progetto non è vuoto. Il preflight TypeScript e la migration
sono due guardie indipendenti — identità dichiarata prima del collegamento, contenuto reale al
primo push.

### 2. Progetto Supabase dedicato

Se il progetto **GearDrop Development** non esiste ancora, fermarsi e chiedere all'utente:
creazione del progetto, project ref, database password, conferma regione (Europa, vicino agli
utenti italiani), eventuale access token CLI. Non proporre di riusare IBNApp o altro progetto
esistente — deve essere nuovo e dedicato.

### 3. Link e dry-run

```powershell
supabase link --project-ref <ref>
supabase migration list
supabase db push --dry-run
```

Leggere ogni migration nell'output del dry-run. Bloccare se compare `DROP SCHEMA`, `DROP TABLE`
non motivato, `TRUNCATE`, reset Auth/Storage, oggetti non-GearDrop, o l'errore
`GD_DEDICATED_PROJECT_REQUIRED`. Presentare project ref mascherato, elenco migration, warning ed
esito prima di proseguire. **Non eseguire il push senza approvazione esplicita separata dopo il
dry-run.**

### 4. Push, seed, owner

Solo dopo approvazione: `supabase db push` (mai `db reset`, `db reset --linked`,
`--include-seed`, o `migration repair` senza approvazione esplicita). Poi seed idempotente due
volte, poi bootstrap owner — procedure in `full-admin-setup.md` (sezione "Installazione remota") e
`geardrop-owner-bootstrap.md`.

### 5. Vercel Preview

`geardrop-vercel-environment.md` — variabili, Auth redirect, deploy della Preview su PR #2.

### 6. Smoke test e sicurezza

`geardrop-smoke-test.md` per il percorso funzionale con un owner reale e la matrice ruoli;
`full-admin-rollout-checklist.md` per la matrice di sicurezza completa (RLS, enumerabilità,
protezione secret, ecc.).

### 7. Checkpoint staging

Al termine, riportare: HEAD, commit creati, stato PR (resta draft), nome progetto, project ref
mascherato, migration applicate, esito doppio seed, owner configurati, URL Preview, URL admin,
esito smoke test, esito test sicurezza, esito CI, provider attivi, variabili configurate (senza
valori), problemi residui, funzioni ancora dipendenti da Stripe, checklist per la produzione
(`geardrop-production-rollout.md`).

## Cosa NON fa questo playbook

Non abilita gli ordini, non attiva Stripe, non promuove a produzione, non mergia la PR. Questi
sono gate separati — vedi `geardrop-production-rollout.md` ed `enable-orders-checklist.md`.
