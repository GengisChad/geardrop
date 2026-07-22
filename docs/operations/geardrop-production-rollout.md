# Gate finale per la produzione — GearDrop

Punto d'ingresso unico per il passaggio da staging (GearDrop Development, Preview Vercel su PR #2)
a produzione. Non contiene procedure nuove: assembla i gate già scritti in un unico ordine di
firma, così nessuno viene saltato per distrazione. Non eseguire nessun passo qui senza aver
completato `geardrop-staging-rollout.md` e `geardrop-smoke-test.md` sullo stesso codice.

**Nessuna riga di questo documento autorizza da sola un'azione.** Ogni passo richiede conferma
esplicita separata, come da regola generale del progetto.

## Ordine dei gate

1. **Full Admin Checkpoint** — 28/28 task, CI verde sullo SHA da promuovere (corpo PR #2).
2. **Staging verificato** — `geardrop-staging-rollout.md` completato: progetto dedicato, migration
   applicate, doppio seed pulito, owner reali bootstrap, Preview Vercel funzionante.
3. **Smoke test** — `geardrop-smoke-test.md` completato senza fallimenti irrisolti, dati di test
   ripuliti.
4. **Matrice di sicurezza** — `full-admin-rollout-checklist.md` completata riga per riga con
   evidenza sullo stesso SHA: RLS, boundary owner/admin/editor, protezione secret, empty state
   reali, nessun mock residuo.
5. **Checklist attivazione ordini** — `enable-orders-checklist.md` **solo se** questo rollout deve
   anche accettare ordini reali. Se la produzione va online con `accept_orders=false` (consigliato
   per un primo rilascio), questo passo si rimanda a un gate separato successivo — non è un
   prerequisito del deploy in sé.
6. **Promozione ambiente** — seguendo `vercel-rollout.md` §"Sequenza di deploy" punti 8-9: prima lo
   switch `CONTENT_PROVIDER=supabase` in un rollout isolato e verificato, poi eventualmente
   `COMMERCE_PROVIDER=supabase` in un rollout separato successivo. Non cambiare entrambi i provider
   nello stesso deploy.
7. **Piano di rollback confermato** — vedi `vercel-rollout.md` §"Rollback": responsabile nominato,
   ripristino `mock` testato, nessuna azione distruttiva sul database prevista in caso di incidente.

## Stato Stripe

Stripe **non è attivo** in nessuna fase di questo rollout. Le funzioni di gestione ordine che
toccano rimborso/pagamento preparano solo lo stato interno (`payment-adapter` mock) e non eseguono
alcuna chiamata verso Stripe reale. Attivare Stripe è un gate esplicito, futuro, non coperto da
questo documento: richiede almeno chiavi API reali, webhook configurato e verificato, e una
checklist propria non ancora scritta.

## Cosa blocca sempre il rollout in produzione

- Qualunque riga non spuntata in `full-admin-rollout-checklist.md`.
- `accept_orders=true` senza `enable-orders-checklist.md` completata.
- Stock non reale (caricato altrove che tramite `adjust_inventory()` dalla UI admin).
- Owner diversi da due, o owner non verificati con sessioni separate.
- Qualunque riferimento a IBNApp, project ref, access token o secret nel diff o nei log.
- CI non verde sullo SHA esatto da promuovere (uno SHA più recente non ancora verificato non basta).

## Dopo il rollout

Aggiornare il corpo della PR (o aprirne una di follow-up se questa viene infine chiusa) con: SHA
promosso, timestamp, provider attivati, owner responsabili, esito verifica post-deploy, piano di
monitoraggio per le prime ore. Mantenere `docs/operations/*` aggiornata se una procedura qui
descritta cambia nella pratica — questi documenti sono operativi, non storici: se un passo si
rivela sbagliato o incompleto durante l'esecuzione reale, correggerlo qui prima del prossimo
rollout, non solo a voce.
