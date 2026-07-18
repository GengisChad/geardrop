# Vercel Preview environment — PR #2

Configurazione concreta dell'ambiente **Preview** collegato alla PR #2, per il progetto Supabase
dedicato **GearDrop Development**. Per la tabella variabili e la sequenza di deploy generale vedi
`vercel-rollout.md`, che questo documento non ripete. Qui: cosa manca in quel runbook per una
Preview reale (redirect Auth, sito URL, verifica), e come applicarlo.

Non configurare Production da questo documento. Non copiare variabili da altri progetti Vercel o
Supabase, incluso IBNApp.

## Variabili — solo Preview, solo GearDrop Development

Usare esattamente i nomi in `.env.example`. Non inventarne altri:

| Variabile | Ambito | Valore |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Preview | URL del progetto GearDrop Development |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Preview | publishable key del progetto |
| `SUPABASE_SECRET_KEY` | Preview, **server-only** | secret key del progetto |
| `COMMERCE_PROVIDER` | Preview | `mock` |
| `CONTENT_PROVIDER` | Preview | `mock` |
| `GEARDROP_OWNER_EMAILS` | non impostare in Vercel | usata solo dalla procedura one-shot locale/DB, mai da un runtime deployato |

In Vercel, marcare `SUPABASE_SECRET_KEY` come variabile server-only (mai esposta al bundle
client). Verificare dopo il deploy che non compaia in nessun bundle JS pubblico: cercare la
stringa nei file serviti da `/_next/static` con gli strumenti rete del browser, non deve comparire.

## Auth — Site URL e redirect

Nel progetto Supabase (Authentication → URL Configuration):

- **Site URL**: l'URL della Preview assegnata da Vercel a questa PR (dominio `*.vercel.app`
  generato per il deployment, non un dominio di produzione).
- **Redirect URLs**: aggiungere esattamente l'URL della Preview con i path usati dal flusso admin
  (login, reset password, conferma email). Non usare wildcard ampi (`*.vercel.app`) — ogni
  redirect approvato è un URL esatto, altrimenti qualunque altra Preview su Vercel potrebbe
  ricevere redirect di sessione.
- Conferma email: lasciare attiva (comportamento di default per progetti nuovi). Non disabilitarla
  per comodità di test — è lo stesso comportamento che ci si aspetta in produzione.
- SMTP: usare il mailer di sviluppo integrato di Supabase per lo staging finché non si configura un
  mittente reale in `geardrop-production-rollout.md`.

Se la Preview viene rigenerata (nuovo commit sulla PR, nuovo URL `*.vercel.app`), aggiornare Site
URL e redirect prima di testare di nuovo Auth — un redirect non registrato fallisce silenziosamente
lato Supabase.

## Intro video

Nessuna variabile d'ambiente è prevista per il video di intro: non esiste nel branch alcun
riferimento a un componente o a un percorso configurabile (verificato — nessun match per
`intro` in codice, nessuna directory `public/video/`). Se e quando il componente sarà aggiunto,
il file atteso è statico in `public/video/geardrop-intro-desktop.mp4`, servito come asset Next.js
normale: non richiede variabili Vercel. Non è parte di questo rollout di staging.

## Sequenza per questa PR

1. Eseguire il preflight (`geardrop-staging-rollout.md` §1) e completare fino al bootstrap owner.
2. Impostare le variabili sopra sull'ambiente Preview di Vercel (dashboard progetto → Settings →
   Environment Variables → Preview, oppure `vercel env add <nome> preview`).
3. Configurare Auth Site URL/redirect con l'URL Preview assegnato.
4. Ridistribuire la Preview (nuovo commit o redeploy manuale) perché le variabili abbiano effetto.
5. Verificare storefront pubblico invariato (provider `mock`) e `/admin` raggiungibile solo dopo
   login con uno dei due owner bootstrap.
6. Procedere con `geardrop-smoke-test.md`.

## Rollback di questo ambiente

Rimuovere o azzerare le variabili Preview, oppure ripristinare `COMMERCE_PROVIDER=mock` e
`CONTENT_PROVIDER=mock` se erano stati cambiati durante un test. Non toccare il database remoto
per un rollback di solo ambiente applicativo — vedi la sezione Rollback di `vercel-rollout.md` per
incidenti che coinvolgono anche i dati.
