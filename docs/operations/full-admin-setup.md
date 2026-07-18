# Full Admin setup

Questo documento prepara una futura installazione GearDrop, ma non autorizza né esegue alcuna
operazione remota. Fino al rollout approvato la PR resta draft, nessun progetto viene collegato e
lo storefront pubblico usa `COMMERCE_PROVIDER=mock` e `CONTENT_PROVIDER=mock`.

## Prerequisiti

- progetto Supabase nuovo e dedicato esclusivamente a GearDrop;
- Node.js e pnpm nelle versioni dichiarate da `package.json`;
- dominio applicativo e redirect Auth approvati;
- due account owner distinti, confermati e controllati da persone diverse;
- gestore segreti per chiavi Supabase e credenziali Vercel.

La prima migration interrompe l'installazione con `GD_DEDICATED_PROJECT_REQUIRED` se trova tabelle
applicative preesistenti. Non riusare, resettare o collegare IBNApp o altri database.

## Verifica locale/CI obbligatoria

Il gate autorevole è `.github/workflows/supabase-database-ci.yml`. Usa soltanto la stack Supabase
effimera del runner e, nell'ordine, applica tutte le migration, esegue il seed due volte, pgTAP,
database lint, confronto dei tipi generati, unit test, browser admin, browser pubblico, lint,
typecheck e build. `supabase stop --no-backup` viene eseguito sempre.

Per rigenerare il seed versionato:

```powershell
pnpm seed:supabase
git diff --exit-code -- supabase/seed.sql
```

Il seed parte con stock `0`, spedizione inattiva e `accept_orders=false`; non crea ordini, clienti,
staff, coupon, promozioni, utilizzi o ricavi.

## Installazione remota — solo dopo approvazione separata

1. Creare il progetto Supabase dedicato e registrare regione/project ref nel runbook privato.
2. Applicare le migration in ordine cronologico con il processo di release approvato. Non usare
   comandi linked o `db push` da una postazione non autorizzata.
3. Eseguire `supabase/seed.sql` due volte e verificare conteggi, stock zero e ordini disattivati.
4. Generare i tipi dal progetto e confrontarli byte-per-byte con
   `src/lib/supabase/database.types.ts`.
5. Configurare Auth email/password, redirect esatti, SMTP, rate limit e policy password.
6. Creare e confermare i due utenti owner, poi seguire `bootstrap-first-owners.md` una sola volta.
7. Verificare login/logout e matrici owner/admin/editor con sessioni separate.
8. Caricare media reali soltanto dalla UI admin: reservation, upload firmato, verifica server e
   finalizzazione `ready`. Non creare righe `media_assets` senza oggetto Storage.
9. Caricare stock reale esclusivamente tramite `adjust_inventory()` dalla Server Action admin.
10. Lasciare i provider pubblici su `mock` e gli ordini disattivati fino ai gate dedicati.

## Confini operativi

- La chiave `SUPABASE_SECRET_KEY` è server-only; mai `NEXT_PUBLIC_*`, log o client bundle.
- Tutte le mutazioni admin passano da Server Actions con sessione verificata, ruolo e Zod.
- I contenuti sono campi strutturati/Markdown sanitizzato; niente HTML, JavaScript o SQL libero.
- Le disponibilità, i totali e le metriche provengono dal database; zero/empty state restano zero.
- Stripe non è attivo: preparazione rimborso e stato pagamento non eseguono transazioni Stripe.

## Moduli disponibili

Dashboard; prodotti; categorie; bundle; media; inventario; homepage; pagine; navigazione; footer;
promozioni; coupon; ordini; spedizioni; impostazioni negozio/SEO/contatti/social; team; audit.

