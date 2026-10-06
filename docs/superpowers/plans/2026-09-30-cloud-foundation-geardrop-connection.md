# Fondazione cloud e collegamento sicuro a Gear Drop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Obiettivo:** Consegnare la prima versione utilizzabile del gestionale cloud indipendente: un deployment privato separato che autentica i soci e lo staff tramite Supabase, impone l'MFA ai proprietari, mostra i dati live di Gear Drop attraverso una superficie prodotto fail-closed e di sola lettura, permette il cambio organizzazione e può essere installato come PWA senza alterare la disponibilità dello storefront.

**Architettura:** Un monorepo pnpm contiene due applicazioni Next indipendenti e un progetto Supabase autorevole condiviso. Lo storefront esistente resta alla root e continua a possedere commercio, checkout, `/admin` legacy e webhook Stripe; `apps/management` possiede una build, un App Router, una configurazione e un deployment separati. Le due app condividono soltanto package workspace neutrali e dichiarati, a partire da `packages/runtime-contract`; l'app management non importa route, configurazione o componenti root. Membership, RLS, RPC in `management_api`, controlli AAL2 e flag per organizzazione proteggono i nuovi accessi. Prima di qualsiasi migrazione additiva o deployment remoto, la produzione viene provata mediante credenziali sorgente dimostrabilmente read-only, backup cifrato e copia locale sanificata.

**Stack tecnico:** Next.js 16 App Router, React 19, TypeScript 5.9, Supabase Auth/Postgres/RLS/pgTAP, Vitest 4, Playwright 1.61, pnpm 10.34.6 tramite Corepack, Docker/Supabase CLI, GitHub Actions, Vercel.

**Specifica:** `docs/superpowers/specs/2026-09-30-gestionale-cloud-operativo-design.md`

## Ambito del piano

Questo piano realizza il sottoprogetto 1 della specifica approvata: **fondazione cloud e collegamento sicuro a Gear Drop**. Il risultato è un deployment gestionale separato che mostra dati Gear Drop riconciliati senza esporre operazioni di business in scrittura.

Incluso:

- baseline verde e riproducibile su Windows e CI;
- contratto esplicito di deployment/runtime e build fisicamente indipendenti per storefront e gestionale;
- route, shell, autenticazione, selettore organizzazione e PWA indipendenti;
- MFA obbligatoria per gli owner e controllo AAL2;
- tabella dei feature flag in `public`, helper in `private` ed entrypoint minimi in `management_api`;
- overview read-only sui dati live del progetto Supabase Gear Drop;
- rehearsal di produzione read-only, backup cifrato, sanificazione locale e artifact di staging;
- gate browser dedicati, doppia build, runbook di rollout e recupero.

Rinviato ai sottoprogetti successivi già previsti:

- prenotazioni inventario e macchina a stati checkout/webhook;
- ordini fornitori e ricezioni parziali;
- picking, adapter corrieri, etichette, tracking e resi;
- nuovi snapshot previsionali e workflow marketing/AI;
- migrazione di ogni writer e RPC legacy `/admin` dietro i nuovi helper;
- migrazione dei file Storage verso path prefissati per organizzazione.

In questa fase `LEGACY_ADMIN_MODE=enabled` resta obbligatorio sul deployment storefront: `/admin` rimane operativo fino alla parità funzionale dei moduli gestionali. Il comportamento `redirect` viene implementato e testato come capacità futura, ma non fa parte del rollout né dei criteri di completamento di questo piano.

**Caveat del confine di sicurezza:** lo stesso token Supabase Auth conserva i permessi legacy indipendentemente dal dominio, perché l'origine non è una claim di autorizzazione. Questa fase garantisce il read-only della **superficie prodotto gestionale**, non un confine database per origine. Il primo accesso di produzione è quindi limitato ai soci e allo staff Gear Drop già fidati. L'hardening di tutti i writer/RPC legacy è un piano successivo obbligatorio prima di allargare l'accesso o attivare moduli operativi.

## Correzione architetturale dopo review Task 2

Il confine runtime del Task 2 è stato implementato nei commit `5c46e7c` e `d8ac70e`: classificazione route, target Supabase fail-closed, rewrite e proxy bloccano a runtime gli ingressi non ammessi. La review successiva ha però verificato che una build root con `NEXT_PUBLIC_APP_SURFACE=management` continua a compilare e generare 57 route, incluse `/admin`, checkout, webhook e pagine storefront. Rewrite e proxy non costituiscono quindi isolamento di compilazione.

La decisione vincolante è mantenere lo storefront alla root e creare `apps/management` come seconda app Next. Il Task 2 resta il contratto deployment/runtime già realizzato; il Task 3 aggiunge il confine fisico e di build mancante. Da quel momento la root rifiuta di presentarsi come build management, mentre l'app management compila soltanto le proprie route. Un errore esclusivo di una app non deve rompere la build dell'altra; un errore in un package neutrale condiviso può correttamente romperle entrambe.

## Vincoli globali

- Solo migrazioni additive; nessun rollback distruttivo dei dati di produzione.
- Storefront e gestionale devono compilare, distribuire e fallire indipendentemente come due app Next. Un errore esclusivo di una app non entra nel typecheck/build dell'altra; un errore in un package workspace condiviso può fallire entrambe. Un outage Supabase resta una dipendenza condivisa nota.
- Il gestionale non deve servire pagine storefront, checkout, webhook Stripe, endpoint preview o handler legacy `/admin`.
- `apps/management/**` non importa route, configurazione, API, pagine o componenti dalla root. I soli import cross-app ammessi passano da package workspace neutrali con dipendenze esplicite e regola di confine eseguibile.
- Lo storefront resta alla root: questo piano non esegue una migrazione wholesale verso `apps/storefront`.
- Nel browser arrivano soltanto URL Supabase e publishable key. Secret Supabase, Stripe, email e AI sono esclusi dall'ambiente del web server gestionale finché un workflow server revisionato non li richiede.
- Una build gestionale remota deve combaciare con il project ref Supabase atteso. Ref assente/malformato, mismatch o loopback in produzione fermano l'app prima di una query di business.
- `read_access` e tutti i flag write/external partono `false`. In questa fase solo `read_access` dispone di un setter, riservato a owner+AAL2; gli altri flag sono deliberatamente non attivabili.
- La superficie prodotto non contiene form, server action o API operative. Le sole mutazioni consentite sono sessione, preferenza organizzazione, ciclo MFA e setter control-plane di `read_access`.
- Ogni lettura dei flag fallisce in chiusura su riga assente, errore query, enum sconosciuto o flag disabilitato.
- L'organizzazione corrente deriva da una membership attiva nel database; il cookie è soltanto una preferenza.
- L'accesso owner ai dati gestionali richiede `aal2`. Admin/editor che possiedono già un fattore verificato devono completarne la challenge. L'autenticazione cliente non cambia.
- Tabella e tipi condivisi restano in `public`; helper non esposti in `private`; ogni nuovo RPC browser-facing entra in `management_api`. Restano rinviati soltanto gli RPC legacy.
- Le nuove funzioni SQL usano `search_path = ''`, revocano `EXECUTE` a `PUBLIC`, verificano utente, membership, organizzazione, ruolo e AAL dove richiesto, con test pgTAP positivi e negativi.
- Le risposte con dati aziendali/personali usano `Cache-Control: private, no-store`; il service worker può memorizzare soltanto pagina offline statica e asset shell privi di dati di business.
- La sorgente del rehearsal deve essere provata read-only anche nei privilegi effettivi e nelle impostazioni di transazione. Un ruolo `postgres`, superuser, owner, service-role-equivalent o capace di scrivere/eseguire codice mutabile viene rifiutato.
- I dati grezzi di produzione non diventano artifact Git né file persistenti in chiaro. La sanificazione avviene solo su una copia locale verificata; staging riceve esclusivamente un artifact sanificato.
- Nessuna migrazione produzione, attivazione flag, modifica DNS o restore staging/produzione avviene senza lo stop gate corrispondente del Task 10. Il redirect del legacy admin resta fuori fase.
- Ogni task segue red-green-refactor: prima il test nominato in errore, poi l'implementazione minima completa, infine gate focalizzati e regressione prima del commit.

## Focus della revisione

La revisione finale deve provare esplicitamente queste cinque classi di errore:

1. **Artifact o target errato:** una route storefront nel manifest management, un output directory condiviso, un project ref remoto assente/non coincidente o loopback in build production fermano il gestionale prima di leggere dati.
2. **Downgrade MFA:** owner in AAL1 o staff con fattore verificato non ancora sfidato non raggiungono overview o azioni control-plane.
3. **Richiesta cross-organizzazione:** cookie forgiato/stale e ruoli diversi tra Gear Drop/Oryvenne non ampliano mai membership o ruolo.
4. **Errore feature:** `read_access` disabilitato, assente, malformato o illeggibile impedisce tutte le query di business e qualsiasi rendering di valori.
5. **Artifact staging non sicuro:** PII live, identità, ID provider o effetto outbound abilitato fanno fallire verifica ed export.

---

### Task 1: Ripristinare una baseline verde multipiattaforma

**File:**

- Modifica: `tests/unit/scoped-queries-contract.test.ts:30-39`
- Verifica: `src/lib/supabase/database.types.ts`

- [ ] **Step 1: Riprodurre il fallimento Windows**

Eseguire:

```bash
pnpm exec vitest run tests/unit/scoped-queries-contract.test.ts
```

Atteso: FAIL nel matcher delle firme perché il file generato usa CRLF e la regex presume LF.

- [ ] **Step 2: Aggiungere una fixture indipendente dai line ending**

Nel test, dimostrare che la stessa firma minima viene analizzata con `\n` e `\r\n`. Normalizzare al confine:

```ts
const normalized = source.replace(/\r\n?/g, "\n");
```

Rieseguire il test focalizzato. Atteso: la fixture CRLF resta rossa finché ogni matcher non usa `normalized`.

- [ ] **Step 3: Usare l'input normalizzato nella scansione esistente**

Lasciare invariato il file generato e modificare soltanto il parser del test.

```bash
pnpm exec vitest run tests/unit/scoped-queries-contract.test.ts
pnpm test
```

Atteso: 108 file e 937 test PASS.

- [ ] **Step 4: Rieseguire la baseline applicativa**

```bash
pnpm lint
pnpm typecheck
pnpm build
```

Atteso: tutti i comandi terminano con codice 0.

- [ ] **Step 5: Committare la correzione**

```bash
git add tests/unit/scoped-queries-contract.test.ts
git commit -m "test: make scoped contract line-ending safe"
```

---

### Task 2: Definire il contratto deployment e il confine runtime

**Stato verificato:** implementato nei commit `5c46e7c` e `d8ac70e`. Questo task garantisce classificazione e blocco runtime, non isolamento della compilazione; tale garanzia appartiene al Task 3.

**File:**

- Modifica: `src/lib/app-mode.ts:1-35`
- Modifica: `next.config.ts:1-31`
- Modifica: `src/proxy.ts:1-12`
- Modifica: `src/lib/supabase/env.ts:1-39`
- Modifica: `src/lib/site-url.ts:1-42`
- Modifica: `src/app/robots.ts`
- Modifica: `.env.example`
- Modifica: `tests/unit/app-mode.test.ts:1-44`
- Modifica: `tests/unit/supabase-env.test.ts`
- Crea: `tests/unit/management-route-boundary.test.ts`
- Crea: `src/lib/management/routes.ts`

- [ ] **Step 1: Scrivere i test del contratto di deployment**

Sostituire le attese “tutto verso `/admin`” con casi tabellari per:

- storefront di default e `NEXT_PUBLIC_APP_SURFACE=storefront`;
- contratto management selezionabile con `NEXT_PUBLIC_APP_SURFACE=management`, destinato dal Task 3 esclusivamente a `apps/management`;
- rifiuto di superficie o modalità sconosciuta;
- modalità `read_only` e `active`;
- project ref remoto coincidente/non coincidente;
- `local` ammesso solo su loopback e fuori produzione;
- `/admin` storefront con `LEGACY_ADMIN_MODE=enabled|redirect`, senza attivare `redirect` in alcun ambiente di rollout;
- classificazione per metodo e path.

Contratti pubblici in `src/lib/app-mode.ts`:

```ts
export type AppSurface = "storefront" | "management";
export type ManagementMode = "read_only" | "active";
export type LegacyAdminMode = "enabled" | "redirect";

export type DeploymentContract = Readonly<{
  surface: AppSurface;
  managementMode: ManagementMode;
  managementOrigin: string | null;
  storefrontOrigin: string;
  expectedSupabaseProjectRef: string | null;
  legacyAdminMode: LegacyAdminMode;
}>;

export type RequestDisposition =
  | { readonly kind: "allow" }
  | { readonly kind: "rewrite"; readonly destination: string }
  | { readonly kind: "redirect"; readonly destination: string }
  | { readonly kind: "not_found" };

export function readDeploymentContract(env?: Readonly<Record<string, string | undefined>>): DeploymentContract;
export function assertManagementSupabaseTarget(
  contract: DeploymentContract,
  supabaseUrl: string,
  nodeEnv: string | undefined,
): void;
export function classifyRequest(pathname: string, method: string, contract: DeploymentContract): RequestDisposition;
```

Codici errore stabili e sicuri:

```text
GD_APP_SURFACE_INVALID
GD_MANAGEMENT_MODE_INVALID
GD_MANAGEMENT_ORIGIN_REQUIRED
GD_MANAGEMENT_PROJECT_REF_REQUIRED
GD_MANAGEMENT_PROJECT_MISMATCH
GD_MANAGEMENT_REMOTE_REQUIRED
```

```bash
pnpm exec vitest run tests/unit/app-mode.test.ts tests/unit/supabase-env.test.ts tests/unit/management-route-boundary.test.ts
```

Atteso: FAIL perché la modalità corrente mantiene `/admin`, tutte le `/api` e asset storefront.

- [ ] **Step 2: Implementare parsing rigoroso e validazione target**

Supportare e documentare:

```dotenv
NEXT_PUBLIC_APP_SURFACE=storefront
MANAGEMENT_MODE=read_only
MANAGEMENT_ORIGIN=
STOREFRONT_ORIGIN=https://geardropshop.it
NEXT_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF=
LEGACY_ADMIN_MODE=enabled
```

`readPublicSupabaseEnv()` invoca la validazione target per il contratto management. Non registra key, query dell'URL o secret. Le build mock storefront senza ambiente Supabase restano supportate. Il Task 3 sposta il consumo del contratto management nella seconda app e impedisce alla root di usarlo come modalità di build.

- [ ] **Step 3: Implementare la mappa pubblica delle route gestionali**

```ts
export const MANAGEMENT_REWRITES = {
  "/": "/gestionale",
  "/login": "/gestionale/login",
  "/logout": "/gestionale/logout",
  "/account": "/gestionale/account",
  "/settings/security": "/gestionale/settings/security",
} as const;

export function managementInternalPath(pathname: string): string | null;
```

Supportare anche `/mfa/:path*`. La allowlist comprende solo queste route, `/auth/callback`, asset statici/image Next, manifest/service worker/pagina offline gestionali, icone, favicon e robots.

- [ ] **Step 4: Imporre il confine in configurazione e proxy**

`next.config.ts` pubblica le route pulite via rewrite e applica `X-Robots-Tag: noindex, nofollow` e `Cache-Control: private, no-store` alle route applicative gestionali durante la fase runtime iniziale.

In `src/proxy.ts`, classificare prima del refresh sessione:

- GET/HEAD verso path shop espliciti rimandano a `STOREFRONT_ORIGIN`;
- `/admin/**` sul deployment management rimanda alla home gestionale;
- `/api/**`, checkout, preview e webhook rispondono 404 sul gestionale;
- metodi non-GET sconosciuti rispondono 404;
- lo storefront resta invariato con `LEGACY_ADMIN_MODE=enabled`; il ramo `redirect` è soltanto coperto da test;
- il refresh sessione copre route auth/protette pulite.

- [ ] **Step 5: Verificare confine e header**

```bash
pnpm exec vitest run tests/unit/app-mode.test.ts tests/unit/supabase-env.test.ts tests/unit/management-route-boundary.test.ts
pnpm lint
pnpm typecheck
```

Atteso: PASS, incluso POST `/api/stripe/webhook` → 404 in management e comportamento storefront invariato.

Questa prova non è sufficiente per dichiarare una build indipendente: la presenza delle route nel manifest root viene trattata come RED del Task 3, non come eccezione accettabile.

- [ ] **Step 6: Committare il confine**

```bash
git add src/lib/app-mode.ts src/lib/management/routes.ts src/lib/supabase/env.ts src/lib/site-url.ts src/proxy.ts src/app/robots.ts next.config.ts .env.example tests/unit/app-mode.test.ts tests/unit/supabase-env.test.ts tests/unit/management-route-boundary.test.ts
git commit -m "feat: isolate management deployment surface"
```

---

### Task 3: Separare fisicamente l'app management e provarne la build indipendente

**File:**

- Crea: `pnpm-workspace.yaml`
- Modifica: `package.json`
- Modifica: `pnpm-lock.yaml`
- Modifica: `tsconfig.json`
- Modifica: `next.config.ts`
- Modifica: `src/proxy.ts`
- Modifica: `src/lib/app-mode.ts`
- Elimina: `src/lib/management/routes.ts`
- Modifica: `src/lib/supabase/env.ts`
- Crea: `packages/runtime-contract/package.json`
- Crea: `packages/runtime-contract/tsconfig.json`
- Crea: `packages/runtime-contract/src/index.ts`
- Crea: `packages/data-contract/package.json`
- Crea: `packages/data-contract/tsconfig.json`
- Crea: `packages/data-contract/src/index.ts`
- Crea: `packages/data-contract/src/database.types.ts`
- Modifica: `src/lib/supabase/database.types.ts`
- Crea: `apps/management/package.json`
- Crea: `apps/management/tsconfig.json`
- Crea: `apps/management/next-env.d.ts`
- Crea: `apps/management/next.config.ts`
- Crea: `apps/management/eslint.config.mjs`
- Crea: `apps/management/src/proxy.ts`
- Crea: `apps/management/src/lib/supabase/env.ts`
- Crea: `apps/management/src/lib/supabase/client.ts`
- Crea: `apps/management/src/lib/supabase/server.ts`
- Crea: `apps/management/src/lib/supabase/proxy.ts`
- Crea: `apps/management/src/app/layout.tsx`
- Crea: `apps/management/src/app/page.tsx`
- Crea: `apps/management/src/app/error.tsx`
- Crea: `apps/management/src/app/global-error.tsx`
- Crea: `apps/management/src/app/not-found.tsx`
- Crea: `apps/management/src/app/robots.ts`
- Crea: `apps/management/src/app/globals.css`
- Crea: `apps/management/public/management-offline.html`
- Crea: `scripts/check-workspace-boundaries.ts`
- Crea: `scripts/verify-management-build-manifest.ts`
- Crea: `scripts/verify-build-manifest-isolation.ts`
- Crea: `scripts/verify-build-independence.ts`
- Crea: `tests/unit/workspace-app-isolation.test.ts`
- Crea: `tests/unit/workspace-import-boundary.test.ts`
- Crea: `tests/unit/management-build-manifest.test.ts`
- Crea: `tests/unit/build-manifest-isolation.test.ts`
- Crea: `tests/unit/build-independence.test.ts`
- Crea: `tests/unit/management-supabase-ssr.test.ts`
- Modifica: `.github/workflows/supabase-database-ci.yml`
- Modifica: `tests/unit/supabase-ci-workflow.test.ts`
- Modifica: `tests/unit/app-mode.test.ts`
- Modifica: `tests/unit/supabase-env.test.ts`
- Modifica: `tests/unit/management-route-boundary.test.ts`
- Modifica: `tests/unit/scoped-queries-contract.test.ts`
- Crea: `tests/fixtures/workspace-boundary/allowed-package-import.ts`
- Crea: `tests/fixtures/workspace-boundary/forbidden-root-route-import.ts`
- Crea: `tests/fixtures/workspace-boundary/forbidden-root-config-import.ts`

- [ ] **Step 1: Scrivere il contratto RED del workspace**

I test devono fallire finché non risultano vere tutte queste condizioni:

- `pnpm-workspace.yaml` include esattamente la root implicita, `apps/*` e `packages/*`;
- `apps/management` possiede `package.json`, `next.config.ts`, `tsconfig.json`, App Router e proxy propri;
- lo storefront continua a vivere alla root e non esiste una migrazione artificiale in `apps/storefront`;
- gli script root espongono comandi distinti per dev, typecheck e build di ciascuna app;
- il root `package.json` dichiara esattamente `"packageManager": "pnpm@10.34.6"` e il lockfile è prodotto dalla stessa versione;
- `.github/workflows/supabase-database-ci.yml` non contiene `pnpm@11.13.1` né una versione implicita: attiva con Corepack esattamente pnpm 10.34.6, verifica `pnpm --version` e installa con `--frozen-lockfile`;
- il workflow genera i tipi dello schema `public` in `artifacts/database.types.ts` e confronta il drift con il canonico `packages/data-contract/src/database.types.ts`, mai con il re-export root; il Task 4 estenderà questo stesso comando a `public,management_api`;
- il workflow esegue il lint aggregato, che copre una sola volta root/storefront, package condivisi e app management;
- una build root con `NEXT_PUBLIC_APP_SURFACE=management` fallisce con `GD_ROOT_MANAGEMENT_BUILD_UNSUPPORTED` invece di fingersi gestionale;
- il child tsconfig include soltanto `apps/management/src/**`, `next-env.d.ts` e `.next/types/**` e non ingloba `src/app`, `src/pages`, `src/components`, `src/lib` o `.next/types` della root;
- il root tsconfig non include per glob `apps/management/**` o i sorgenti dei package; i package importati vengono comunque verificati tramite dipendenza esplicita e script dedicato;
- la build management usa una directory `.next` interna a `apps/management` e un App Router posseduto dalla seconda app;
- il manifest management applica una allowlist di route proprie e non contiene `/admin`, `/api`, checkout o route shop.

Eseguire:

```bash
pnpm exec vitest run tests/unit/workspace-app-isolation.test.ts tests/unit/workspace-import-boundary.test.ts tests/unit/management-build-manifest.test.ts tests/unit/build-manifest-isolation.test.ts tests/unit/build-independence.test.ts tests/unit/management-supabase-ssr.test.ts tests/unit/supabase-ci-workflow.test.ts
```

Atteso: FAIL perché la root è ancora l'unica app Next, una build in modalità management genera le 57 route root e il workflow usa ancora pnpm 11.13.1 con drift confrontato al file tipi root.

- [ ] **Step 2: Creare il workspace e il package runtime neutrale**

Creare:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

`packages/runtime-contract` deve chiamarsi `@geardrop/runtime-contract`, essere `private`, side-effect free e pubblicare soltanto contratti puri per:

- parsing di `AppSurface`, `ManagementMode` e `LegacyAdminMode`;
- validazione `MANAGEMENT_ORIGIN`, `STOREFRONT_ORIGIN` e project ref Supabase;
- allowlist nominativa delle route clean management e classificatore che restituisce `{ kind: "allow" }` per route proprie, senza rewrite interni;
- assertion app-specifiche `assertStorefrontApplicationSurface()` e `assertManagementApplicationSurface()`.

Spostare l'implementazione neutrale da `src/lib/app-mode.ts` nel package e mantenere dalla root un re-export compatibile per non rompere i consumer storefront già esistenti. Sostituire `MANAGEMENT_REWRITES` con `MANAGEMENT_ROUTE_ALLOWLIST` e `classifyManagementRequest()`: `/`, `/login`, `/logout`, `/account`, `/settings/security`, `/mfa/**` e `/auth/callback` sono route possedute direttamente e ricevono `allow`; path storefront/API ricevono la disposizione fail-closed prevista. Eliminare `src/lib/management/routes.ts` e aggiornare i test legacy: nessun consumer finale può riscrivere verso `/gestionale`. Il package non importa Next, React, Supabase client, route o configurazioni di una delle app.

Creare inoltre `@geardrop/data-contract` come package neutrale per i tipi database correnti, senza Next o UI. Spostare il file generato canonico in `packages/data-contract/src/database.types.ts`; `src/lib/supabase/database.types.ts` diventa un re-export compatibile e `tests/unit/scoped-queries-contract.test.ts` legge il file canonico. In questa fase `db:types` genera `--schema public` nel package; il Task 4 aggiornerà lo stesso comando a `--schema public,management_api`.

Il `package.json` root e `apps/management/package.json` dichiarano `@geardrop/runtime-contract: "workspace:*"` e `@geardrop/data-contract: "workspace:*"`; entrambe le app configurano `transpilePackages` per i due package. Un errore condiviso deve quindi emergere nei typecheck/build di entrambe.

- [ ] **Step 3: Creare la seconda app Next minima e assegnarle le route management**

`apps/management` possiede fisicamente le route pubbliche pulite. In questa fase minima crea `/` e `/robots.txt`; i Task 5 e 6 aggiungeranno `/login`, `/logout`, `/account`, `/settings/security`, `/mfa/enroll`, `/mfa/challenge` e `/auth/callback` direttamente sotto il suo App Router. Non creare route `/admin`, `/api`, checkout o storefront e non importare l'albero root.

`apps/management/next.config.ts`:

- richiede `assertManagementApplicationSurface()`;
- applica `X-Robots-Tag: noindex, nofollow` e `Cache-Control: private, no-store` alle route applicative;
- usa target Supabase remoto fail-closed in production;
- non carica né estende il `next.config.ts` root;
- non definisce alcun rewrite verso `/gestionale` o verso la root: le route clean sono file reali dell'app.

`apps/management/src/proxy.ts` applica il classificatore neutrale prima del refresh sessione e restituisce 404 per metodi/path non ammessi. `apps/management/src/lib/supabase/env.ts` convalida URL/key/ref prima di creare client o query. La pagina iniziale è dinamica, non interroga il database durante `next build` e mostra soltanto uno stato fondazione privo di dati.

Trasferire nella seconda app i rami management di header, classificazione e validazione implementati nel Task 2. Alla root, `next.config.ts` chiama `assertStorefrontApplicationSurface()` e rifiuta esplicitamente `NEXT_PUBLIC_APP_SURFACE=management`; `src/proxy.ts` resta soltanto storefront e conserva `/admin`, checkout e webhook con `LEGACY_ADMIN_MODE=enabled`. `src/lib/app-mode.ts` può mantenere re-export compatibili del package per test/consumer storefront, ma `MANAGEMENT_REWRITES` e il modulo route legacy vengono rimossi. Aggiornare i test del Task 2 affinché esercitino allowlist/classificatore condivisi e i due consumer app-specifici.

- [ ] **Step 4: Creare helper Supabase SSR posseduti dall'app management**

`apps/management/package.json` dichiara direttamente, con le versioni allineate alla root:

```json
"@supabase/ssr": "0.12.3",
"@supabase/supabase-js": "2.110.7"
```

Implementare helper locali senza importare `src/lib/supabase/**` dalla root:

```ts
export function createManagementBrowserClient(): SupabaseClient<Database>;
export async function createManagementServerClient(): Promise<SupabaseClient<Database>>;
export async function updateManagementSession(request: NextRequest): Promise<NextResponse>;
```

`client.ts` legge soltanto URL e publishable key già validati. `server.ts` usa `cookies()` con adapter `getAll`/`setAll`, preserva attributi cookie e gestisce il vincolo di scrittura dei Server Component senza nascondere errori di configurazione. `proxy.ts` crea il client SSR con cookie request/response, propaga ogni cookie aggiornato su entrambi gli oggetti e verifica l'utente con `auth.getUser()`; non autorizza tramite il solo `getSession()`. `apps/management/src/proxy.ts` classifica prima la route e chiama l'helper sessione soltanto sulle route ammesse.

`tests/unit/management-supabase-ssr.test.ts` usa factory/cookie store mock per provare: validazione target prima di creare il client; nessun secret server nel browser; forwarding completo dei cookie; refresh su request e response; errore fail-closed; assenza di import dagli helper Supabase root. Il Task 5 deve consumare questi helper, non crearne copie.

- [ ] **Step 5: Rendere i tsconfig e gli import boundary eseguibili**

Il root `tsconfig.json` esclude `apps/**/*` e `packages/**/*` dai glob automatici; `apps/management/tsconfig.json` ha `baseUrl` locale, alias locali e include soltanto il proprio albero e `.next/types`. Nessun child config estende il tsconfig root se ciò reintroduce include/path alias della root.

Implementare `scripts/check-workspace-boundaries.ts` usando l'API del compilatore TypeScript, non una ricerca testuale. Per ogni `ImportDeclaration`, export-from, `import()` e `require()` con specifier statico in `apps/management`, risolvere il realpath del file e accettare soltanto:

- file dentro `apps/management`;
- dipendenze esterne dichiarate in `apps/management/package.json`;
- package workspace presenti nella allowlist esplicita: `@geardrop/runtime-contract` e `@geardrop/data-contract`.

Rifiutare path relativi che escono dall'app, alias root, import di `src/app/admin/**`, `src/app/api/**`, `src/components/admin/**`, `next.config.ts`, configurazioni storefront e deep import dentro `packages/**`. Le fixture provano un import package ammesso e import root vietati anche quando usano alias o traversal relativi.

- [ ] **Step 6: Fissare pnpm ed esporre script app-specifici**

Nel `package.json` root fissare esattamente:

```json
"packageManager": "pnpm@10.34.6"
```

Vercel documenta il supporto pnpm nelle versioni 6–10; pnpm 11 non è quindi un target di deployment accettabile ([documentazione Vercel sui package manager](https://vercel.com/docs/package-managers)). Rigenerare `pnpm-lock.yaml` con pnpm 10.34.6 e fare fallire test/CI se `pnpm --version` non restituisce esattamente `10.34.6`.

Aggiungere alla root:

```json
"dev": "pnpm dev:storefront",
"lint": "pnpm lint:storefront && pnpm lint:shared && pnpm lint:management",
"build": "pnpm build:storefront",
"typecheck": "pnpm typecheck:storefront",
"dev:storefront": "next dev",
"lint:storefront": "eslint src tests scripts next.config.ts playwright.config.ts playwright.admin.config.ts playwright.storefront.config.ts",
"lint:shared": "eslint packages/runtime-contract/src packages/data-contract/src",
"build:storefront": "pnpm --filter @geardrop/runtime-contract --filter @geardrop/data-contract typecheck && next build",
"typecheck:storefront": "pnpm --filter @geardrop/runtime-contract --filter @geardrop/data-contract typecheck && next typegen && tsc --noEmit",
"dev:management": "pnpm --dir apps/management dev",
"lint:management": "pnpm --dir apps/management lint",
"build:management": "pnpm --dir apps/management build",
"typecheck:management": "pnpm --dir apps/management typecheck",
"check:workspace-boundaries": "tsx scripts/check-workspace-boundaries.ts",
"verify:management-manifest": "tsx scripts/verify-management-build-manifest.ts",
"verify:manifest-isolation": "tsx scripts/verify-build-manifest-isolation.ts",
"verify:build-independence": "tsx scripts/verify-build-independence.ts"
```

In `apps/management/package.json`, `dev` e `lint` invocano `next dev` ed `eslint .`; `build` e `typecheck` eseguono prima il typecheck di entrambi i package workspace, poi rispettivamente `next build` e `next typegen && tsc --noEmit`. In questo modo anche Vercel con Root Directory `apps/management` verifica i package condivisi. Per compatibilità, gli omonimi root continuano a significare storefront e delegano agli script espliciti. `lint:storefront` possiede soltanto root `src`, test, script e config elencati; `lint:shared` possiede soltanto `packages/runtime-contract/src` e `packages/data-contract/src`; `lint:management` possiede soltanto `apps/management`. `lint` li aggrega una volta ciascuno, in quell'ordine, senza glob sovrapposti. Aggiornare `pnpm-lock.yaml` tramite pnpm; non duplicare versioni Next/React e non introdurre dipendenze non necessarie nell'app management.

Aggiornare nello stesso task `.github/workflows/supabase-database-ci.yml`, senza rinviare la compatibilità iniziale ai task successivi: rimuovere `pnpm/action-setup` con `version: 11.13.1`, configurare Node senza `cache: pnpm`, quindi eseguire `corepack enable`, `corepack prepare pnpm@10.34.6 --activate` e un'asserzione esatta su `pnpm --version` prima di `pnpm install --frozen-lockfile`; un eventuale cache del pnpm store va configurato soltanto dopo l'attivazione. Il workflow esegue `pnpm lint` — che copre le tre superfici senza duplicarle —, i typecheck/build app-specifici e il drift dei tipi. In questa fase il comando di generazione resta `supabase gen types typescript --local --schema public`, scrive l'artifact temporaneo e usa `diff --unified packages/data-contract/src/database.types.ts artifacts/database.types.ts`. `tests/unit/supabase-ci-workflow.test.ts` deve verificare versione, ordine setup Node/Corepack/install, assenza di pnpm 11, destinazione canonica del diff, composizione del lint e comandi distinti delle due app. Il Task 4 estende lo schema generato; il Task 9 estende lo stesso workflow con E2E e gate di deploy.

- [ ] **Step 7: Verificare il manifest reale della build management**

`scripts/verify-management-build-manifest.ts` legge almeno `apps/management/.next/routes-manifest.json`, `apps/management/.next/server/app-paths-manifest.json` e gli altri manifest route prodotti dalla versione Next installata. Normalizza route dinamiche e applica un'allowlist esplicita:

```text
/
/login
/logout
/account
/settings/security
/mfa/enroll
/mfa/challenge
/auth/callback
/robots.txt
```

Sono ammessi soltanto artifact interni Next documentati. Qualsiasi altra route applicativa fallisce, con controlli espliciti per `/admin`, `/api`, `/checkout`, `/carrello`, `/negozio`, `/prodotti` e webhook. Il test unitario usa manifest fixture positivi/negativi; il comando GREEN ispeziona il manifest realmente generato, non il solo sorgente.

`scripts/verify-build-manifest-isolation.ts` apre sia `.next/**` root sia `apps/management/.next/**`, verifica path canonici distinti e presenza del rispettivo `BUILD_ID` senza presumere che i valori debbano differire, richiede `/admin` e `/api/stripe/webhook` soltanto nel manifest storefront, riapplica l'allowlist management e ammette come intersezione soltanto route infrastrutturali/pubbliche dichiarate. Il test fixture deve fallire se un manifest viene letto dalla directory sbagliata o se una route proprietaria attraversa il confine.

- [ ] **Step 8: Provare l'indipendenza nelle due direzioni**

`scripts/verify-build-independence.ts` esegue in seriale una prova distruttiva soltanto su file sentinella temporanei e garantisce il ripristino byte-for-byte in `finally`. Il command runner fornisce internamente al build management gli stessi URL/ref remoti fittizi concordanti del gate CI, senza leggere target reali:

1. acquisisce un lock locale e registra hash/status dei path sentinella;
2. crea un errore TypeScript deliberato in `src/app/__build_isolation_probe__/page.tsx`;
3. prova che `pnpm build:management` PASS e `pnpm build:storefront` FAIL;
4. rimuove la sentinella root, crea l'errore in `apps/management/src/app/__build_isolation_probe__/page.tsx`;
5. prova che `pnpm build:storefront` PASS e `pnpm build:management` FAIL;
6. rimuove la sentinella management, crea un errore nel file incluso dal tsconfig `packages/runtime-contract/src/__build_isolation_probe__.ts` e prova che entrambi i comandi build FAIL;
7. rimuove sempre tutte le sentinelle, verifica assenza di residui e stato Git identico a quello iniziale.

Il runner rifiuta di partire se uno dei path sentinella esiste già, non gira in parallelo e redige l'output degli errori intenzionali. `tests/unit/build-independence.test.ts` usa un command runner iniettato per provare ordine, codici attesi, profilo env fittizio e cleanup anche su eccezione. In CI viene eseguito il runner reale. La terza fase dimostra che un errore nel package condiviso fallisce correttamente entrambe le build.

- [ ] **Step 9: Eseguire i gate GREEN della separazione**

```bash
corepack enable
corepack prepare pnpm@10.34.6 --activate
pnpm --version
pnpm install --lockfile-only
pnpm install --frozen-lockfile
pnpm exec vitest run tests/unit/app-mode.test.ts tests/unit/supabase-env.test.ts tests/unit/management-route-boundary.test.ts tests/unit/workspace-app-isolation.test.ts tests/unit/workspace-import-boundary.test.ts tests/unit/management-build-manifest.test.ts tests/unit/build-manifest-isolation.test.ts tests/unit/build-independence.test.ts tests/unit/management-supabase-ssr.test.ts tests/unit/supabase-ci-workflow.test.ts
pnpm check:workspace-boundaries
pnpm lint
pnpm typecheck:storefront
pnpm typecheck:management
pnpm db:reset
pnpm db:types
git diff --exit-code -- packages/data-contract/src/database.types.ts
pnpm build:storefront
NEXT_PUBLIC_APP_SURFACE=management NEXT_PUBLIC_SUPABASE_URL=https://ci-management.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=ci-publishable-key NEXT_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF=ci-management MANAGEMENT_ORIGIN=https://management-ci.invalid STOREFRONT_ORIGIN=https://storefront-ci.invalid MANAGEMENT_MODE=read_only pnpm build:management
pnpm verify:management-manifest
pnpm verify:manifest-isolation
pnpm verify:build-independence
pnpm test
```

Su PowerShell impostare le stesse variabili con sintassi `$env:` oppure tramite il wrapper CI documentato; i valori e le attese non cambiano.

Atteso: `pnpm --version` stampa `10.34.6`; install frozen, contratto workflow, test focalizzati, lint aggregato delle tre superfici, typecheck, drift tipi sul package canonico, build e regressione completa PASS; la prova sentinella dimostra l'indipendenza bidirezionale; il manifest management contiene solo route allowlisted; una build root con surface management fallisce col codice stabile previsto.

- [ ] **Step 10: Committare il confine fisico**

```bash
git add pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.json next.config.ts src/proxy.ts src/lib/app-mode.ts src/lib/management/routes.ts src/lib/supabase/env.ts src/lib/supabase/database.types.ts packages/runtime-contract packages/data-contract apps/management scripts/check-workspace-boundaries.ts scripts/verify-management-build-manifest.ts scripts/verify-build-manifest-isolation.ts scripts/verify-build-independence.ts .github/workflows/supabase-database-ci.yml tests/unit/supabase-ci-workflow.test.ts tests/unit/app-mode.test.ts tests/unit/supabase-env.test.ts tests/unit/management-route-boundary.test.ts tests/unit/scoped-queries-contract.test.ts tests/unit/workspace-app-isolation.test.ts tests/unit/workspace-import-boundary.test.ts tests/unit/management-build-manifest.test.ts tests/unit/build-manifest-isolation.test.ts tests/unit/build-independence.test.ts tests/unit/management-supabase-ssr.test.ts tests/fixtures/workspace-boundary
git commit -m "feat: split management into independent app"
```

---

### Task 4: Aggiungere feature flag fail-closed e API gestionale dedicata

**File:**

- Crea: `supabase/migrations/20261006210000_add_management_feature_flags.sql`
- Crea: `supabase/tests/049_management_feature_flags.test.sql`
- Modifica: `supabase/tests/044_organization_tier_registry.test.sql:15-31`
- Modifica: `supabase/tests/upgrades/organizations_after.sql.in`
- Modifica: `supabase/config.toml`
- Modifica: `src/lib/supabase/database.types.ts`
- Modifica: `packages/data-contract/package.json`
- Modifica: `packages/data-contract/src/index.ts`
- Modifica: `packages/data-contract/src/database.types.ts`
- Crea: `packages/data-contract/src/management/features.ts`
- Modifica: `apps/management/package.json`
- Modifica: `scripts/check-workspace-boundaries.ts`
- Modifica: `package.json:7-31`
- Modifica: `.github/workflows/supabase-database-ci.yml`
- Modifica: `tests/unit/supabase-ci-workflow.test.ts`
- Crea: `tests/unit/management-features.test.ts`

- [ ] **Step 1: Scrivere i contratti pgTAP in errore**

Il test deve restare rosso finché:

- l'enum contiene esattamente `read_access`, `inventory_writes`, `purchasing_writes`, `fulfillment_writes`, `pricing_writes`, `marketing_writes`, `external_effects`;
- ogni organizzazione attiva ha ogni flag inizialmente `false`;
- i membri attivi elencano solo i flag delle proprie organizzazioni;
- anonimi, inattivi e non-membri non leggono righe;
- insert/update/delete diretti sono negati ad `anon` e `authenticated`;
- solo owner AAL2 può cambiare `read_access`;
- owner AAL1, admin AAL2, owner dell'organizzazione errata e membership stale sono negati;
- ogni tentativo di attivare/disattivare `inventory_writes`, `purchasing_writes`, `fulfillment_writes`, `pricing_writes`, `marketing_writes` o `external_effects` tramite entrypoint esposto è impossibile e coperto da un test negativo distinto;
- l'helper private passa solo col flag abilitato, altrimenti genera `GD_MANAGEMENT_FEATURE_DISABLED`;
- il setter `read_access` scrive audit organizzazione e usa optimistic concurrency;
- funzioni con search path vuoto non concedono `EXECUTE` a `PUBLIC`.

```bash
corepack enable
corepack prepare pnpm@10.34.6 --activate
pnpm --version
pnpm install --frozen-lockfile
pnpm db:reset
pnpm db:test
```

Atteso: FAIL perché migrazione, schema `management_api` e test 049 non esistono.

- [ ] **Step 2: Creare tabella pubblica, helper privati e schema esposto minimo**

```sql
create type public.management_feature as enum (
  'read_access',
  'inventory_writes',
  'purchasing_writes',
  'fulfillment_writes',
  'pricing_writes',
  'marketing_writes',
  'external_effects'
);

create table public.organization_management_features (
  organization_id bigint not null references public.organizations(id) on delete restrict,
  feature public.management_feature not null,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (organization_id, feature)
);
```

Registrare la tabella come tier A e inserire il prodotto cartesiano organizzazioni×enum con `enabled=false` e `on conflict do nothing`.

Contratti private:

```sql
private.require_aal2(p_message text) returns void
private.management_feature_enabled(p_organization_id bigint, p_feature public.management_feature) returns boolean
private.require_management_feature(p_organization_id bigint, p_feature public.management_feature) returns void
```

Entrypoint sottili, e solo questi, nello schema esposto:

```sql
management_api.list_management_features(p_organization_id bigint)
  returns table(feature public.management_feature, enabled boolean, updated_at timestamptz)

management_api.set_management_read_access(
  p_organization_id bigint,
  p_enabled boolean,
  p_expected_updated_at timestamptz,
  p_reason text
) returns public.organization_management_features
```

La list richiede membership attiva. Il setter richiede owner, AAL2, motivo 3–500 caratteri e concorrenza ottimistica; rifiuta ogni feature diversa per costruzione perché non accetta `p_feature`. Non creare `public.set_management_feature` né un setter generico. I piani modulo futuri aggiungeranno entrypoint specifici per i propri flag.

Revocare `CREATE` e privilegi impliciti su `management_api`, concedere soltanto `USAGE` e `EXECUTE` sulle funzioni nominate a `authenticated`, revocando `EXECUTE` a `PUBLIC`, `anon` e ruoli non necessari. Aggiornare la sezione `[api]` di `supabase/config.toml` senza esporre `private`:

```toml
schemas = ["public", "graphql_public", "management_api"]
```

- [ ] **Step 3: Estendere il package dati neutrale con l'adapter fail-closed**

Estendere `@geardrop/data-contract`, creato nel Task 3, con l'adapter feature. Può dipendere da `@supabase/supabase-js`, ma non da Next, dalle app o da componenti UI. Pubblica tipi database generati e adapter/query senza conoscenza di route; restano vietati deep import e accessi diretti alla root.

```ts
export type ManagementFeature = Database["public"]["Enums"]["management_feature"];
export type ManagementFeatures = Readonly<Record<ManagementFeature, boolean>>;

export async function loadManagementFeatures(
  client: SupabaseClient<Database>,
  organizationId: number,
): Promise<ManagementFeatures>;

export function requireManagementFeature(
  features: ManagementFeatures,
  feature: ManagementFeature,
): void;
```

L'implementazione vive in `packages/data-contract/src/management/features.ts` e invoca esclusivamente `client.schema("management_api").rpc("list_management_features", { p_organization_id: organizationId })`; l'azione control-plane usa `client.schema("management_api").rpc("set_management_read_access", { p_organization_id, p_enabled, p_expected_updated_at, p_reason })`. Errore RPC, duplicato, riga assente o enum sconosciuto genera `ManagementFeatureUnavailableError` e non sostituisce mai `true`.

- [ ] **Step 4: Allineare generazione tipi e CI**

Aggiornare lo script `db:types`, il test di contratto workflow e la CI affinché falliscano sul drift di entrambi gli schema:

```json
"db:types": "supabase gen types typescript --local --schema public,management_api > packages/data-contract/src/database.types.ts"
```

`packages/data-contract/src/database.types.ts` resta la fonte generata canonica e `src/lib/supabase/database.types.ts` il re-export di compatibilità già introdotto. Le firme generate devono includere le due funzioni `management_api` e nessun setter generico pubblico. Il typecheck di `@geardrop/data-contract` resta in entrambe le pipeline, così un errore condiviso fallisce entrambe le app.

Confermare gli script introdotti nel Task 3:

```json
"typecheck:storefront": "pnpm --filter @geardrop/runtime-contract --filter @geardrop/data-contract typecheck && next typegen && tsc --noEmit",
"build:storefront": "pnpm --filter @geardrop/runtime-contract --filter @geardrop/data-contract typecheck && next build"
```

In `apps/management/package.json`, `build` e `typecheck` continuano a filtrare entrambi `@geardrop/runtime-contract` e `@geardrop/data-contract` prima del comando Next/TypeScript locale; gli script root `build:management` e `typecheck:management` restano semplici deleghe alla directory `apps/management`.

```bash
pnpm db:reset
pnpm db:test
pnpm db:test:upgrades
pnpm db:lint
pnpm db:types
pnpm exec vitest run tests/unit/management-features.test.ts tests/unit/scoped-queries-contract.test.ts tests/unit/supabase-ci-workflow.test.ts tests/unit/workspace-import-boundary.test.ts
pnpm check:workspace-boundaries
pnpm typecheck:storefront
pnpm typecheck:management
git diff --exit-code --check
```

Atteso: PASS; l'upgrade popolato conserva i dati esistenti e aggiunge flag disabilitati per entrambe le organizzazioni.

- [ ] **Step 5: Committare flag e API**

```bash
git add supabase/migrations/20261006210000_add_management_feature_flags.sql supabase/tests/049_management_feature_flags.test.sql supabase/tests/044_organization_tier_registry.test.sql supabase/tests/upgrades/organizations_after.sql.in supabase/config.toml packages/data-contract apps/management/package.json scripts/check-workspace-boundaries.ts src/lib/supabase/database.types.ts tests/unit/management-features.test.ts tests/unit/scoped-queries-contract.test.ts package.json pnpm-lock.yaml .github/workflows/supabase-database-ci.yml tests/unit/supabase-ci-workflow.test.ts
git commit -m "feat: add organization management feature gates"
```

---

### Task 5: Costruire autenticazione gestionale e MFA owner obbligatoria

**File:**

- Modifica: `supabase/config.toml:296-309`
- Crea: `packages/data-contract/src/auth/staff-principal.ts`
- Modifica: `packages/data-contract/src/index.ts`
- Modifica: `src/lib/auth/guards.ts`
- Crea: `apps/management/src/lib/management/access.ts`
- Crea: `apps/management/src/lib/management/auth-redirect.ts`
- Crea: `tests/unit/management-access.test.ts`
- Crea: `tests/unit/management-auth-redirect.test.ts`
- Modifica: `apps/management/src/app/layout.tsx`
- Crea: `apps/management/src/app/login/page.tsx`
- Crea: `apps/management/src/app/login/actions.ts`
- Crea: `apps/management/src/components/login-form.tsx`
- Crea: `apps/management/src/app/logout/route.ts`
- Crea: `apps/management/src/app/mfa/enroll/page.tsx`
- Crea: `apps/management/src/app/mfa/challenge/page.tsx`
- Crea: `apps/management/src/components/mfa-enrollment.tsx`
- Crea: `apps/management/src/components/mfa-challenge.tsx`
- Crea: `apps/management/src/app/(protected)/layout.tsx`
- Crea: `apps/management/src/app/(protected)/account/page.tsx`
- Crea: `apps/management/src/app/auth/callback/route.ts`
- Modifica: `src/app/admin/actions/team.ts:1-16`

- [ ] **Step 1: Specificare la macchina a stati di accesso**

```ts
export type AssuranceLevel = "aal1" | "aal2" | null;
export type MfaDestination = "/mfa/enroll" | "/mfa/challenge" | null;

export function managementMfaDestination(
  role: StaffRole,
  currentLevel: AssuranceLevel,
  nextLevel: AssuranceLevel,
): MfaDestination;

export async function requireManagementPrincipal(
  client: SupabaseClient<Database>,
): Promise<StaffPrincipal>;
```

Casi obbligatori: owner `aal1 → aal1` verso enrollment; owner `aal1 → aal2` verso challenge; owner AAL2 prosegue; admin/editor senza fattore possono proseguire; admin/editor con fattore verificato devono fare challenge; claim mancanti, staff/membership inattivi, nessuna organizzazione, AAL sconosciuto o errore MFA negano l'accesso; cookie forgiato non amplia ruolo o membership.

```bash
pnpm exec vitest run tests/unit/management-access.test.ts tests/unit/management-auth-redirect.test.ts
```

Atteso: FAIL perché il layer management non esiste.

- [ ] **Step 2: Implementare accesso server-side e redirect sicuri**

Estrarre la risoluzione neutrale di staff, membership e ruolo in `packages/data-contract/src/auth/staff-principal.ts`; il guard root mantiene un adapter/re-export compatibile per il legacy admin. Nell'app management ottenere il client esclusivamente da `createManagementServerClient()` del Task 3 e comporre quel contratto con `auth.mfa.getAuthenticatorAssuranceLevel()`. Non importare `src/lib/auth/guards.ts` o helper Supabase root dalla seconda app e non fidarsi mai di ruolo/fattore forniti da form, cookie, metadata utente o client component.

`managementStaffRedirectUrl(path)` usa `MANAGEMENT_ORIGIN` HTTPS in remoto, accetta l'origine loopback corrente solo in locale/test, permette solo path assoluti della stessa app e fallisce in chiusura senza origin in produzione. `apps/management/src/app/auth/callback/route.ts` gestisce inviti/recovery staff; il callback root resta proprietario dei clienti e conserva `/account` sullo storefront.

- [ ] **Step 3: Implementare login e logout indipendenti**

Il login autentica con password attraverso l'helper server management, verifica staff e membership attivi, registra l'accesso, valuta la destinazione MFA e reindirizza solo a route gestionali pulite. I componenti MFA usano `createManagementBrowserClient()`; non istanziano client paralleli. Credenziali errate, staff inattivo o membership assente producono lo stesso messaggio generico. Nessun link di registrazione. Il layout `(protected)` richiama il guard server-side e applica enrollment/challenge prima di rendere qualunque figlio. Logout esegue sign-out, pulisce la cache PWA nominata e torna a `/login`.

- [ ] **Step 4: Implementare enrollment e challenge TOTP**

Abilitare TOTP locale in `supabase/config.toml`. I componenti client usano solo:

```ts
client.auth.mfa.enroll({ factorType: "totp", friendlyName })
client.auth.mfa.challengeAndVerify({ factorId, code })
client.auth.mfa.listFactors()
```

QR e secret restano solo in memoria componente; il codice a sei cifre non rivela l'esistenza account; una verifica aggiorna la sessione e ricontrolla AAL; la challenge accetta solo fattori TOTP verificati dell'utente corrente; account consente un secondo fattore ma non la rimozione dell'ultimo fattore owner. Non promettere recovery code.

- [ ] **Step 5: Instradare gli inviti staff verso management**

Passare `redirectTo` esplicito per `/auth/callback?next=/mfa/enroll` nell'azione invito owner. Conservare il comportamento email-link cliente. Documentare il recupero per fattore perso senza bypass self-service.

- [ ] **Step 6: Verificare auth e MFA**

```bash
pnpm exec vitest run tests/unit/management-access.test.ts tests/unit/management-auth-redirect.test.ts tests/unit/customer-auth.test.ts tests/unit/site-url.test.ts
pnpm check:workspace-boundaries
pnpm typecheck:storefront
pnpm typecheck:management
```

Atteso: PASS; login e callback cliente sono invariati.

- [ ] **Step 7: Committare l'autenticazione**

```bash
git add supabase/config.toml packages/data-contract/src/auth/staff-principal.ts packages/data-contract/src/index.ts src/lib/auth/guards.ts apps/management/src/lib/management/access.ts apps/management/src/lib/management/auth-redirect.ts apps/management/src/app apps/management/src/components/login-form.tsx apps/management/src/components/mfa-enrollment.tsx apps/management/src/components/mfa-challenge.tsx src/app/admin/actions/team.ts tests/unit/management-access.test.ts tests/unit/management-auth-redirect.test.ts
git commit -m "feat: require secure management authentication"
```

---

### Task 6: Consegnare overview Gear Drop read-only e PWA sicura

**File:**

- Crea: `packages/data-contract/src/operations/dashboard.ts`
- Crea: `packages/data-contract/src/operations/warehouse.ts`
- Crea: `packages/data-contract/src/management/overview.ts`
- Modifica: `packages/data-contract/src/index.ts`
- Modifica: `src/lib/admin/dashboard.ts`
- Modifica: `src/lib/admin/warehouse-repository.ts`
- Crea: `tests/unit/management-overview.test.ts`
- Crea: `tests/unit/management-ui-boundary.test.ts`
- Elimina: `apps/management/src/app/page.tsx`
- Modifica: `apps/management/src/app/(protected)/layout.tsx`
- Crea: `apps/management/src/app/(protected)/page.tsx`
- Crea: `apps/management/src/app/(protected)/settings/security/page.tsx`
- Crea: `apps/management/src/app/actions/organization.ts`
- Crea: `apps/management/src/app/actions/features.ts`
- Crea: `apps/management/src/components/management-shell.tsx`
- Crea: `apps/management/src/components/organization-switcher.tsx`
- Crea: `apps/management/src/components/feature-controls.tsx`
- Crea: `apps/management/src/components/management-pwa.tsx`
- Crea: `apps/management/src/app/management.module.css`
- Crea: `apps/management/public/management.webmanifest`
- Crea: `apps/management/public/management-sw.js`
- Modifica: `apps/management/public/management-offline.html`
- Crea: `tests/unit/management-pwa.test.ts`

- [ ] **Step 1: Scrivere i contratti read-only**

I test provano che accesso e `read_access` precedono ogni query di business; un errore flag invoca zero loader; l'ID organizzazione viene da `StaffPrincipal`; l'output rispetta il ruolo; `apps/management` non importa la root e non contiene form/azioni operative né metodi mutanti; l'unica azione feature invoca `set_management_read_access`; le pagine dati sono dinamiche con `dynamic = "force-dynamic"` e `fetchCache = "force-no-store"`.

I test non devono sostenere che il JWT non possa invocare writer legacy: verificano esclusivamente la superficie management, coerentemente col caveat di sicurezza.

```bash
pnpm exec vitest run tests/unit/management-overview.test.ts tests/unit/management-ui-boundary.test.ts
```

Atteso: FAIL perché UI e loader neutrali non esistono.

- [ ] **Step 2: Estrarre i contratti read neutrali**

Spostare mapping/query da `src/lib/admin/dashboard.ts` a `packages/data-contract/src/operations/dashboard.ts` e repository/tipi riepilogo da `src/lib/admin/warehouse-repository.ts` a `packages/data-contract/src/operations/warehouse.ts`, mantenendo adapter/re-export compatibili nei moduli legacy. `packages/data-contract/src/management/overview.ts` orchestra i reader neutrali. Il gestionale importa soltanto `@geardrop/data-contract`; la formattazione monetaria resta un dettaglio della sua UI. Il package non importa Next, cookie, componenti o route di nessuna app.

```ts
export type ManagementOverview = Readonly<{
  dashboard: OperationsDashboard;
  warehouse: WarehouseSummary | null;
}>;

export async function loadManagementOverview(
  client: SupabaseClient<Database>,
  principal: StaffPrincipal,
): Promise<ManagementOverview>;
```

Ordine fisso: `management_api.list_management_features` → require `read_access` → query organizzazione corrente. Gli errori dati non diventano metriche a zero, ma uno stato sicuro non disponibile.

- [ ] **Step 3: Costruire una shell realmente indipendente**

Applicare la guida `frontend-design`; costruire shell, stili, navigazione, account, selettore organizzazione, card moduli disabilitati e overview propri. Mostrare organizzazione/ruolo, metriche prodotto-stock, aggregati ordini consentiti, valore magazzino, completezza profitto e movimenti recenti. Acquisti, fulfillment, forecast, pricing e marketing restano “non ancora abilitati”. Nessun quick link mutante.

- [ ] **Step 4: Aggiungere impostazioni control-plane sicure**

La pagina sicurezza mostra tutti i flag, ma soltanto un owner AAL2 può cambiare `read_access`, con timestamp atteso e motivo obbligatorio. Tutti i flag write/external restano visibili e bloccati sia in `read_only` sia in `active`: i piani futuri aggiungeranno setter dedicati. Il cambio organizzazione valida lo slug nelle membership del principal e imposta un cookie HTTP-only same-site.

- [ ] **Step 5: Aggiungere PWA dedicata**

```json
{
  "id": "/",
  "start_url": "/",
  "scope": "/",
  "display": "standalone"
}
```

Il service worker installa soltanto `management-offline.html` in una cache versionata. Non esegue `cache.put()` per pagine riuscite, RSC, Supabase/API o dati autenticati. Logout pulisce la cache management; activation rimuove solo versioni management precedenti.

- [ ] **Step 6: Verificare management e regressioni legacy**

```bash
pnpm exec vitest run tests/unit/management-overview.test.ts tests/unit/management-ui-boundary.test.ts tests/unit/management-pwa.test.ts tests/unit/admin-dashboard.test.ts tests/unit/admin-shell-contract.test.ts tests/unit/warehouse.test.ts
pnpm check:workspace-boundaries
pnpm typecheck:storefront
pnpm typecheck:management
pnpm build:storefront
pnpm build:management
pnpm verify:management-manifest
```

Atteso: PASS; build storefront e legacy admin restano verdi.

- [ ] **Step 7: Committare la slice read-only**

```bash
git add packages/data-contract/src/operations packages/data-contract/src/management/overview.ts packages/data-contract/src/index.ts src/lib/admin/dashboard.ts src/lib/admin/warehouse-repository.ts apps/management/src/app apps/management/src/components apps/management/public/management.webmanifest apps/management/public/management-sw.js apps/management/public/management-offline.html tests/unit/management-overview.test.ts tests/unit/management-ui-boundary.test.ts tests/unit/management-pwa.test.ts
git commit -m "feat: add independent read-only management app"
```

---

### Task 7: Rendere il rehearsal realmente read-only, separato e cifrato

**File:**

- Modifica: `scripts/rehearse-production-upgrade.ts:1-293`
- Crea: `scripts/prepare-local-rehearsal-source.ts`
- Crea: `scripts/lib/encrypted-backup.ts`
- Crea: `tests/unit/encrypted-backup.test.ts`
- Modifica: `tests/unit/rehearse-production-upgrade.test.ts:1-94`
- Crea: `tests/unit/prepare-local-rehearsal-source.test.ts`
- Modifica: `package.json:7-31`
- Modifica: `.gitignore`
- Crea: `docs/operations/production-read-only-role.sql`
- Crea: `docs/operations/management-backup.md`

- [ ] **Step 1: Scrivere test failure-first per cifratura, identità e privilegi**

Copertura obbligatoria:

- round trip AES-256-GCM+scrypt, salt/IV casuali, passphrase errata, tamper e manifest SHA-256;
- secret mai presenti in errori o stringhe log-safe;
- rifiuto di superuser, owner DB, `postgres`, CREATE/TEMP, scritture su schema/tabelle/sequenze o risultato probe ignoto;
- rifiuto del ruolo se `default_transaction_read_only` non è `on`;
- rifiuto di privilegi effettivi `EXECUTE`, diretti, ereditati o via `PUBLIC`, su funzioni non-system, `security definer` o `volatile`;
- ogni query sorgente racchiusa in una transazione esplicitamente read-only;
- inventario tabelle derivato dal catalogo, non statico;
- invarianti organizzazione/IVA/owner bloccanti;
- collisione source/copy rilevata dall'identità `(system_identifier,database_oid)`, non dal solo host;
- dump e restore eseguiti anche quando non esistono migrazioni pendenti.

```bash
pnpm exec vitest run tests/unit/encrypted-backup.test.ts tests/unit/rehearse-production-upgrade.test.ts tests/unit/prepare-local-rehearsal-source.test.ts
```

Atteso: FAIL sul rehearsal corrente, in chiaro e con sorgente scrivibile.

- [ ] **Step 2: Implementare artifact cifrati in streaming**

```ts
export function createEncryptStream(passphrase: string): Transform;
export function createDecryptStream(passphrase: string): Transform;
export async function sha256File(path: string): Promise<string>;
export async function verifyEncryptedArtifact(path: string, manifestPath: string, passphrase: string): Promise<void>;
```

Lo stdout del dump fluisce direttamente in `.sql.enc`; nessun dump in chiaro viene conservato. Il restore è a due passaggi: prima autentica per intero tag GCM e checksum scartando il plaintext, poi riapre lo stesso artifact già verificato e lo decifra nello stdin di `psql --single-transaction`. Nessun byte non ancora autenticato raggiunge PostgreSQL. Il manifest include hash ciphertext, data, identità sorgente redatta, tipo artifact e scadenza, mai credenziali.

- [ ] **Step 3: Preparare una sorgente locale distinta con ruolo read-only**

`scripts/prepare-local-rehearsal-source.ts` crea/ripristina esplicitamente il database locale `geardrop_rehearsal_source`, separato dal target/copy `postgres`, applica schema e fixture sintetiche, crea il ruolo minimo di lettura, imposta `default_transaction_read_only=on`, revoca `CREATE`, `TEMP`, scritture e `EXECUTE` effettivo sulle funzioni vietate, inclusi grant ereditati tramite `PUBLIC`, poi stampa soltanto URL redatti e identity hash.

Aggiungere:

```json
"rehearsal:prepare-source": "tsx scripts/prepare-local-rehearsal-source.ts"
```

Il comando rifiuta host non-loopback e non modifica la produzione. Per il drill locale, `REHEARSAL_SOURCE_DB_URL` deve puntare a `geardrop_rehearsal_source` e `REHEARSAL_COPY_DB_URL` al database locale `postgres`; per il rehearsal remoto, la sorgente arriva esclusivamente da `PROD_READ_ONLY_DB_URL` e la copy da `REHEARSAL_COPY_DB_URL`. Il runner accetta esattamente una variabile sorgente e richiede sempre URL source/copy e identità `(system_identifier,database_oid)` diverse.

- [ ] **Step 4: Verificare il ruolo sorgente a ogni esecuzione**

Rinominare l'input remoto in `PROD_READ_ONLY_DB_URL` e richiedere `REHEARSAL_BACKUP_PASSPHRASE`. Prima del dump, controllare utente, ownership, attributi ruolo, `default_transaction_read_only`, privilegi database/schema/table/sequence e `has_function_privilege` effettivo sulle funzioni non-system, `security definer` o `volatile`. Qualunque incertezza blocca. Ogni probe e query dati usa `BEGIN TRANSACTION READ ONLY` e rollback/commit esplicito.

Il documento SQL crea il ruolo minimo che un operatore applica separatamente e revoca i grant diretti al reader. Non modifica alla cieca i grant globali `PUBLIC`: se un privilegio effettivo proibito continua a essere ereditato, il preflight si ferma e richiede una migrazione di hardening separata, revisionata e coperta da regressione sul sito. Il rehearsal non applica automaticamente né quel documento né modifiche ai grant di produzione.

- [ ] **Step 5: Rendere backup, restore e riconciliazione sempre obbligatori**

Scoprire le tabelle base `public` pre-upgrade e contare esattamente quell'insieme prima/dopo. Eseguire sempre dump cifrato, verifica, restore sulla copy e riconciliazione, anche con zero migration pendenti. Fallire su righe perse/extra, organizzazione Gear Drop mancante/duplicata, scope orfano, owner attivo mancante, ordine senza snapshot IVA, divergenza migrazioni o restore fallito.

- [ ] **Step 6: Eseguire il drill locale documentato**

```bash
pnpm db:reset
pnpm rehearsal:prepare-source
# Impostare REHEARSAL_SOURCE_DB_URL, REHEARSAL_COPY_DB_URL e REHEARSAL_BACKUP_PASSPHRASE senza stamparli.
pnpm beta:rehearse
pnpm exec vitest run tests/unit/encrypted-backup.test.ts tests/unit/rehearse-production-upgrade.test.ts tests/unit/prepare-local-rehearsal-source.test.ts
```

Atteso: source `geardrop_rehearsal_source` e copy `postgres` hanno identità diverse; dump/restore avvengono anche senza delta migrazioni; artifact verificato; nessun `.sql` in chiaro.

- [ ] **Step 7: Committare l'hardening rehearsal**

```bash
git add scripts/rehearse-production-upgrade.ts scripts/prepare-local-rehearsal-source.ts scripts/lib/encrypted-backup.ts tests/unit/encrypted-backup.test.ts tests/unit/rehearse-production-upgrade.test.ts tests/unit/prepare-local-rehearsal-source.test.ts package.json .gitignore docs/operations/production-read-only-role.sql docs/operations/management-backup.md
git commit -m "feat: secure production upgrade rehearsal"
```

---

### Task 8: Produrre una copia staging sanificata e verificata

**File:**

- Crea: `supabase/staging/sanitize-copy.sql`
- Crea: `supabase/staging/verify-sanitized-copy.sql`
- Crea: `scripts/prepare-staging-copy.ts`
- Crea: `tests/unit/staging-copy.test.ts`
- Modifica: `package.json:7-31`
- Modifica: `.env.example`
- Crea: `docs/operations/management-staging-data.md`

- [ ] **Step 1: Scrivere i contratti privacy e sicurezza**

Testare: target soltanto loopback; identità source/target diverse; marker stack locale obbligatorio; export impossibile prima della verifica; URL/password redatti; copertura esplicita di clienti, ordini, coupon, staff, membership, fornitori, audit, provider e auth; canary sensibili assenti dopo sanificazione; totali finanziari, quantità, stati, timestamp, SKU e organization ID invariati.

```bash
pnpm exec vitest run tests/unit/staging-copy.test.ts
```

Atteso: FAIL perché sanitizer/verifier non esistono.

- [ ] **Step 2: Implementare sanitizer locale transazionale**

In una sola transazione sulla copia locale verificata: disabilitare `site_settings.accept_orders`; forzare write/external flag a false; sostituire email/telefono/indirizzo/note e ID Stripe; scollegare clienti e rimuovere profili/indirizzi; pulire contatti fiscali/note fornitori; neutralizzare audit; azzerare riferimenti auth opzionali e poi eliminare identità, utenti, profili staff e membership in ordine FK-safe; rimuovere token provider; inserire marker `staging_sanitized_at` con versione/hashing del sanitizer.

Non creare staff sintetico nell'artifact: le identità staging vengono create dopo l'import contro il ref staging verificato.

- [ ] **Step 3: Aggiungere verifier indipendente ed export fail-closed**

`verify-sanitized-copy.sql` termina non-zero se restano identità produzione, PII, note libere, ID Stripe, contatti fiscali/fornitore, payload audit, `accept_orders=true` o flag write/external attivo. Il runner esegue sanitizer, verifier e solo dopo esporta con la busta cifrata del Task 7.

- [ ] **Step 4: Provare con canary deterministici**

```bash
pnpm db:reset
pnpm exec vitest run tests/unit/staging-copy.test.ts
pnpm staging:prepare -- --copy-url postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

Atteso: PASS, zero finding sensibili/outbound e aggregati business invariati.

- [ ] **Step 5: Documentare import e cancellazione controllati**

Il runbook specifica operatore, trasporto cifrato, verifica ref target, bootstrap utenti sintetici post-import, TOTP forzato, blocco email/SMS/webhook/provider, scadenza e cancellazione di copia locale e artifact.

- [ ] **Step 6: Committare i controlli staging**

```bash
git add supabase/staging scripts/prepare-staging-copy.ts tests/unit/staging-copy.test.ts package.json .env.example docs/operations/management-staging-data.md
git commit -m "feat: add verified staging data sanitization"
```

---

### Task 9: Aggiungere E2E management, doppia build CI e runbook

**File:**

- Crea: `playwright.management.config.ts`
- Crea: `tests/e2e/management/global-setup.ts`
- Crea: `tests/e2e/management/support.ts`
- Crea: `tests/e2e/management/auth-mfa.spec.ts`
- Crea: `tests/e2e/management/route-boundary.spec.ts`
- Crea: `tests/e2e/management/organization-readonly.spec.ts`
- Crea: `tests/e2e/management/pwa.spec.ts`
- Modifica: `scripts/verify-management-build-manifest.ts`
- Modifica: `scripts/verify-build-manifest-isolation.ts`
- Modifica: `.github/workflows/supabase-database-ci.yml`
- Modifica: `tests/unit/supabase-ci-workflow.test.ts`
- Modifica: `package.json:7-31`
- Crea: `docs/operations/management-cloud-environment.md`
- Crea: `docs/operations/management-cloud-rollout.md`
- Crea: `docs/operations/management-cloud-smoke-test.md`
- Modifica: `docs/operations/gestionale-online.md`
- Modifica: `docs/operations/geardrop-beta.md`

- [ ] **Step 1: Estendere prima il contratto CI**

Il test workflow estende il contratto introdotto nel Task 3 e deve provare:

- restano invariati Corepack con `pnpm@10.34.6`, asserzione esatta della versione, install `--frozen-lockfile`, drift contro `packages/data-contract/src/database.types.ts` e `pnpm lint` aggregato; nessun job reintroduce pnpm 11, tipi root canonici o lint parziali/duplicati;
- E2E management contro Supabase locale, `NEXT_PUBLIC_APP_SURFACE=management`, ref `local`, `MANAGEMENT_MODE=read_only`;
- nessun `SUPABASE_SECRET_KEY`, secret Stripe/Resend/AI nel web server;
- credenziale admin locale soltanto al global setup, che rifiuta non-loopback;
- suite seriale su porta dedicata;
- il web server Playwright management parte con `pnpm dev:management` e non con il server root;
- build storefront e management in production mode tramite `build:storefront` e `build:management`, con working directory/output distinti e ambienti espliciti;
- build management con `NEXT_PUBLIC_SUPABASE_URL=https://ci-management.supabase.co`, `NEXT_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF=ci-management`, `MANAGEMENT_ORIGIN=https://management-ci.invalid` e `STOREFRONT_ORIGIN=https://storefront-ci.invalid`, senza eccezioni loopback;
- pagine dinamiche gestionali che non interrogano il DB durante la build;
- boundary checker, manifest reale management, confronto dei due manifest e prova bidirezionale `verify:build-independence` sono gate CI obbligatori;
- un job build storefront e un job build management invocano soltanto il proprio comando; gli errori sentinella dimostrano che i sorgenti esclusivi non attraversano il confine;
- workflow senza credenziali Supabase remote né comandi link/push.

```bash
pnpm exec vitest run tests/unit/supabase-ci-workflow.test.ts
```

Atteso: FAIL finché config e workflow non applicano entrambi i gate.

- [ ] **Step 2: Creare fixture business e identità deterministiche**

Dopo `db reset --no-seed`, il global setup crea soltanto su loopback: organizzazioni Gear Drop/Oryvenne, righe flag complete, prodotto/SKU, ordine con snapshot IVA, movimento magazzino, costi e identità owner/admin/editor cross-organizzazione. Le fixture sono scope-identificate, ripetibili e rimosse nel teardown senza toccare righe altrui. Implementare helper RFC 6238 con `node:crypto`; non registrare i secret TOTP.

- [ ] **Step 3: Coprire i percorsi di accettazione**

Gli E2E provano: assenza signup; customer/inattivo escluso; enrollment e challenge owner; challenge per staff con fattore; cookie organizzazione forgiato innocuo; ruolo diverso per organizzazione; `read_access` assente/disabilitato senza query/valori; Gear Drop con aggregati seed e Oryvenne vuota/disabilitata; nessun controllo operativo; POST legacy/business/API/webhook 404; niente route shop/admin sul gestionale; PWA senza dati in Cache Storage; auth cliente e webhook storefront invariati.

- [ ] **Step 4: Collegare script mancanti e doppia build**

```json
"test:e2e:storefront": "playwright test --config playwright.storefront.config.ts",
"test:e2e:management": "playwright test --config playwright.management.config.ts"
```

`playwright.management.config.ts` usa `pnpm dev:management`, base URL/porta dedicate e non carica config root. Eseguire il browser gate management dopo reset vuoto e setup fixture. Costruire una volta storefront e una volta management con i valori remoti fittizi concordanti sopra; nessun override loopback in `NODE_ENV=production`. Dopo entrambe le build eseguire `verify:management-manifest` e `verify:manifest-isolation`.

- [ ] **Step 5: Sostituire la guida di deployment obsoleta**

I runbook separano variabili per storefront, client/server management, workstation rehearsal e CI; dichiarano un unico progetto Supabase produttivo e nessuna sincronizzazione DB. Vercel storefront usa la root del repository e `pnpm build:storefront`; Vercel management usa `apps/management` come Root Directory e lo script locale `pnpm build`. La CI dalla root usa `pnpm build:management`; nessun progetto può usare il comando dell'altra app.

Poiché `apps/management` importa `packages/runtime-contract` e `packages/data-contract` esterni alla propria Root Directory, il runbook richiede di abilitare nel progetto Vercel management **Include source files outside of the Root Directory** e di conservarne evidenza nello smoke test. Senza questa opzione il deploy deve fermarsi, non copiare i package dentro l'app. La procedura segue la [FAQ ufficiale Vercel per monorepo](https://vercel.com/docs/monorepos/monorepo-faq) e fissa `pnpm@10.34.6` in accordo con la [documentazione Vercel sui package manager](https://vercel.com/docs/package-managers).

Il rollout comprende staging sanificato, owner sintetici, MFA, rehearsal/backup, migrazione additiva con flag false, esposizione remota del solo schema `management_api` nelle impostazioni Data API (verificando che `private` resti escluso), deploy separato, smoke test, attivazione esplicita di `read_access` e riconciliazione.

Il runbook impone `LEGACY_ADMIN_MODE=enabled` per tutta questa fase e descrive `redirect` soltanto come gate futuro, dopo parità dei moduli e un piano dedicato. Il rollback disabilita `read_access` e ferma il deployment gestionale senza toccare `/admin` o il commercio storefront.

- [ ] **Step 6: Eseguire il contratto CI/E2E**

```bash
corepack enable
corepack prepare pnpm@10.34.6 --activate
pnpm --version
pnpm install --frozen-lockfile
pnpm exec vitest run tests/unit/supabase-ci-workflow.test.ts
pnpm check:workspace-boundaries
pnpm lint
pnpm verify:build-independence
pnpm test:e2e:management
pnpm test:e2e:admin
pnpm test:e2e:storefront
pnpm build:storefront
pnpm build:management
pnpm verify:management-manifest
pnpm verify:manifest-isolation
```

Atteso: PASS sullo stack Docker locale e fixture pulite al termine.

- [ ] **Step 7: Committare CI e runbook**

```bash
git add playwright.management.config.ts tests/e2e/management scripts/verify-management-build-manifest.ts scripts/verify-build-manifest-isolation.ts .github/workflows/supabase-database-ci.yml tests/unit/supabase-ci-workflow.test.ts package.json docs/operations/management-cloud-environment.md docs/operations/management-cloud-rollout.md docs/operations/management-cloud-smoke-test.md docs/operations/gestionale-online.md docs/operations/geardrop-beta.md
git commit -m "test: gate independent management deployment"
```

---

### Task 10: Verifica finale, review e stop gate di rollout

**File:**

- Verifica: tutti i file modificati nei Task 1–9
- Aggiorna se cambiano le evidenze: `docs/operations/management-cloud-rollout.md`
- Crea solo localmente, non committare: `artifacts/management-foundation-verification/`

- [ ] **Step 1: Eseguire il gate database completo da stato pulito**

```bash
corepack enable
corepack prepare pnpm@10.34.6 --activate
pnpm --version
pnpm install --frozen-lockfile
pnpm db:reset
pnpm db:test
pnpm db:test:upgrades
pnpm db:lint
pnpm db:types
git diff --exit-code -- packages/data-contract/src/database.types.ts src/lib/supabase/database.types.ts
```

Atteso: `pnpm --version` restituisce `10.34.6`; install frozen, pgTAP incluso 049, upgrade, lint e type drift sono tutti verdi per `public,management_api`.

- [ ] **Step 2: Eseguire il gate applicativo completo**

```bash
pnpm test
pnpm check:workspace-boundaries
pnpm lint
pnpm typecheck:storefront
pnpm typecheck:management
pnpm test:e2e:public
pnpm exec playwright test --config playwright.supabase-public.config.ts
pnpm test:e2e:admin
pnpm test:e2e:storefront
pnpm test:e2e:management
pnpm build:storefront
pnpm build:management
pnpm verify:management-manifest
pnpm verify:manifest-isolation
pnpm verify:build-independence
```

`pnpm lint` deve espandersi esattamente in `lint:storefront`, `lint:shared` e `lint:management`, senza sovrapposizioni: il gate finale copre quindi anche `packages/runtime-contract` e `packages/data-contract`. La build management usa il profilo production-mode documentato con URL/ref remoti fittizi concordanti e origin `.invalid`; la build storefront usa il proprio profilo e mantiene `LEGACY_ADMIN_MODE=enabled`. Atteso: nessun failure ignorato, pass dipendente da retry o secret in output. I due manifest provengono da output distinti, il manifest management rispetta l'allowlist e la prova sentinella passa in entrambe le direzioni.

- [ ] **Step 3: Ripetere i controlli negativi sicurezza/privacy**

Ripetere i cinque Focus della revisione e i negativi dei sei flag non attivabili. Conservare soltanto riepiloghi redatti e hash.

```bash
rg -n "(service_role|SUPABASE_SECRET_KEY|STRIPE_SECRET_KEY|REHEARSAL_BACKUP_PASSPHRASE|postgresql://[^:]+:[^*])" src apps packages public docs tests scripts .github
git diff --check
git status --short
```

Atteso: soltanto nomi variabile/riferimenti documentali intenzionali; nessuna credenziale, fixture sensibile, errore whitespace o file inspiegato.

- [ ] **Step 4: Richiedere code review fresca**

Usare `superpowers:requesting-code-review` con specifica e piano. Il reviewer verifica copertura, Focus, RLS/AAL2, `management_api`, confine runtime e fisico, package neutrali, manifest isolati, privacy staging e assenza di mutazioni nella superficie prodotto. Correggere i finding e ripetere gate focalizzati e completi.

- [ ] **Step 5: Passare le evidenze al sub-agente `editor`**

Prima di qualsiasi consegna all'utente, delegare all'`editor` il gate finale su matrice comandi, evidenze redatte, caveat JWT legacy, runbook e linguaggio delle promesse. Un FAIL dell'editor blocca la consegna; correggere i finding e ripetere i gate coinvolti fino a PASS. Questo controllo è aggiuntivo alla code review tecnica, non la sostituisce.

- [ ] **Step 6: Fermarsi prima delle operazioni remote e presentare evidenze**

Non creare ruolo produzione, applicare migrazioni remote, modificare gli schema esposti della Data API, importare staging, distribuire Vercel, modificare DNS o attivare `read_access`. Presentare matrice verde, diff migrazione e conteggio pgTAP, prova target/route fence, manifest delle due app, prova sentinella bidirezionale, hash drill backup/restore, report sanitizer, rischi residui e input operatore. Specificare che `/admin` rimane abilitato.

- [ ] **Step 7: Eseguire il gate staging remoto solo dopo approvazione esplicita**

Seguire il runbook: ruolo produzione read-only autorizzato, backup cifrato verificato, restore locale, sanificazione, verifica, import sul ref staging confermato, esposizione del solo `management_api`, owner sintetici, deploy staging dall'app `apps/management` e smoke/E2E. Prima della build remota verificare dalle impostazioni/evidenze Vercel che **Include source files outside of the Root Directory** sia attivo e che i log usino pnpm 10.34.6 risolvendo entrambi i package workspace esterni. Verificare nuovamente il manifest dell'artifact distribuito; ogni mismatch ferma il rollout.

- [ ] **Step 8: Fermarsi di nuovo prima dell'attivazione produzione**

Dopo nuova approvazione: backup fresco, migrazione additiva con flag false, configurazione Data API con `management_api` esposto e `private` escluso, conferma dell'opzione Vercel **Include source files outside of the Root Directory**, deploy management con Root Directory `apps/management` e pnpm 10.34.6 in `read_only`, verifica manifest artifact, smoke login/MFA/organizzazione/route fence, attivazione `read_access` owner+AAL2 e riconciliazione campione al 100%. `LEGACY_ADMIN_MODE` resta `enabled`; non eseguire il ramo `redirect`.

Se un controllo fallisce, disabilitare `read_access` e fermare il deployment gestionale. Lasciare commercio e `/admin` invariati; non eliminare migrazioni additive o audit.

- [ ] **Step 9: Committare solo gli ultimi aggiustamenti documentali**

```bash
git add docs/operations/management-cloud-rollout.md docs/operations/management-cloud-smoke-test.md
git commit -m "docs: record management foundation acceptance gates"
```

Non committare evidenze con identificativi ambiente, contenuti database, manifest backup o credenziali.

## Definizione di completamento

- Storefront, autenticazione cliente, checkout e webhook restano verdi.
- Lo storefront resta una app Next alla root; il gestionale è una seconda app Next in `apps/management`, con package, App Router, config, tsconfig, build output e deployment propri.
- Il monorepo dichiara `packageManager: pnpm@10.34.6`; install locali, CI e build Vercel verificano la stessa versione tramite Corepack e lockfile frozen.
- Il lint aggregato copre una sola volta root/storefront, `packages/runtime-contract`, `packages/data-contract` e `apps/management`; la CI non può saltare i package condivisi.
- Vercel management usa Root Directory `apps/management` con **Include source files outside of the Root Directory** abilitato e verificato, così i package workspace esterni fanno parte dell'artifact.
- La root rifiuta `NEXT_PUBLIC_APP_SURFACE=management` con `GD_ROOT_MANAGEMENT_BUILD_UNSUPPORTED` e non può più produrre un artifact che si dichiara gestionale.
- Un errore esclusivo storefront non fallisce `build:management` e un errore esclusivo management non fallisce `build:storefront`; un errore in un package condiviso può fallire entrambi.
- Il boundary checker risolve gli import e impedisce a `apps/management` di importare route, configurazione, API o componenti root; sono ammessi soltanto package workspace neutrali dichiarati.
- Il deployment management non serve storefront, `/admin` o route business API/webhook.
- Le clean routes sono file reali di `apps/management/src/app`; il target non contiene `MANAGEMENT_REWRITES`, `/gestionale` o import degli helper Supabase root.
- Client browser, server e proxy Supabase SSR sono posseduti dall'app management, validano l'ambiente prima dell'uso e propagano correttamente i cookie request/response.
- I manifest reali sono distinti: management contiene soltanto route allowlisted, mentre `/admin`, checkout e webhook appartengono esclusivamente all'artifact storefront.
- Il mismatch del target remoto fallisce prima di qualsiasi query dati.
- L'accesso richiede profilo e membership attivi; il ruolo è specifico dell'organizzazione.
- Owner e staff con fattore verificato non possono aggirare AAL2/challenge.
- I valori live Gear Drop compaiono soltanto dopo `read_access`; Oryvenne resta vuota e disabilitata.
- Il read-only garantito riguarda la superficie prodotto. Lo stesso JWT mantiene i permessi legacy documentati; l'accesso iniziale resta limitato ai soci/staff già fidati e l'hardening completo dei writer legacy resta obbligatorio in un piano successivo.
- La tabella flag è scoped, auditata, protetta da RLS e parte disabilitata. Solo `management_api.set_management_read_access` può cambiare `read_access`; nessun flag write/external ha un setter in questa fase.
- I nuovi RPC browser-facing usano `management_api`; `private` non è esposto e la migrazione degli RPC legacy resta rinviata.
- `LEGACY_ADMIN_MODE=enabled` rimane invariato in produzione; nessun redirect `/admin` viene attivato da questo piano.
- La PWA non memorizza dati aziendali o personali.
- La sorgente rehearsal è separata dalla copy, identificata da `(system_identifier,database_oid)`, usa transazioni read-only, `default_transaction_read_only=on` e nessun privilegio effettivo proibito.
- Backup sempre eseguito anche senza migrazioni pendenti, cifrato, autenticato, verificato, ripristinato e gestito per retention.
- L'artifact staging supera la verifica zero-PII/zero-outbound prima dell'export.
- Global setup E2E crea e pulisce fixture business deterministiche dopo reset no-seed.
- Unit, pgTAP, upgrade, lint/typecheck app-specifici, E2E storefront/admin/management, prova sentinella bidirezionale e doppia build production-mode passano.
- Code review e gate finale del sub-agente `editor` risultano PASS prima della consegna utente.
- I runbook documentano deploy, smoke test, rollback, perdita MFA, retention, caveat JWT condiviso e futura soglia per il redirect legacy.
