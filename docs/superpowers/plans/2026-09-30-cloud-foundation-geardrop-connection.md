# Fondazione cloud e collegamento sicuro a Gear Drop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Obiettivo:** Consegnare la prima versione utilizzabile del gestionale cloud indipendente: un deployment privato separato che autentica i soci e lo staff tramite Supabase, impone l'MFA ai proprietari, mostra i dati live di Gear Drop attraverso una superficie prodotto fail-closed e di sola lettura, permette il cambio organizzazione e può essere installato come PWA senza alterare la disponibilità dello storefront.

**Architettura:** Un solo repository e un solo progetto Supabase autorevole alimentano due superfici applicative selezionate esplicitamente. Lo storefront continua a possedere commercio e webhook Stripe; il deployment gestionale espone soltanto route e asset propri e importa contratti di dominio/query condivisi, non pagine `/admin`. Membership, RLS, RPC in `management_api`, controlli AAL2 e flag per organizzazione proteggono i nuovi accessi. Prima di qualsiasi migrazione additiva o deployment remoto, la produzione viene provata mediante credenziali sorgente dimostrabilmente read-only, backup cifrato e copia locale sanificata.

**Stack tecnico:** Next.js 16 App Router, React 19, TypeScript 5.9, Supabase Auth/Postgres/RLS/pgTAP, Vitest 4, Playwright 1.61, pnpm 11, Docker/Supabase CLI, GitHub Actions, Vercel.

**Specifica:** `docs/superpowers/specs/2026-09-30-gestionale-cloud-operativo-design.md`

## Ambito del piano

Questo piano realizza il sottoprogetto 1 della specifica approvata: **fondazione cloud e collegamento sicuro a Gear Drop**. Il risultato è un deployment gestionale separato che mostra dati Gear Drop riconciliati senza esporre operazioni di business in scrittura.

Incluso:

- baseline verde e riproducibile su Windows e CI;
- contratto esplicito di build/deployment per storefront e gestionale;
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

## Vincoli globali

- Solo migrazioni additive; nessun rollback distruttivo dei dati di produzione.
- Storefront e gestionale devono compilare, distribuire e fallire indipendentemente. Un outage Supabase resta una dipendenza condivisa nota.
- Il gestionale non deve servire pagine storefront, checkout, webhook Stripe, endpoint preview o handler legacy `/admin`.
- Pagine e componenti gestionali non importano `src/app/admin/**`, `src/components/admin/**` o configurazione admin. La logica dati condivisa vive in moduli neutrali `src/lib/operations/**`.
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
- Nessuna migrazione produzione, attivazione flag, modifica DNS o restore staging/produzione avviene senza lo stop gate corrispondente del Task 9. Il redirect del legacy admin resta fuori fase.
- Ogni task segue red-green-refactor: prima il test nominato in errore, poi l'implementazione minima completa, infine gate focalizzati e regressione prima del commit.

## Focus della revisione

La revisione finale deve provare esplicitamente queste cinque classi di errore:

1. **Target dati errato:** project ref remoto assente/non coincidente o loopback in build production fermano il gestionale prima di leggere dati.
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

### Task 2: Stabilire il confine indipendente di deployment e route

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
- gestionale solo con `NEXT_PUBLIC_APP_SURFACE=management`;
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

`readPublicSupabaseEnv()` invoca la validazione target per la superficie management. Non registra key, query dell'URL o secret. Le build mock storefront senza ambiente Supabase restano supportate.

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

`next.config.ts` pubblica le route pulite via rewrite e applica `X-Robots-Tag: noindex, nofollow` e `Cache-Control: private, no-store` alle route applicative gestionali.

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

- [ ] **Step 6: Committare il confine**

```bash
git add src/lib/app-mode.ts src/lib/management/routes.ts src/lib/supabase/env.ts src/lib/site-url.ts src/proxy.ts src/app/robots.ts next.config.ts .env.example tests/unit/app-mode.test.ts tests/unit/supabase-env.test.ts tests/unit/management-route-boundary.test.ts
git commit -m "feat: isolate management deployment surface"
```

---

### Task 3: Aggiungere feature flag fail-closed e API gestionale dedicata

**File:**

- Crea: `supabase/migrations/20260930110000_add_management_feature_flags.sql`
- Crea: `supabase/tests/049_management_feature_flags.test.sql`
- Modifica: `supabase/tests/044_organization_tier_registry.test.sql:15-31`
- Modifica: `supabase/tests/upgrades/organizations_after.sql.in`
- Modifica: `supabase/config.toml`
- Modifica: `src/lib/supabase/database.types.ts`
- Modifica: `package.json:7-31`
- Modifica: `.github/workflows/supabase-database-ci.yml`
- Modifica: `tests/unit/supabase-ci-workflow.test.ts`
- Crea: `src/lib/management/features.ts`
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

- [ ] **Step 3: Aggiungere adapter TypeScript fail-closed**

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

L'implementazione invoca esclusivamente `client.schema("management_api").rpc("list_management_features", { p_organization_id: organizationId })`; l'azione control-plane usa `client.schema("management_api").rpc("set_management_read_access", { p_organization_id, p_enabled, p_expected_updated_at, p_reason })`. Errore RPC, duplicato, riga assente o enum sconosciuto genera `ManagementFeatureUnavailableError` e non sostituisce mai `true`.

- [ ] **Step 4: Allineare generazione tipi e CI**

Aggiornare lo script `db:types`, il test di contratto workflow e la CI affinché falliscano sul drift di entrambi gli schema:

```json
"db:types": "supabase gen types typescript --local --schema public,management_api > src/lib/supabase/database.types.ts"
```

Le firme generate devono includere le due funzioni `management_api` e nessun setter generico pubblico.

```bash
pnpm db:reset
pnpm db:test
pnpm db:test:upgrades
pnpm db:lint
pnpm db:types
pnpm exec vitest run tests/unit/management-features.test.ts tests/unit/scoped-queries-contract.test.ts tests/unit/supabase-ci-workflow.test.ts
git diff --exit-code --check
```

Atteso: PASS; l'upgrade popolato conserva i dati esistenti e aggiunge flag disabilitati per entrambe le organizzazioni.

- [ ] **Step 5: Committare flag e API**

```bash
git add supabase/migrations/20260930110000_add_management_feature_flags.sql supabase/tests/049_management_feature_flags.test.sql supabase/tests/044_organization_tier_registry.test.sql supabase/tests/upgrades/organizations_after.sql.in supabase/config.toml src/lib/supabase/database.types.ts src/lib/management/features.ts tests/unit/management-features.test.ts package.json .github/workflows/supabase-database-ci.yml tests/unit/supabase-ci-workflow.test.ts
git commit -m "feat: add organization management feature gates"
```

---

### Task 4: Costruire autenticazione gestionale e MFA owner obbligatoria

**File:**

- Modifica: `supabase/config.toml:296-309`
- Crea: `src/lib/management/access.ts`
- Crea: `src/lib/management/auth-redirect.ts`
- Crea: `tests/unit/management-access.test.ts`
- Crea: `tests/unit/management-auth-redirect.test.ts`
- Crea: `src/app/gestionale/layout.tsx`
- Crea: `src/app/gestionale/login/page.tsx`
- Crea: `src/app/gestionale/login/actions.ts`
- Crea: `src/components/management/login-form.tsx`
- Crea: `src/app/gestionale/logout/route.ts`
- Crea: `src/app/gestionale/mfa/enroll/page.tsx`
- Crea: `src/app/gestionale/mfa/challenge/page.tsx`
- Crea: `src/components/management/mfa-enrollment.tsx`
- Crea: `src/components/management/mfa-challenge.tsx`
- Crea: `src/app/gestionale/(protected)/account/page.tsx`
- Modifica: `src/app/auth/callback/route.ts:1-39`
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

Comporre `requireStaffRole()` con `auth.mfa.getAuthenticatorAssuranceLevel()`. Non fidarsi mai di ruolo/fattore forniti da form, cookie, metadata utente o client component.

`managementStaffRedirectUrl(path)` usa `MANAGEMENT_ORIGIN` HTTPS in remoto, accetta l'origine loopback corrente solo in locale/test, permette solo path assoluti della stessa app e fallisce in chiusura senza origin in produzione. Il callback condiviso rimanda inviti/recovery staff a management, conservando `/account` per i clienti storefront.

- [ ] **Step 3: Implementare login e logout indipendenti**

Il login autentica con password, verifica staff e membership attivi, registra l'accesso, valuta la destinazione MFA e reindirizza solo a route gestionali pulite. Credenziali errate, staff inattivo o membership assente producono lo stesso messaggio generico. Nessun link di registrazione. Logout esegue sign-out, pulisce la cache PWA nominata e torna a `/login`.

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
pnpm lint
pnpm typecheck
```

Atteso: PASS; login e callback cliente sono invariati.

- [ ] **Step 7: Committare l'autenticazione**

```bash
git add supabase/config.toml src/lib/management/access.ts src/lib/management/auth-redirect.ts src/app/gestionale src/components/management/login-form.tsx src/components/management/mfa-enrollment.tsx src/components/management/mfa-challenge.tsx src/app/auth/callback/route.ts src/app/admin/actions/team.ts tests/unit/management-access.test.ts tests/unit/management-auth-redirect.test.ts
git commit -m "feat: require secure management authentication"
```

---

### Task 5: Consegnare overview Gear Drop read-only e PWA sicura

**File:**

- Crea: `src/lib/operations/dashboard.ts`
- Crea: `src/lib/operations/warehouse.ts`
- Modifica: `src/lib/admin/dashboard.ts`
- Modifica: `src/lib/admin/warehouse-repository.ts`
- Crea: `src/lib/management/overview.ts`
- Crea: `tests/unit/management-overview.test.ts`
- Crea: `tests/unit/management-ui-boundary.test.ts`
- Crea: `src/app/gestionale/(protected)/layout.tsx`
- Crea: `src/app/gestionale/(protected)/page.tsx`
- Crea: `src/app/gestionale/(protected)/settings/security/page.tsx`
- Crea: `src/app/gestionale/actions/organization.ts`
- Crea: `src/app/gestionale/actions/features.ts`
- Crea: `src/components/management/management-shell.tsx`
- Crea: `src/components/management/organization-switcher.tsx`
- Crea: `src/components/management/feature-controls.tsx`
- Crea: `src/components/management/management-pwa.tsx`
- Crea: `src/components/management/management.module.css`
- Crea: `public/management.webmanifest`
- Crea: `public/management-sw.js`
- Crea: `public/management-offline.html`
- Crea: `tests/unit/management-pwa.test.ts`

- [ ] **Step 1: Scrivere i contratti read-only**

I test provano che accesso e `read_access` precedono ogni query di business; un errore flag invoca zero loader; l'ID organizzazione viene da `StaffPrincipal`; l'output rispetta il ruolo; l'albero management non importa admin e non contiene form/azioni operative né metodi mutanti; l'unica azione feature invoca `set_management_read_access`; le pagine dati sono dinamiche con `dynamic = "force-dynamic"` e `fetchCache = "force-no-store"`.

I test non devono sostenere che il JWT non possa invocare writer legacy: verificano esclusivamente la superficie management, coerentemente col caveat di sicurezza.

```bash
pnpm exec vitest run tests/unit/management-overview.test.ts tests/unit/management-ui-boundary.test.ts
```

Atteso: FAIL perché UI e loader neutrali non esistono.

- [ ] **Step 2: Estrarre i contratti read neutrali**

Spostare mapping/query da `src/lib/admin/dashboard.ts` a `src/lib/operations/dashboard.ts` e repository/tipi riepilogo da `src/lib/admin/warehouse-repository.ts` a `src/lib/operations/warehouse.ts`, mantenendo re-export compatibili per il pannello legacy. Il gestionale non importa così alcun modulo `src/lib/admin/**`; la formattazione monetaria resta un dettaglio della sua UI.

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
pnpm lint
pnpm typecheck
pnpm build
```

Atteso: PASS; build storefront e legacy admin restano verdi.

- [ ] **Step 7: Committare la slice read-only**

```bash
git add src/lib/operations/dashboard.ts src/lib/operations/warehouse.ts src/lib/admin/dashboard.ts src/lib/admin/warehouse-repository.ts src/lib/management/overview.ts src/app/gestionale src/components/management public/management.webmanifest public/management-sw.js public/management-offline.html tests/unit/management-overview.test.ts tests/unit/management-ui-boundary.test.ts tests/unit/management-pwa.test.ts
git commit -m "feat: add independent read-only management app"
```

---

### Task 6: Rendere il rehearsal realmente read-only, separato e cifrato

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

### Task 7: Produrre una copia staging sanificata e verificata

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

`verify-sanitized-copy.sql` termina non-zero se restano identità produzione, PII, note libere, ID Stripe, contatti fiscali/fornitore, payload audit, `accept_orders=true` o flag write/external attivo. Il runner esegue sanitizer, verifier e solo dopo esporta con la busta cifrata del Task 6.

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

### Task 8: Aggiungere E2E management, doppia build CI e runbook

**File:**

- Crea: `playwright.management.config.ts`
- Crea: `tests/e2e/management/global-setup.ts`
- Crea: `tests/e2e/management/support.ts`
- Crea: `tests/e2e/management/auth-mfa.spec.ts`
- Crea: `tests/e2e/management/route-boundary.spec.ts`
- Crea: `tests/e2e/management/organization-readonly.spec.ts`
- Crea: `tests/e2e/management/pwa.spec.ts`
- Modifica: `.github/workflows/supabase-database-ci.yml`
- Modifica: `tests/unit/supabase-ci-workflow.test.ts`
- Modifica: `package.json:7-31`
- Crea: `docs/operations/management-cloud-environment.md`
- Crea: `docs/operations/management-cloud-rollout.md`
- Crea: `docs/operations/management-cloud-smoke-test.md`
- Modifica: `docs/operations/gestionale-online.md`
- Modifica: `docs/operations/geardrop-beta.md`

- [ ] **Step 1: Estendere prima il contratto CI**

Il test workflow deve provare:

- E2E management contro Supabase locale, `NEXT_PUBLIC_APP_SURFACE=management`, ref `local`, `MANAGEMENT_MODE=read_only`;
- nessun `SUPABASE_SECRET_KEY`, secret Stripe/Resend/AI nel web server;
- credenziale admin locale soltanto al global setup, che rifiuta non-loopback;
- suite seriale su porta dedicata;
- build storefront e management in production mode con ambienti espliciti;
- build management con `NEXT_PUBLIC_SUPABASE_URL=https://ci-management.supabase.co`, `NEXT_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF=ci-management`, `MANAGEMENT_ORIGIN=https://management-ci.invalid` e `STOREFRONT_ORIGIN=https://storefront-ci.invalid`, senza eccezioni loopback;
- pagine dinamiche gestionali che non interrogano il DB durante la build;
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

Se il nome del config storefront esistente differisce, usare il path reale mantenendo il nome script richiesto. Eseguire il browser gate management dopo reset vuoto e setup fixture. Costruire una volta storefront e una volta management con i valori remoti fittizi concordanti sopra; nessun override loopback in `NODE_ENV=production`.

- [ ] **Step 5: Sostituire la guida di deployment obsoleta**

I runbook separano variabili per storefront, client/server management, workstation rehearsal e CI; dichiarano un unico progetto Supabase produttivo e nessuna sincronizzazione DB. Il rollout comprende staging sanificato, owner sintetici, MFA, rehearsal/backup, migrazione additiva con flag false, esposizione remota del solo schema `management_api` nelle impostazioni Data API (verificando che `private` resti escluso), deploy separato, smoke test, attivazione esplicita di `read_access` e riconciliazione.

Il runbook impone `LEGACY_ADMIN_MODE=enabled` per tutta questa fase e descrive `redirect` soltanto come gate futuro, dopo parità dei moduli e un piano dedicato. Il rollback disabilita `read_access` e ferma il deployment gestionale senza toccare `/admin` o il commercio storefront.

- [ ] **Step 6: Eseguire il contratto CI/E2E**

```bash
pnpm exec vitest run tests/unit/supabase-ci-workflow.test.ts
pnpm test:e2e:management
pnpm test:e2e:admin
pnpm test:e2e:storefront
```

Atteso: PASS sullo stack Docker locale e fixture pulite al termine.

- [ ] **Step 7: Committare CI e runbook**

```bash
git add playwright.management.config.ts tests/e2e/management .github/workflows/supabase-database-ci.yml tests/unit/supabase-ci-workflow.test.ts package.json docs/operations/management-cloud-environment.md docs/operations/management-cloud-rollout.md docs/operations/management-cloud-smoke-test.md docs/operations/gestionale-online.md docs/operations/geardrop-beta.md
git commit -m "test: gate independent management deployment"
```

---

### Task 9: Verifica finale, review e stop gate di rollout

**File:**

- Verifica: tutti i file modificati nei Task 1–8
- Aggiorna se cambiano le evidenze: `docs/operations/management-cloud-rollout.md`
- Crea solo localmente, non committare: `artifacts/management-foundation-verification/`

- [ ] **Step 1: Eseguire il gate database completo da stato pulito**

```bash
pnpm db:reset
pnpm db:test
pnpm db:test:upgrades
pnpm db:lint
pnpm db:types
git diff --exit-code -- src/lib/supabase/database.types.ts
```

Atteso: pgTAP incluso 049, upgrade, lint e type drift tutti verdi per `public,management_api`.

- [ ] **Step 2: Eseguire il gate applicativo completo**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e:public
pnpm exec playwright test --config playwright.supabase-public.config.ts
pnpm test:e2e:admin
pnpm test:e2e:storefront
pnpm test:e2e:management
pnpm build
```

Eseguire inoltre la build management production-mode documentata con URL/ref remoti fittizi concordanti e origin `.invalid`. Atteso: nessun failure ignorato, pass dipendente da retry o secret in output.

- [ ] **Step 3: Ripetere i controlli negativi sicurezza/privacy**

Ripetere i cinque Focus della revisione e i negativi dei sei flag non attivabili. Conservare soltanto riepiloghi redatti e hash.

```bash
rg -n "(service_role|SUPABASE_SECRET_KEY|STRIPE_SECRET_KEY|REHEARSAL_BACKUP_PASSPHRASE|postgresql://[^:]+:[^*])" src public docs tests scripts .github
git diff --check
git status --short
```

Atteso: soltanto nomi variabile/riferimenti documentali intenzionali; nessuna credenziale, fixture sensibile, errore whitespace o file inspiegato.

- [ ] **Step 4: Richiedere code review fresca**

Usare `superpowers:requesting-code-review` con specifica e piano. Il reviewer verifica copertura, Focus, RLS/AAL2, `management_api`, confine deployment, privacy staging e assenza di mutazioni nella superficie prodotto. Correggere i finding e ripetere gate focalizzati e completi.

- [ ] **Step 5: Passare le evidenze al sub-agente `editor`**

Prima di qualsiasi consegna all'utente, delegare all'`editor` il gate finale su matrice comandi, evidenze redatte, caveat JWT legacy, runbook e linguaggio delle promesse. Un FAIL dell'editor blocca la consegna; correggere i finding e ripetere i gate coinvolti fino a PASS. Questo controllo è aggiuntivo alla code review tecnica, non la sostituisce.

- [ ] **Step 6: Fermarsi prima delle operazioni remote e presentare evidenze**

Non creare ruolo produzione, applicare migrazioni remote, modificare gli schema esposti della Data API, importare staging, distribuire Vercel, modificare DNS o attivare `read_access`. Presentare matrice verde, diff migrazione e conteggio pgTAP, prova target/route fence, hash drill backup/restore, report sanitizer, rischi residui e input operatore. Specificare che `/admin` rimane abilitato.

- [ ] **Step 7: Eseguire il gate staging remoto solo dopo approvazione esplicita**

Seguire il runbook: ruolo produzione read-only autorizzato, backup cifrato verificato, restore locale, sanificazione, verifica, import sul ref staging confermato, esposizione del solo `management_api`, owner sintetici, deploy staging e smoke/E2E. Ogni mismatch ferma il rollout.

- [ ] **Step 8: Fermarsi di nuovo prima dell'attivazione produzione**

Dopo nuova approvazione: backup fresco, migrazione additiva con flag false, configurazione Data API con `management_api` esposto e `private` escluso, deploy management in `read_only`, smoke login/MFA/organizzazione/route fence, attivazione `read_access` owner+AAL2 e riconciliazione campione al 100%. `LEGACY_ADMIN_MODE` resta `enabled`; non eseguire il ramo `redirect`.

Se un controllo fallisce, disabilitare `read_access` e fermare il deployment gestionale. Lasciare commercio e `/admin` invariati; non eliminare migrazioni additive o audit.

- [ ] **Step 9: Committare solo gli ultimi aggiustamenti documentali**

```bash
git add docs/operations/management-cloud-rollout.md docs/operations/management-cloud-smoke-test.md
git commit -m "docs: record management foundation acceptance gates"
```

Non committare evidenze con identificativi ambiente, contenuti database, manifest backup o credenziali.

## Definizione di completamento

- Storefront, autenticazione cliente, checkout e webhook restano verdi.
- Il gestionale è un deployment separato con URL puliti e nessuna dipendenza da pagine/componenti legacy admin.
- Il deployment management non serve storefront, `/admin` o route business API/webhook.
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
- Unit, pgTAP, upgrade, lint, typecheck, E2E storefront/admin/management e doppia build production-mode passano.
- Code review e gate finale del sub-agente `editor` risultano PASS prima della consegna utente.
- I runbook documentano deploy, smoke test, rollback, perdita MFA, retention, caveat JWT condiviso e futura soglia per il redirect legacy.
