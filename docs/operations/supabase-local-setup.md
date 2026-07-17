# Supabase local setup

This phase is local-only. Do not link the project, run `db push`, reset a linked database, or paste production credentials before the explicit remote rollout gate.

## Prerequisites

- Node.js and the pinned pnpm version from `package.json`.
- Docker Desktop running with Linux containers.
- A copy of `.env.example` named `.env.local`; populate it only with values printed by the local Supabase CLI.

The local Auth configuration enables email/password signup. Email confirmation is disabled only in the generated local development configuration. Production confirmation and redirect settings must be reviewed at the remote rollout gate.

## Start and verify the local stack

```powershell
pnpm install --frozen-lockfile
pnpm db:start
pnpm db:reset
pnpm db:test
pnpm db:types
```

`pnpm db:reset` is explicitly local. It applies the CLI-generated migrations and then `supabase/seed.sql`. The seed is generated from the checked-in catalogue with:

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

## Stop the local stack

```powershell
pnpm db:stop
```

See `bootstrap-first-owners.md` for the post-gate owner procedure and `enable-orders-checklist.md` for the mandatory activation gate.
