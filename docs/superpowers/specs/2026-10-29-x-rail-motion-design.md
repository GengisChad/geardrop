# GearDrop X-Rail motion design

**Date:** 2026-10-29
**Base:** `origin/main` at `78e16be`, branch `ccr-8c868515-1mcens`
**Approved by:** the owner, on the interactive preview "GEAR//DROP Level Up" (2026-10-29): "si procedi con tutto, sia la pulizia che l'aggiunta di motion".
**Goal:** give the storefront the motion set of that preview (a toothed free-shipping meter that answers every add, product clips in the gallery, X-Rail micro-interactions and an experimental card-to-product transition) after removing the animation code that no mounted component uses.

## Scope and invariants

- Motion carries state and feedback only. Every animation runs once and settles; nothing loops; nothing delays the first paint. The LCP image (home hero, product packshot) is never animated in, hidden or moved on load.
- `prefers-reduced-motion: reduce` stops all of it: Framer Motion already follows the OS through `MotionConfig reducedMotion="user"`; every new CSS animation sits behind `motion-reduce:animate-none` or a `no-preference` media query; videos do not autoplay and show native controls instead.
- Every number is real. The meter and the add toast read the server quote (`requestCartQuote`), never browser arithmetic on prices: the browser still owns only slugs and quantities.
- Clips carry no price, no availability and no "Novità" sticker, because a video cannot change when the catalogue does. Live state stays in the page around the clip.
- The owner's home order, the X-Rail colour meanings (lime ships now, violet is on its way, foil only on new releases) and the copy of existing messages are unchanged.
- The intro gate (`components/intro`) and its video stay disabled and kept for a future reactivation.
- No new runtime dependency. The clip renderer only adds pinned font packages as devDependencies.

## Cleanup first

Remove the components that nothing imports any more (`components/home/arena.tsx`, `components/home/duo-drop.tsx`, `components/holo/holo-card.tsx`, `components/holo/holo-surface.tsx`) and the `globals.css` rules and keyframes only they use: the "Holographic cards", "Duo drop" and "Hero fan and touch sweep" sections and 23 keyframes. `.gd-duo-offer-glow` (bundle offer), `.gd-hud` (bundle nudge) and the fixed bottom bars stay. Measured on the comment-free file before compression, the removed part is about 20 KB of the 35 KB of hand-written global CSS. `lib/holo.ts` stays: cards and the gallery read its palette.

## Free-shipping meter

- 20 discrete teeth. A tooth lights for every twentieth of the threshold that the buyer pays (subtotal minus discount, the same base as `freeShippingRemaining`), so at the current threshold of €100 each tooth is worth €5. `meterTeeth(paid, threshold)` is a pure function with its own tests.
- Teeth lit since the previous quote light one after another (45 ms apart); the first paint shows the current count at rest.
- Crossing the threshold during the visit turns the rail green, sends one light sweep along it and slaps a "Spedizione gratis" sticker on. A cart that opens already above the threshold shows the green rail and the sticker at rest.
- Copy unchanged: "Ancora €X e la spedizione è gratis." and "Spedizione gratuita sbloccata.". A shop without a free-shipping tier still shows no meter.

## Add toast

The toast after "Aggiungi" keeps "Aggiunto al carrello", the product name and "Vai al carrello". Only the newest toast asks the server for a quote of the new cart; when it answers, the line under the name reads "Ancora €X per la spedizione gratis" over a mini toothed rail, or "Spedizione gratuita sbloccata". Until then, or when the quote fails, it reads today's "spedizione gratis da €100". When the quote reports no free-shipping tier, the line disappears instead of promising one.

## Product clips

- A static manifest `productClips` in `data/assets.ts` maps a slug to its clip and poster under `public/video/products/`. It is read by slug on the product page, so it works with either commerce provider.
- First five: the owner's best sellers (`BESTSELLER_SLUGS`: Glory Valkerion LF, Wand Wizard 1-60R, Impact Drake 9-60LR, Hover Wyvern 3-85N) and Soar Phoenix 9-60GF, the release that just landed.
- A clip shows the name, the part code, the ratchet number, the blade type when the product has one and two catalogue features. Impact Drake and Hover Wyvern say "Solo la trottola", as their pages do.
- In the gallery the clip is the last item. Its thumbnail is the poster with a "Clip" label. Selecting it mounts `<video muted playsInline preload="none">`, which plays once, stops on its settled last frame and then offers "Rivedi". Zoom, the plate's watermark and the promo badge step aside while the clip shows. The first photo stays the priority image, and nothing of the clip loads before it is selected except the small lazy poster thumbnail.
- `scripts/clips/` renders the clips deterministically from HTML and CSS compositions with the preinstalled Playwright Chromium and ffmpeg (`pnpm clips`), reading the facts from `data/catalog.ts`. It also renders the 9:16 reels for Instagram and YouTube into the gitignored `out/clips/`; reels are not committed or served by the site. Every clip follows the motion design rule in `CLAUDE.md`.

## X-Rail touches

- **Add to cart.** A cut of light crosses the button once per add, on the card's compact button and on the full one. The header emblem repeats its launch (two counter-clockwise turns, then its drawn pose) on every add. A non-persisted pulse counter that only `add` and `swapIntoBundle` increment drives it, so rehydrating a stored cart never fires it.
- **Stickers.** Promo stickers land with a short slap as they scroll into view, and the foil passes one sheen. Pure CSS on the scroll timeline, behind the same gates as `Reveal`: `no-preference`, `@supports (animation-timeline: view())`, and screenshot mode forces the final state. Stickers already in view on load are at rest.
- **Avvisami.** The confirmation adds a white "Avviso attivo" sticker that slaps on once; the confirmation sentence is unchanged.
- **Ratchet number.** On the product page the outlined number behind the packshot slides in once along the slash angle. It is decorative and `aria-hidden`, and the packshot itself does not move.

## Card to product transition (experimental)

Next 16 integrates React's View Transitions behind `experimental.viewTransition`. The catalogue grids (`/negozio` and the category pages) give each card's packshot a per-slug name that the product page's first photo shares, so the photo travels from the card into place. Home shelves, carousels and search are left out because a product can appear twice there, and a duplicate name makes the browser skip the transition. The flag is read from `GEARDROP_VIEW_TRANSITIONS` at build time and is kept on only if the e2e suite and the measured LCP hold; browsers without the API keep today's instant change.

## Verification

- Unit: `meterTeeth` and the stagger, the toast line in every state, the cart pulse (adds and swaps fire it, rehydration does not), the clip manifest contract (files exist, slugs exist, no bundle), the gallery markup with and without a clip.
- E2E on desktop and mobile: the existing public suite stays green; new cover for the meter after adds, the clip slide (`preload="none"`, no loop, plays once) and reduced motion (no autoplay, animations off).
- Speed: LCP of the home and of a product page on the production build, measured before and after on the same machine with mobile throttling.
- Review of the full diff before push. Rollback is a normal revert; nothing touches the database.
