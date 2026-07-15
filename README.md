# GEAR//DROP

Store e-commerce italiano per la community Beyblade X. Next.js 16 (App Router), TypeScript
strict, Tailwind 4.

Il design non è inventato: deriva dai mockup forniti, sintetizzati in
**[`docs/reference-audit.md`](docs/reference-audit.md)** — leggilo prima di toccare la UI. È la
fonte di verità per token, componenti e comportamenti, e documenta anche dove i mockup si
contraddicono e come è stato risolto.

## Avvio

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

## Comandi

| Comando | Cosa fa |
| --- | --- |
| `pnpm dev` | Server di sviluppo |
| `pnpm build` / `pnpm start` | Build di produzione e avvio |
| `pnpm lint` | ESLint (flat config + regole React Compiler) |
| `pnpm typecheck` | `next typegen` + `tsc --noEmit` |
| `pnpm test` | Vitest — logica di dominio |
| `pnpm test:e2e` | Playwright — desktop + mobile |
| `pnpm shots` | Screenshot full-page in `docs/screenshots/` |
| `pnpm verify` | lint + typecheck + test + build |
| `pnpm assets` | Rigenera i binari in `public/` dagli originali |

`pnpm typecheck` include `next typegen`: senza, i tipi delle route non esistono e `tsc`
segnala come rotti anche i link validi.

## Struttura

```
assets-source/          originali forniti, intatti (mockup + logo)
docs/reference-audit.md analisi dei mockup — fonte di verità del design
docs/screenshots/       output di `pnpm shots`
scripts/build-assets.py provenienza di ogni binario in public/
src/app/                route (App Router)
src/components/         layout · product · catalog · cart · home · ui
src/data/               assets.ts (percorsi) · catalog.ts (dati) · pages.ts (testi)
src/lib/commerce/       adapter: types · provider · mock-provider
src/lib/store/          zustand persistito: carrello, preferiti
src/styles/globals.css  design token (@theme)
```

## Architettura

**Adapter commerce.** Tutta la UI legge il catalogo da `commerce` (`src/lib/commerce/provider.ts`),
mai da un provider concreto. Oggi risolve al catalogo locale; per collegare Shopify o Supabase si
aggiunge un adapter che soddisfa `CommerceProvider` (`types.ts`) e si estende lo switch nel
provider. Nessuna pagina o componente va toccato. I metodi sono `async` anche se il mock risponde
in modo sincrono, proprio perché passare a un backend di rete non sia un breaking change.

**Denaro in centesimi interi.** `Money.amount` è un intero: niente drift dei float sui totali.
La formattazione italiana (`€24,99`) vive solo in `src/lib/format.ts`.

**Stato dei filtri nella URL.** Una vista filtrata è condivisibile e il tasto indietro funziona.
I controlli usano `useOptimistic`: legati direttamente a `useSearchParams` resterebbero fermi
fino al round-trip del server.

**Carrello e preferiti nel browser** (zustand + `persist`). Espongono un flag `hydrated`: il
server rende sempre un carrello vuoto, quindi mostrare un conteggio persistito prima della
reidratazione sarebbe un hydration mismatch.

## Asset

Gli originali stanno in `assets-source/` e non si toccano. Tutto ciò che sta in `public/` è
derivato da `scripts/build-assets.py`, che documenta la provenienza di ogni file.

Il brief citava `/public/reference` e `/public/products`, che non esistevano, e **non è stata
fornita nessuna fotografia prodotto**: le immagini sono state ritagliate dai mockup, unica
sorgente disponibile. Sono adeguate per le card, deboli su una PDP ingrandita. Per sostituirle
con scatti reali: metti i file in `public/products/` e aggiorna `src/data/assets.ts` — nessun
componente cambia.

Vincoli rispettati (audit §7): i mockup non compaiono mai come immagini nel sito; il wordmark è
usato solo come asset fornito, mai ricostruito con un font né contornato; nessuna immagine
esterna o generata.

Limiti noti e cosa chiedere al brand: **audit §9**.

## Test

Vitest copre formattazione, provider, parsing della URL e schema di checkout — inclusi i casi
limite (soglia spedizione gratuita, query malformate, carrello con SKU rimosso).

Playwright gira su Chromium desktop (1440×900) e Pixel 7 contro **una build di produzione**,
non in dev: è quel che va online. Copre acquisto, filtri, ricerca, wishlist, checkout, stati di
disponibilità, comportamenti responsive e alcuni controlli di accessibilità.
