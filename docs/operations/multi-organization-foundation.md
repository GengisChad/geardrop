# Fondamenta multi-azienda

Un solo gestionale, più aziende: oggi **Gear Drop** (`geardrop`, negozio online pubblico) e
**Oryvenne** (`oryvenne`, nessun negozio pubblico). Ogni riga di business appartiene a una sola
azienda; il database lo garantisce con vincoli, RLS e RPC, l'app lo ripete su ogni query.

Questo documento spiega il modello, le regole per aggiungere tabelle, RPC e aziende, e cosa resta
globale. Non autorizza deploy: vale lo stop gate di `full-admin-rollout-checklist.md`.

## Modello

- `public.organizations`: `slug`, `name`, `legal_name`, `order_number_prefix` (2–4 lettere,
  unico: `GD`, `OV`), `currency`, `storefront_public`, `active`.
- `public.organization_members`: chi lavora per quale azienda, con quale ruolo (`owner`, `admin`,
  `editor`) e se è attivo. Il ruolo vale **per azienda**: si può essere owner di una ed editor
  dell'altra. `staff_profiles.active = false` chiude l'account in tutte le aziende.
- Helper `private.*` (security definer, `search_path = ''`): `member_organization_ids(roles)`,
  `is_org_member`, `org_role`, `require_org_role(org, roles, message)`,
  `is_storefront_organization`, `single_storefront_organization()`.

### Registro tier

Fonte unica: `supabase/tests/044_organization_tier_registry.test.sql`. Una tabella nuova non
registrata fa fallire il test.

| Tier | Significato | Esempi |
| --- | --- | --- |
| A | radice: `organization_id bigint not null` senza default, `unique (id, organization_id)` | `products`, `orders`, `site_settings`, `media_assets` |
| B | collegamento: `organization_id` + FK composte verso ogni genitore | `order_items`, `product_images`, `coupon_products` |
| C | figlio di un solo genitore: nessuna colonna, eredita l'azienda | `product_specs`, `order_notes`, `navigation_items` |
| G | globale | `staff_profiles`, `organizations`, `organization_members` |

- FK composte `(x_id, organization_id) → (id, organization_id)`: una riga B non può collegare
  radici di aziende diverse.
- Trigger `*_inherit_organization` (BEFORE INSERT, solo se `organization_id` è nullo) sulle B:
  copiano l'azienda dal genitore. Se l'app la passa, decide la FK composta.
- Trigger di immutabilità: una riga non cambia azienda.
- Unicità per azienda: `slug`, `sku`, codice coupon, `menu_key`, `section_key`, `platform_key`,
  `column_key`. `orders.order_number` resta unico globale, con il prefisso dell'azienda
  (`GD-00000042`, `OV-00000001`).

### RLS

- Staff: `organization_id = any ((select private.member_organization_ids(array[...]))::bigint[])`
  con i ruoli richiesti; tier C tramite `exists` sul genitore.
- `anon` e clienti: solo righe pubbliche di aziende con `storefront_public = true`. Con Oryvenne a
  `false` lo storefront non riceve nessuna sua riga, nemmeno per slug.

### RPC

Ogni RPC pubblica riceve `p_organization_id` e chiama `private.require_org_role(...)`, oppure
deriva l'azienda dalla riga su cui agisce (prodotto, ordine, media) e verifica il ruolo lì.
Nessuna legge `staff_profiles.role`. Tre RPC dello storefront hanno `p_organization_id` opzionale
(default: l'unica azienda con negozio pubblico): `track_storefront_event`,
`request_restock_notice`, `record_stripe_checkout_order`. L'app la passa comunque, sempre.

## Contesto nell'app

- **Admin**: `requireStaffRole` legge le membership attive sotto RLS e sceglie l'azienda dal
  cookie `gd_organization` (solo uno slug, una preferenza: uno slug non valido viene ignorato e si
  usa la prima azienda per id). Il ruolo controllato è quello nell'azienda scelta.
  `principal.organization.id` va a ogni repository, action e RPC. Il selettore è nella barra
  in alto (`OrganizationSwitcher`), sempre visibile; con una sola azienda mostra il nome.
- **Storefront**: `NEXT_PUBLIC_STOREFRONT_ORGANIZATION` (default `geardrop`) →
  `storefrontOrganizationId()`, letto una volta per processo e **chiuso in caso di errore**
  (`GD_STOREFRONT_ORGANIZATION_UNAVAILABLE:<slug>`): un'azienda senza negozio pubblico o un
  lookup fallito fermano la query, non servono righe di un'altra azienda.
- **Webhook Stripe**: gira con la secret key, che ignora la RLS: l'order store nomina l'azienda
  del negozio in ogni query e nell'RPC.
- **Write guard** (`src/lib/commerce/write-guard.ts`): `maintenance_mode` e `accept_orders` sono
  dell'azienda dell'operazione.
- **Contract test** `tests/unit/scoped-queries-contract.test.ts`: ogni `.from("<tabella A/B>")`
  in `src/` deve nominare `organization_id` (insert e upsert li controlla il compilatore: nei tipi
  generati `organization_id` è obbligatorio); ogni chiamata alle tre RPC opzionali deve passare
  `p_organization_id`. Le eccezioni sono in un'allowlist motivata riga per riga.

Nota sul piano: non esiste un helper `scopedFrom`. Il builder PostgREST non ha filtri prima di
`select/update/delete` e un wrapper generico perderebbe i tipi dei risultati; il contract test
impone la stessa regola sul filtro esplicito `.eq("organization_id", organizationId)`.

## Aggiungere una tabella

1. Classificarla nel registro 044 (A, B, C o G).
2. A: `organization_id bigint not null references public.organizations(id)` senza default,
   indice, `unique (id, organization_id)`, trigger di immutabilità, unicità per azienda.
3. B: `organization_id` + FK composta verso ogni genitore + trigger `inherit_organization`.
4. C: nessuna colonna; policy con `exists` sul genitore.
5. Policy per tier con `private.member_organization_ids(...)`; lettura pubblica solo con
   `private.is_storefront_organization(...)`.
6. RPC: `p_organization_id` + `private.require_org_role`, oppure azienda derivata dalla riga.
7. Test pgTAP nella matrice 042/043; `pnpm db:types`; query app con il filtro; contract test verde.

## Attivare una nuova azienda

Sempre con una migration (mai SQL a mano in produzione):

```sql
insert into public.organizations (slug, name, legal_name, order_number_prefix, storefront_public)
values ('nuova', 'Nuova', 'Nuova S.r.l.', 'NU', false);

insert into public.site_settings (organization_id, store_name, legal_name, accept_orders)
select id, name, legal_name, false from public.organizations where slug = 'nuova';

insert into public.order_enablement_checks (organization_id, key, label, status)
select nuova.id, checks.key, checks.label, 'pending'
from public.organizations nuova
cross join (
  select key, label from public.order_enablement_checks
  where organization_id = (select id from public.organizations where slug = 'geardrop')
) checks
where nuova.slug = 'nuova';

insert into public.organization_members (organization_id, user_id, role)
select nuova.id, member.user_id, 'owner'
from public.organizations nuova
join public.organization_members member
  on member.organization_id = (select id from public.organizations where slug = 'geardrop')
 and member.role = 'owner' and member.active
where nuova.slug = 'nuova';
```

Il negozio online arriva dopo, come rollout distinto: un deployment con
`NEXT_PUBLIC_STOREFRONT_ORGANIZATION=<slug>` e, solo quando catalogo e contenuti sono pronti,
`storefront_public = true` (da quel momento `anon` legge le sue righe pubblicate).

## Cosa resta globale

- Identità: `auth.users`, `staff_profiles` (display name, stato account, invito), eventi audit di
  identità (`staff.invite_accepted`, `staff.revoked`: `organization_id` nullo).
- Account cliente: `customer_profiles.user_id` resta chiave primaria. Un account appartiene
  all'azienda del negozio in cui si è registrato; l'anagrafica clienti manuale di Oryvenne userà
  una tabella dedicata.
- Bucket Storage `product-images`: unico, con policy per azienda tramite `media_assets`.

## Limiti noti

- Uno staff senza membership attiva non entra: il login risponde con il messaggio generico.
- Il numero d'ordine mostrato a un ospite che non può rileggere la riga è ricostruito con il
  prefisso `GD-` (lo storefront servito è Gear Drop).
- L'anteprima homepage admin usa il catalogo pubblico: disponibile solo per l'azienda del negozio.
- La domanda di restock dei bundle usa il catalogo statico di Gear Drop (`src/data/catalog.ts`).

## Rollout in produzione: prima il database, poi l'app

Migrazione del database e deploy Vercel non avvengono nello stesso istante. Per qualche minuto una
delle due app gira sul database "sbagliato". Verificato il 7 ottobre 2026 su tutto il codice di
`main` e di questa branch:

| Finestra | Cosa si rompe senza precauzioni |
| --- | --- |
| **App nuova su database vecchio** | Tutto il negozio: `storefrontOrganizationId()` legge `public.organizations`, che non esiste ancora, e si chiude. Catalogo in 500, checkout fermo, webhook Stripe che non registra gli ordini pagati. Pannello senza accesso (`organization_members` assente). |
| **App vecchia su database nuovo** | Negozio e `/admin` filtrano `site_settings` su `singleton`, colonna eliminata: 500 su ogni pagina. 15 RPC del pannello chiamate con la firma vecchia (errore `42883`). Inserimenti senza `organization_id` (prodotti, categorie, pagine, media, spedizioni, profilo cliente, meta). |

La seconda finestra è resa sicura da `20261007201016_keep_the_running_app_working_during_rollout.sql`
(fase *expand*): ripristina `site_settings.singleton` sulla riga dell'azienda del negozio, riempie
`organization_id` quando manca (trigger `_fill_storefront_organization` sulle 20 tabelle che l'app
vecchia conosce) e ricrea le 15 firme vecchie come inoltri verso quelle con l'azienda. Tutto punta
all'unica azienda con negozio pubblico e passa dai controlli di ruolo di quell'azienda: chi lavora
solo per Oryvenne non ottiene nulla su Gear Drop. Prova: pgTAP `050_rollout_compatibility`. L'app
nuova non usa niente di tutto questo (contract test `scoped-queries-contract`).

Ordine obbligatorio, con approvazione esplicita per ogni passo remoto:

1. **Database.** `supabase db push` sul progetto di produzione, con le migrazioni della branch.
   L'app in produzione continua a funzionare.
2. **Smoke test dell'app vecchia**: home, una pagina prodotto, carrello e quote, `/admin` con
   dashboard e impostazioni.
3. **App.** Merge della PR su `main`: Vercel pubblica l'app nuova. Mai prima del passo 1.
4. **Smoke test dell'app nuova** (`geardrop-smoke-test.md`).
5. **Contrazione**, solo quando nessun deployment vecchio può più tornare in servizio (anche un
   *instant rollback* Vercel verso un build precedente ha bisogno della fase expand): una migrazione
   nuova elimina le 15 firme vecchie, i 20 trigger e `private.fill_storefront_organization()`,
   `site_settings.singleton` con trigger, indice e `private.mark_storefront_site_settings()`.
   Poi rigenerare i tipi e aggiornare il contract test, che elenca le firme rimaste.

Una migrazione del negozio aggiunta a `main` dopo questa branch (come
`20261007200000_takara_consignment_products.sql`) va **prima** delle migrazioni delle aziende:
in produzione è già applicata quando arrivano queste. Se ne arriva un'altra prima del merge, le
migrazioni delle aziende si rinumerano di nuovo dopo di essa.

## Verifica

```powershell
pnpm verify
pnpm db:reset
pnpm db:test
pnpm db:test:upgrades
pnpm db:lint
pnpm test:e2e:admin
pnpm exec playwright test --config playwright.storefront.config.ts
```

Guardie specifiche: pgTAP 041–044 (schema, matrice RLS, confini RPC, registro tier), pgTAP 050
(compatibilità con l'app vecchia durante il rollout), upgrade
`organizations_before/after.sql.in` su database popolato, unit `org-context`,
`organization-switcher`, `scoped-queries-contract`, e2e `organization-isolation.spec.ts`.
