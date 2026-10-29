# GearDrop X-Rail motion implementation plan

> Spec: `docs/superpowers/specs/2026-10-29-x-rail-motion-design.md`. Execute in order, one commit per task. Logic gets a failing test first (RED), then the change (GREEN). Interactions are covered by Playwright, since the unit suite renders markup only.

**Tech stack:** Next.js 16.2.10, React 19.2.7, Tailwind 4.3.2, Framer Motion 12.42.2, Zustand, Vitest 4.1.10, Playwright (preinstalled Chromium), ffmpeg 6.1, pnpm 11.

**Baseline (2026-10-29, before any change):** `pnpm lint` 0 errors and 2 warnings, `pnpm typecheck` clean, `pnpm test` 121 files and 1191 tests green. The public e2e suite and LCP are recorded in task 0.

---

## Task 0: baseline

1. Run `pnpm test:e2e` (production build, desktop and mobile) and keep the result.
2. Measure LCP of `/` and `/prodotto/soar-phoenix-9-60gf` on the production build with mobile emulation and CPU and network throttling, five runs each, median.

## Task 1: remove animation code nothing mounts

**Owned files:** `src/components/home/arena.tsx`, `src/components/home/duo-drop.tsx`, `src/components/holo/holo-card.tsx`, `src/components/holo/holo-surface.tsx` (deleted), `src/styles/globals.css`, `src/lib/holo.ts` (comment only).

1. Prove nothing imports the four components and no test names their classes.
2. Delete them and the CSS rules and keyframes only they use; keep `.gd-duo-offer-glow`, `.gd-hud`, the fixed bottom bars and every keyframe a mounted component or utility names.
3. `pnpm typecheck`, `pnpm test`, `pnpm build`; compare the built CSS size before and after.

## Task 2: toothed free-shipping meter and the live add toast

**Owned files:** `src/lib/commerce/free-shipping-meter.ts` (new), `src/components/cart/cart-summary.tsx`, `src/components/ui/toast.tsx`, `src/components/cart/toast-free-shipping.tsx` (new), `src/components/product/add-to-cart-button.tsx`, `src/styles/globals.css`, `tests/unit/free-shipping-meter.test.ts(x)` (new), e2e in `tests/e2e/cart.spec.ts`.

1. RED: `meterTeeth` (0, partial, just below, exact, above, zero or missing threshold, discounts) and the per-tooth delays for a jump from n to m teeth; markup tests for the meter (teeth count, lit count, green when reached, no meter without a threshold) and for the toast line in its states.
2. GREEN: the pure module, the meter as 20 teeth with staggered lighting from the previous count, the one-time unlock (sweep and sticker), the toast's live line for the newest toast only.
3. E2E: add pieces on the mock provider, open the cart, assert lit teeth and the remaining amount match the quote; assert the toast line after an add.

## Task 3: X-Rail touches

**Owned files:** `src/lib/store/cart.ts`, `src/components/layout/logo.tsx`, `src/components/layout/emblem-launch.tsx` (new), `src/components/product/add-to-cart-button.tsx`, `src/components/ui/button.tsx` (only if it cannot carry the cut), `src/components/product/restock-form.tsx`, `src/components/product/gallery.tsx` (watermark), `src/styles/globals.css`, unit tests for the pulse.

1. RED: the pulse increments on `add` and `swapIntoBundle` and stays at zero after rehydration; markup tests for the cut class and the "Avviso attivo" sticker.
2. GREEN: pulse store, emblem relaunch on pulse, the cut on both add buttons, sticker slap and single sheen on the scroll timeline with the Reveal gates and the screenshot override, the restock sticker, the ratchet number's one-time slide.
3. E2E: reduced motion leaves every new animation at `none`; the existing reduced-motion test stays green.

## Task 4: product clips

**Owned files:** `scripts/clips/*` (new), `package.json` (`clips` script, font devDependencies), `pnpm-lock.yaml`, `.gitignore` (`out/`), `public/video/products/*` (new), `src/data/assets.ts`, `src/components/product/gallery.tsx`, `src/components/product/product-clip.tsx` (new), `src/app/(storefront)/prodotto/[slug]/page.tsx`, `tests/unit/product-clips.test.ts(x)` (new), e2e in `tests/e2e/shop.spec.ts`.

1. RED: the manifest contract (every entry's slug is in the catalogue and not a bundle, both files exist, the poster is the clip's size) and gallery markup (a "Clip" thumbnail only with a clip; the first photo keeps `priority`).
2. Port the renderer from the approved preview; read facts from the catalogue; render the five gallery clips and posters into `public/video/products/` and the five reels into `out/clips/`; check every contact sheet.
3. GREEN: manifest, gallery item, clip player (plays once, "Rivedi", reduced motion shows controls without autoplay), zoom limited to photos.
4. E2E: selecting the clip mounts a video with `preload="none"`, `muted`, `playsinline` and no `loop`; nothing requests the mp4 before.

## Task 5: card to product transition, behind a flag

**Owned files:** `next.config.ts`, `src/components/product/product-card.tsx`, `src/components/catalog/catalog-view.tsx`, `src/components/product/gallery.tsx`, e2e.

1. Enable `experimental.viewTransition` from `GEARDROP_VIEW_TRANSITIONS`; name packshots only in catalogue grids and on the product page's first photo.
2. Run the full e2e suite and the LCP measure with the flag on. Keep it on only if both hold; otherwise leave it off and record why.

## Task 6: verify, review, document, push

1. `pnpm verify`, `pnpm test:e2e`, LCP after, screenshots of the touched pages.
2. Review the whole diff; fix findings.
3. Record the owner's motion decision in `PRODUCT.md` and `CLAUDE.md`.
4. Commit per task and push `ccr-8c868515-1mcens`.
