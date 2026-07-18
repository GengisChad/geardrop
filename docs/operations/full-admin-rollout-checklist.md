# Full Admin rollout checklist

Questa checklist non è autorizzazione al rollout. Ogni casella richiede evidenza sullo stesso SHA.

## Repository e CI

- [ ] PR #2 ancora draft, non mergiata.
- [ ] Working tree pulito e HEAD uguale allo SHA verificato.
- [ ] Migration applicate da database vuoto in ordine cronologico.
- [ ] Seed eseguito due volte senza diff o duplicati.
- [ ] Tutti i pgTAP e database lint verdi.
- [ ] Tipi Supabase generati identici al file versionato.
- [ ] Unit, admin browser, public browser, lint, typecheck e build verdi.
- [ ] Nessun secret, project ref, linked command, `db push` o riferimento IBNApp nel diff/workflow.

## Sicurezza e dati

- [ ] Progetto Supabase nuovo e dedicato a GearDrop.
- [ ] Due owner confermati e bootstrap eseguito una sola volta.
- [ ] Utente non-staff respinto con messaggio generico.
- [ ] Matrice owner/admin/editor verificata per ogni modulo.
- [ ] RLS attiva; RPC di mutazione negate ad anon e ruoli non autorizzati.
- [ ] Server Actions autenticate, autorizzate e validate con Zod.
- [ ] Nessun mock, metrica finta, HTML arbitrario, SQL libero o segreto nella UI admin.
- [ ] Dashboard vuota mostra zero e liste vuote, senza confronti inventati.
- [ ] Stock iniziale zero; nessun ordine, cliente, coupon, promozione o ricavo seedato.

## Funzioni admin

- [ ] Prodotti/categorie/bundle CRUD, pubblicazione, archiviazione e vincoli media verificati.
- [ ] Upload Storage reservation-first, ready/failed, sostituzione e compensazione verificati.
- [ ] Inventario modificabile solo tramite `adjust_inventory()` con storico append-only.
- [ ] Homepage drag/keyboard, preview protetta, pagine Markdown, menu e footer verificati.
- [ ] Promozioni/coupon e pricing autorevole verificati senza inventare utilizzi.
- [ ] Lifecycle ordini, note, tracking, cancellazione/restock ed export verificati.
- [ ] Shipping, negozio, SEO, contatti, social e checklist ordini verificati.
- [ ] Team, guard last-owner/self-change e audit redatto verificati.

## Vercel e rollout pubblico

- [ ] Variabili Preview/Production appartengono solo al progetto GearDrop.
- [ ] `SUPABASE_SECRET_KEY` è server-only e non compare nei bundle/log.
- [ ] Preview protetta verificata a 390, 768 e 1440 px senza overflow.
- [ ] `COMMERCE_PROVIDER=mock` e `CONTENT_PROVIDER=mock` al primo deploy.
- [ ] Switch contenuti e switch commerce approvati come rollout separati.
- [ ] `accept_orders=false` finché la checklist operativa ordini non è completa.
- [ ] Stripe indicato come non attivo; nessun pagamento/rimborso reale presunto.
- [ ] Piano rollback mock + SHA precedente testato e responsabili nominati.

## Stop obbligatorio

Fermarsi prima di creare/collegare il progetto remoto, distribuire su Vercel, cambiare provider,
attivare Stripe, abilitare ordini o mergiare. Ognuna di queste azioni richiede approvazione distinta.
