# Vercel rollout

Runbook preparatorio. Non eseguire deploy, collegamenti o switch provider durante il Full Admin
Checkpoint. Il primo deploy approvato deve restare non pubblico o protetto da accesso Vercel.

## Variabili

Configurare separatamente Preview e Production, senza copiare valori da altri progetti:

| Variabile | Visibilità | Valore iniziale |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | client/server | URL del progetto GearDrop dedicato |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | client/server | publishable key GearDrop |
| `SUPABASE_SECRET_KEY` | solo server | secret key GearDrop |
| `COMMERCE_PROVIDER` | solo server | `mock` |
| `CONTENT_PROVIDER` | solo server | `mock` |

Non configurare project ref, access token CLI o credenziali IBNApp nell'applicazione. Non esporre
`SUPABASE_SECRET_KEY` con prefisso `NEXT_PUBLIC_`.

## Sequenza di deploy

1. Richiedere gate CI verde sullo stesso SHA da distribuire.
2. Configurare variabili Preview con valori del solo progetto GearDrop dedicato.
3. Pubblicare una Preview protetta mantenendo entrambi i provider su `mock`.
4. Verificare storefront pubblico invariato e `/admin` accessibile solo agli owner bootstrap.
5. Eseguire smoke read-only di dashboard, empty state, prodotti, media, inventario, CMS, pricing,
   ordini, settings, team e audit a 390, 768 e 1440 px.
6. Eseguire una mutazione reversibile per modulo in Preview; verificare audit e RLS con sessioni
   owner/admin/editor/non-staff.
7. Confermare che `accept_orders=false`, stock non inventato e Stripe non attivo.
8. Solo con approvazione separata, cambiare prima `CONTENT_PROVIDER=supabase`, verificare preview e
   contenuti pubblicati, poi valutare `COMMERCE_PROVIDER=supabase` in un rollout distinto.
9. Promuovere a Production soltanto dopo checklist firmata e piano rollback verificato.

## Web Analytics

Vercel Web Analytics è incluso nell'applicazione, ma il componente viene attivato soltanto quando
Vercel imposta `VERCEL_ENV=production`. Non aggiungere una variabile pubblica equivalente e non
abilitare eventi personalizzati: questa release raccoglie esclusivamente pageview anonimizzate.

1. Abilitare Web Analytics dalla dashboard Vercel del progetto GearDrop.
2. Eseguire un nuovo deploy Production dopo l'abilitazione; un deploy già pubblicato non basta a
   garantire l'iniezione e la raccolta dello script.
3. In una finestra privata, aprire una pagina pubblica e verificare in DevTools > Network che
   `/_vercel/insights/script.js` risponda con esito positivo.
4. Navigare tra home, negozio, categoria e prodotto e verificare le richieste pageview verso
   `/_vercel/insights/view`. Il campo URL non deve contenere query string o frammenti.
5. Eseguire i controlli negativi su `/account`, `/admin`, `/auth/callback`, `/carrello`, `/checkout`,
   `/login`, `/registrati`, `/password-dimenticata`, `/nuova-password`, `/conferma-email`,
   `/conferma-recupero` e `/preferiti`: nessuna pageview deve essere inviata per la route esatta o
   per un suo segmento figlio.
6. Verificare nella dashboard che compaiano soltanto percorsi pubblici puliti, senza email, numero
   ordine, idempotency key, coupon, nomi prodotto inseriti dall'utente o altri identificatori.

## Rollback

- Ripristinare immediatamente `COMMERCE_PROVIDER=mock` e `CONTENT_PROVIDER=mock` e ridistribuire lo
  SHA precedentemente verificato.
- Non resettare il database e non cancellare migration, ordini, audit o movimenti inventario.
- Disattivare gli ordini con la conferma owner `DISATTIVA ORDINI` se il problema riguarda checkout.
- Conservare log Vercel/Supabase e aprire un incidente senza copiare segreti nei ticket.
- Correggere con migration forward e nuovo gate CI; mai rollback distruttivo dello schema remoto.

