# Creare i due owner reali — GearDrop Development

Procedura per la parte che manca prima di `bootstrap-first-owners.md`: quel documento presuppone
due utenti Auth **già esistenti e confermati** e descrive solo la funzione SQL one-shot che li
promuove a owner. Questo documento copre la creazione degli utenti stessi.

Esegui questa procedura **solo dopo** il push delle migration remote (Fase 4/5 di
`geardrop-staging-rollout.md`) e **prima** di ogni test funzionale che richieda un login admin.

## Prerequisiti

- Migration applicate sul progetto GearDrop Development (verificato: `supabase migration list`
  mostra tutte le migration come applicate remotamente).
- Nessuna riga in `staff_profiles` ancora (il bootstrap si rifiuta di girare altrimenti — è per
  design, vedi `bootstrap-first-owners.md`).
- Due indirizzi email reali, controllati da due persone distinte. Non chiederli in chat se non è
  necessario: se mancano, fermarsi e richiederli esplicitamente all'utente. Non usare indirizzi di
  test generici (`test@test.com`) per un ambiente che diventerà production-adjacent.

## 1. Creare i due utenti Auth

Dalla dashboard Supabase del progetto GearDrop Development: Authentication → Users → Add user →
"Create new user", email/password, spuntando "Auto Confirm User" **solo se si sta operando in
staging e si intende comunque far ripassare l'utente dal flusso di conferma reale prima del
rollout in produzione** — altrimenti lasciare la conferma email standard e far cliccare
all'utente il link ricevuto via email (comportamento identico a produzione, consigliato).

In alternativa, via CLI con l'access token collegato al progetto giusto (mai con token o progetto
IBNApp):

```powershell
supabase auth users create --email "owner-uno@dominio-reale.it"
supabase auth users create --email "owner-due@dominio-reale.it"
```

Non creare un terzo utente "di scorta": il bootstrap accetta esattamente due email e si rifiuta se
`auth.users` non ne risolve esattamente due confermate tra quelle indicate.

## 2. Confermare le email

Ogni proprietario clicca il link di conferma ricevuto. Verificare in dashboard che
`auth.users.email_confirmed_at` sia valorizzato per entrambi prima di procedere — il bootstrap
richiede righe confermate e si rifiuta altrimenti.

## 3. Eseguire il bootstrap

Seguire **esattamente** `bootstrap-first-owners.md`: connessione diretta da operatore autorizzato
(non da un client applicativo), sostituzione dei due placeholder email nella sessione
dell'operatore, esecuzione della transazione unica lì descritta. Non incollare qui altre copie
della query — quel documento resta l'unica fonte per il testo esatto della procedura.

## 4. Verifica post-bootstrap

- `select id, email, active, role from public.staff_profiles;` deve restituire esattamente due
  righe, entrambe `role = 'owner'`, `active = true`.
- Login con entrambi gli owner in due sessioni browser separate (o profili separati): entrambi
  devono raggiungere `/admin` e vedere il ruolo owner nell'interfaccia team.
- Login con un terzo utente Auth non presente in `staff_profiles` (crearne uno temporaneo se serve):
  deve essere respinto da `/admin` con un messaggio generico, non deve rivelare se l'email esiste o
  meno nel sistema.
- Tentare, da sessione owner, di rimuovere l'altro owner se resta l'unico rimanente: deve essere
  bloccato dal guard "ultimo owner" (verificare rimuovendo temporaneamente uno solo se la coppia
  può permetterselo, altrimenti verificare a livello di codice/test che il guard esista e sia
  coperto — non eseguire un test distruttivo reale se non reversibile con certezza).
- Verificare che nessun endpoint o Server Action permetta a un utente di auto-promuoversi a staff:
  la promozione richiede sempre un owner/admin agente su un altro utente, mai un self-service.

## Cosa NON fare

Non eseguire il bootstrap più di una volta: la funzione si rifiuta se `staff_profiles` non è vuota,
ma non tentare comunque varianti o bypass. Non assegnare ruoli staff modificando `auth.users`
metadata direttamente. Non promuovere utenti preesistenti in blocco. Non riusare questa procedura
per la gestione staff ordinaria — quella passa dalla UI team con owner/admin autenticati, non da
SQL diretto.
