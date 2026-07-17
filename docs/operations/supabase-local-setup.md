# Supabase development and CI setup

Database runtime validation is CI-only. Do not install or require Docker Desktop on contributor computers. Do not link the project, run `db push`, reset a linked database, or paste production credentials before the explicit remote rollout gate.

## Contributor prerequisites

- Node.js and the pinned pnpm version from `package.json`.
- A copy of `.env.example` named `.env.local` only when developing browser/Auth integration; never use values from an unrelated remote project.

The local Auth configuration enables email/password signup. Email confirmation is disabled only in the generated local development configuration. Production confirmation and redirect settings must be reviewed at the remote rollout gate.

## Authoritative database verification

`.github/workflows/supabase-database-ci.yml` starts a fully local Supabase stack inside an ephemeral `ubuntu-latest` GitHub runner. It applies migrations, runs the seed twice, executes pgTAP and database lint, generates database types, compares them with the committed file, and then runs all application checks.

The workflow contains no access token, project ref, remote password, service-role credential, linked command, or IBNApp reference. A CI run cannot push or repair remote migrations.

The seed is generated from the checked-in catalogue with:

```powershell
pnpm seed:supabase
```

The generator is idempotent. New products are inserted with `stock_quantity = 0`; reruns do not overwrite real stock, availability overrides, preorder allocations, shipping activation, enablement evidence, or `site_settings.accept_orders`.

## Client boundaries

- `src/lib/supabase/client.ts` creates browser clients.
- `src/lib/supabase/server.ts` creates a request-scoped SSR client for each server operation.
- `src/lib/supabase/admin.ts` creates a new privileged client per operation and is protected by `server-only`.
- `src/lib/supabase/proxy.ts` refreshes cookies using verified claims.

Never cache a server or privileged client in module scope. Server authorization uses `getClaims()` or `getUser()`; `getSession()` is not an authorization source. The privileged key never belongs in `NEXT_PUBLIC_*` variables and is not a general RLS bypass.

## Safe initial state

- `COMMERCE_PROVIDER=mock` keeps offline development and existing UI tests independent from Supabase.
- Every seeded product has real stock zero and no automatic availability override.
- The seeded shipping method is inactive.
- `site_settings.accept_orders` remains false.
- No direct table grant can insert orders or update `products.stock_quantity`.

The Supabase provider is an injected, request-scoped adapter scaffold. Activating it in application routes is a later checkpoint.

See `bootstrap-first-owners.md` for the post-gate owner procedure and `enable-orders-checklist.md` for the mandatory activation gate.
