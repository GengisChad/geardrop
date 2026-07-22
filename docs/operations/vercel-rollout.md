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

## Rollback

- Ripristinare immediatamente `COMMERCE_PROVIDER=mock` e `CONTENT_PROVIDER=mock` e ridistribuire lo
  SHA precedentemente verificato.
- Non resettare il database e non cancellare migration, ordini, audit o movimenti inventario.
- Disattivare gli ordini con la conferma owner `DISATTIVA ORDINI` se il problema riguarda checkout.
- Conservare log Vercel/Supabase e aprire un incidente senza copiare segreti nei ticket.
- Correggere con migration forward e nuovo gate CI; mai rollback distruttivo dello schema remoto.

