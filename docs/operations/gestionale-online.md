# Gestionale online: app condivisa tra i soci

Il gestionale gira come **web app installabile** su un indirizzo privato, separato dal sito del
negozio, e lavora su **un database Supabase dedicato**. I tre soci vedono gli stessi dati in tempo
reale; ognuno entra con il proprio account ed è owner di Gear Drop e Oryvenne. Il sito Gear Drop e
il suo database restano intatti: il collegamento degli ordini del sito è un passo successivo.

## 1. Database dedicato (Supabase)

1. Nell'account Supabase di Gear Drop (non IBNApp): **New project** → nome `gestionale`, regione
   **Europe (Frankfurt) `eu-central-1`**, password del database salvata nel gestore password.
2. **Authentication → Sign In / Providers → Email**: disattivare "Allow new users to sign up"
   (gli account li crea solo un owner). **URL Configuration → Site URL**: l'indirizzo Vercel del
   punto 2.
3. Dal PC con il repo (una volta sola; chiede di accedere a Supabase nel browser):

```powershell
pnpm exec supabase login
pnpm exec supabase link --project-ref <REF-DEL-PROGETTO>
pnpm exec supabase db push --include-seed
```

   `--include-seed` carica il catalogo Gear Drop di partenza (21 prodotti, categorie, contenuti).
   Oryvenne parte vuota. Le migrazioni creano le due aziende.

## 2. App (Vercel)

1. Nuovo progetto Vercel dallo stesso repository GitHub, **separato** dal progetto del negozio,
   branch `feat/gestionale-unico` (poi `main` quando sarà unito).
2. Variabili d'ambiente (Production):

| Variabile | Valore |
| --- | --- |
| `GESTIONALE_ONLY` | `true` — solo /admin, nessuna pagina del negozio, fuori dai motori di ricerca |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del progetto `gestionale` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key del progetto `gestionale` |
| `SUPABASE_SECRET_KEY` | secret key del progetto `gestionale` (solo server) |
| `NEXT_PUBLIC_STOREFRONT_ORGANIZATION` | `geardrop` |
| `COMMERCE_PROVIDER` / `CONTENT_PROVIDER` | `supabase` |
| `ANTHROPIC_API_KEY` | facoltativa: accende agente prezzi e assistente |

   Nessuna chiave Stripe: i pagamenti restano sul sito del negozio.
3. Deploy. L'indirizzo `https://<progetto>.vercel.app` porta direttamente al login; un dominio
   tipo `gestionale.geardropshop.it` si aggiunge da Vercel → Domains.

## 3. Account dei soci

1. Supabase → **Authentication → Users → Add user → Create new user**, per ognuno dei tre:
   email, password provvisoria, "Auto Confirm User" attivo.
2. Supabase → **SQL Editor**, con le tre email:

```sql
insert into public.staff_profiles (user_id, role, display_name, active, invite_email, invite_status)
select id, 'owner', split_part(email, '@', 1), true, email, 'active'
from auth.users where email in ('socio1@esempio.it', 'socio2@esempio.it', 'socio3@esempio.it')
on conflict (user_id) do update set active = true, role = 'owner';

insert into public.organization_members (organization_id, user_id, role, active)
select organization.id, person.id, 'owner', true
from public.organizations as organization
cross join auth.users as person
where person.email in ('socio1@esempio.it', 'socio2@esempio.it', 'socio3@esempio.it')
on conflict (organization_id, user_id) do update set role = 'owner', active = true;
```

3. Ogni socio accede e cambia la password da **Il mio account** (clic sul proprio nome in alto).
   Nuovi collaboratori si invitano poi da **Team**, azienda per azienda.

## 4. Installare l'app

- **PC (Chrome o Edge)**: aprire l'indirizzo, icona "Installa" nella barra dell'indirizzo →
  "Gestionale" con la sua icona sul desktop e nel menu Start.
- **Android (Chrome)**: menu ⋮ → "Installa app".
- **iPhone (Safari)**: Condividi → "Aggiungi alla schermata Home".

L'app legge sempre i dati dal vivo: senza connessione mostra una pagina che lo dice, non numeri
vecchi.

## Costi da prevedere

- Supabase: piano Free per un secondo progetto (con pausa dopo una settimana di inattività), o Pro
  se l'organizzazione lo è già.
- Vercel: uso commerciale richiede il piano Pro.
- Anthropic: solo se si attiva l'agente; il costo di ogni esecuzione è mostrato in "Prezzi IA".

## Collegare poi il sito Gear Drop

Quando si deciderà, due strade: portare il negozio sullo stesso database del gestionale, oppure un
job che legge gli ordini dal database del negozio e li riporta nel gestionale. Entrambe richiedono
backup e una prova su copia prima di toccare la produzione.
