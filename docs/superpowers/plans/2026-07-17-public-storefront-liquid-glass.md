# Public Storefront Liquid Glass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the token-driven liquid-glass material system to every public GEAR//DROP route while preserving content, commerce behavior, semantic states and the original working tree.

**Architecture:** `src/styles/globals.css` owns five material tiers through CSS custom properties and one shared declaration block. Components consume only the tier class plus small semantic modifiers such as product plates or editorial composition; route-level wrappers are used only where the route itself is a meaningful surface. Playwright contracts drive the rollout and validate real computed styles, route coverage, reduced motion and overflow.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.9, Tailwind CSS 4, Playwright 1.61, Vitest 4.

## Global Constraints

- Work only in the isolated worktree based on commit `aededc8`.
- Preserve Bundle, Club and Status Legend; do not copy deletions or modifications from the original working tree.
- Do not change admin UI, Supabase, commerce logic, information architecture, content, product data or route behavior.
- Keep exactly five reusable material tiers: `gd-glass`, `gd-glass-card`, `gd-glass-panel`, `gd-glass-compact`, `gd-glass-dark`.
- Every tier exposes background, border, inner-highlight, shadow, blur, saturation, hover, active, focus and no-backdrop fallback tokens.
- Emit both `backdrop-filter` and `-webkit-backdrop-filter`.
- Never blur product images or place text on insufficiently opaque glass.
- Preserve WCAG AA contrast, visible focus, semantic status colors, 44 px touch targets and `prefers-reduced-motion`.
- Do not add continuous shine, looping card motion, distortion, strong glow, black page backgrounds or an announcement bar.
- Produce one second commit only. Amend the existing local second commit; do not create intermediate commits.

---

### Task 1: Add failing public-material contracts

**Files:**
- Modify: `tests/e2e/responsive.spec.ts`

**Interfaces:**
- Consumes: existing Playwright projects and public routes.
- Produces: selectors and computed-style contracts that all later tasks must satisfy.

- [ ] **Step 1: Add a material-style reader and five-tier token test**

Add this helper below the imports:

```ts
const PUBLIC_ROUTES = [
  "/",
  "/negozio",
  "/negozio/beyblade-x",
  "/prodotto/wizard-arrow-4-80b",
  "/carrello",
  "/checkout",
  "/preferiti",
  "/ricerca?q=shark",
  "/account",
  "/chi-siamo",
  "/assistenza/faq",
  "/legale/privacy",
  "/missing-route",
] as const;

const MATERIAL_SELECTORS = [
  ".gd-glass",
  ".gd-glass-card",
  ".gd-glass-panel",
  ".gd-glass-compact",
  ".gd-glass-dark",
] as const;
```

Add a desktop test that loads `/` and reads, for each selector, these computed properties:

```ts
const tokens = [
  "--gd-material-fallback",
  "--gd-material-background",
  "--gd-material-border",
  "--gd-material-highlight",
  "--gd-material-shadow",
  "--gd-material-blur",
  "--gd-material-saturation",
  "--gd-material-hover-background",
  "--gd-material-active-background",
  "--gd-material-focus-ring",
] as const;
```

Assert that every token is non-empty, `backdrop-filter` or `-webkit-backdrop-filter` is not `none`, border width is non-zero and the computed background is not fully transparent.

- [ ] **Step 2: Add route-specific tier assertions**

Add one desktop test with this exact route-to-surface matrix:

```ts
const surfaces = [
  ["/", "[data-testid='hero-glass']", "gd-glass"],
  ["/", "[data-testid='bundle-glass']", "gd-glass-dark"],
  ["/", "[data-testid='club-glass']", "gd-glass"],
  ["/", "[data-testid='status-legend']", "gd-glass-compact"],
  ["/negozio", "[data-testid='catalog-hero']", "gd-glass"],
  ["/negozio", "[data-testid='filters']", "gd-glass-panel"],
  ["/prodotto/wizard-arrow-4-80b", "[data-testid='product-gallery']", "gd-glass-panel"],
  ["/prodotto/wizard-arrow-4-80b", "[data-testid='buy-panel']", "gd-glass-panel"],
  ["/carrello", "[data-testid='cart-summary']", "gd-glass-panel"],
  ["/checkout", "[data-testid='checkout-summary']", "gd-glass-panel"],
  ["/preferiti", "[data-testid='wishlist-surface']", "gd-glass-panel"],
  ["/ricerca?q=shark", "[data-testid='search-surface']", "gd-glass-panel"],
  ["/assistenza/faq", "[data-testid='content-page']", "gd-glass-panel"],
  ["/missing-route", "[data-testid='not-found-glass']", "gd-glass"],
] as const;
```

For each entry, navigate, resolve one element, assert it contains the expected class, then assert active backdrop filtering.

- [ ] **Step 3: Add reduced-motion and viewport overflow contracts**

Add a test that calls `page.emulateMedia({ reducedMotion: "reduce" })`, loads `/`, resolves `.gd-glass-interactive`, and asserts computed `transitionDuration` is `0s` and `animationDuration` is `0s`.

Add a mobile/tablet test that loops over viewport sizes `{ width: 390, height: 844 }`, `{ width: 430, height: 932 }`, and `{ width: 768, height: 1024 }`; for every route in `PUBLIC_ROUTES`, assert:

```ts
document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
```

- [ ] **Step 4: Run the new tests and verify RED**

Run:

```bash
pnpm exec playwright test tests/e2e/responsive.spec.ts --project=desktop --grep "material tokens|assigned liquid glass tier|reduced motion"
```

Expected: FAIL because the CSS token contract and new route test IDs do not yet exist.

---

### Task 2: Centralize material tokens and ambient field

**Files:**
- Modify: `src/styles/globals.css`
- Test: `tests/e2e/responsive.spec.ts`

**Interfaces:**
- Consumes: the five existing `gd-glass*` class names.
- Produces: the ten `--gd-material-*` computed tokens, shared tier behavior, fallback, product plate, editorial composition and ambient section utilities.

- [ ] **Step 1: Define per-tier variables**

Keep five `@utility` declarations, but reduce each to variable assignments. The display tier begins with:

```css
@utility gd-glass {
  --gd-material-fallback: rgba(249, 250, 252, 0.96);
  --gd-material-background: linear-gradient(135deg, rgba(255, 255, 255, 0.82), rgba(255, 255, 255, 0.56) 54%, rgba(122, 60, 255, 0.06));
  --gd-material-border: rgba(255, 255, 255, 0.76);
  --gd-material-highlight: rgba(255, 255, 255, 0.9);
  --gd-material-shadow: 0 28px 70px -38px rgba(18, 20, 23, 0.46);
  --gd-material-blur: 24px;
  --gd-material-saturation: 1.5;
  --gd-material-hover-background: linear-gradient(135deg, rgba(255, 255, 255, 0.86), rgba(255, 255, 255, 0.62) 54%, rgba(122, 60, 255, 0.08));
  --gd-material-hover-border: rgba(255, 255, 255, 0.9);
  --gd-material-hover-shadow: 0 30px 74px -38px rgba(91, 33, 214, 0.34);
  --gd-material-active-background: rgba(250, 250, 253, 0.88);
  --gd-material-active-border: rgba(122, 60, 255, 0.3);
  --gd-material-active-shadow: 0 18px 42px -30px rgba(18, 20, 23, 0.4);
  --gd-material-focus-ring: rgba(122, 60, 255, 0.62);
}
```

Define card at approximately 78% white, panel at approximately 90% white, compact at approximately 84% white with 18 px blur, and dark with an opaque graphite fallback plus 20 px blur. Every tier must set all variables listed in Task 1.

- [ ] **Step 2: Add one shared material declaration**

Add a grouped selector for all five classes:

```css
:where(.gd-glass, .gd-glass-card, .gd-glass-panel, .gd-glass-compact, .gd-glass-dark) {
  isolation: isolate;
  background: var(--gd-material-fallback);
  border: 1px solid var(--gd-material-border);
  box-shadow: inset 0 1px 0 var(--gd-material-highlight), var(--gd-material-shadow);
}

@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  :where(.gd-glass, .gd-glass-card, .gd-glass-panel, .gd-glass-compact, .gd-glass-dark) {
    background: var(--gd-material-background);
    -webkit-backdrop-filter: blur(var(--gd-material-blur)) saturate(var(--gd-material-saturation));
    backdrop-filter: blur(var(--gd-material-blur)) saturate(var(--gd-material-saturation));
  }
}
```

Add hover, active and focus-visible behavior driven only by variables. Under `prefers-reduced-motion: reduce`, set transition and animation durations to `0s !important` and remove interactive transforms.

- [ ] **Step 3: Add focused composition utilities**

Add:

```css
@utility gd-product-plate {
  background: color-mix(in srgb, white 88%, var(--color-grey-100));
  border: 1px solid color-mix(in srgb, white 82%, var(--color-grey-200));
  box-shadow: inset 0 1px 0 white, inset 0 -1px 0 rgba(122, 60, 255, 0.05);
}

@utility gd-section-ambient {
  background-image:
    radial-gradient(36rem 18rem at 12% 0%, rgba(198, 255, 0, 0.045), transparent 70%),
    radial-gradient(34rem 20rem at 88% 100%, rgba(122, 60, 255, 0.055), transparent 72%);
}

@utility gd-editorial-panel {
  background-image:
    linear-gradient(120deg, rgba(255, 255, 255, 0.18), transparent 42%),
    radial-gradient(28rem 18rem at 82% 20%, rgba(122, 60, 255, 0.12), transparent 72%);
}
```

These utilities must not apply backdrop filters to image elements.

- [ ] **Step 4: Strengthen the body ambient field**

Keep the pearl-grey body fallback. Extend `body::before` with two one-pixel technical grid gradients at no more than 3% graphite alpha and a grid size between 44 and 56 px. Keep radial violet/lime alpha below 12%, `pointer-events: none`, fixed positioning and negative stacking.

- [ ] **Step 5: Run the material-token test and verify GREEN**

Run the Task 1 material-token test. Expected: PASS for all five tiers.

---

### Task 3: Apply compact and display materials to navigation and home

**Files:**
- Modify: `src/components/layout/header.tsx`
- Modify: `src/components/layout/mobile-menu.tsx`
- Modify: `src/components/layout/bottom-tab-bar.tsx`
- Modify: `src/components/layout/search-box.tsx`
- Modify: `src/components/layout/cart-indicator.tsx`
- Modify: `src/components/home/hero.tsx`
- Modify: `src/components/home/category-tiles.tsx`
- Modify: `src/components/home/bundle-banner.tsx`
- Modify: `src/components/home/club-band.tsx`
- Modify: `src/components/home/status-legend.tsx`
- Modify: `src/components/home/competitive-picks.tsx`
- Modify: `src/components/home/trust.tsx`
- Modify: `src/components/product/product-card.tsx`
- Modify: `src/components/product/product-carousel.tsx`
- Modify: `src/components/ui/carousel.tsx`
- Test: `tests/e2e/responsive.spec.ts`

**Interfaces:**
- Consumes: Task 2 tier and composition utilities.
- Produces: `bundle-glass`, `club-glass`, `status-legend` test anchors and fully materialized home/navigation surfaces.

- [ ] **Step 1: Normalize compact navigation controls**

Keep the header pill as `gd-glass-compact`. Replace flat search input, search toggle, cart/account actions, carousel arrows and bottom navigation action backgrounds with `gd-glass-compact` or a shared compact descendant class. Keep every actionable control at least `size-11`/44 px on touch layouts. Do not add a top bar.

- [ ] **Step 2: Preserve display hero and card hierarchy**

Keep `data-testid="hero-glass"` on the hero display surface. Add `gd-section-ambient` only to the hero field, not the artwork. Apply `gd-product-plate` to product image wrappers and category image wells. Product availability badges, price, wishlist and CTA classes remain semantic and readable.

- [ ] **Step 3: Give Bundle, Club and Status Legend distinct materials**

Bundle root:

```tsx
<div data-testid="bundle-glass" className="gd-glass-dark gd-editorial-panel relative overflow-hidden rounded-[--radius-glass-lg]">
```

Keep its graphite contrast, price and CTA. Use violet/lime only in low-alpha ambient pseudo-elements.

Club root:

```tsx
<div data-testid="club-glass" className="gd-glass gd-editorial-panel relative overflow-hidden rounded-[--radius-glass-lg]">
```

Use a wider editorial grid and preserve existing copy/form/functionality. Do not add product-card patterns.

Status Legend list:

```tsx
<ul data-testid="status-legend" className="gd-glass-compact grid grid-cols-2 gap-px overflow-hidden rounded-[--radius-glass] lg:grid-cols-4">
```

Each cell keeps its current semantic dot, label and explanation. Replace flat white cell backgrounds with transparent/low-alpha descendants so the compact parent remains visible.

- [ ] **Step 4: Differentiate home sections**

Use `gd-section-ambient`, technical hairlines and spacing on product carousel, competitive and trust sections. Do not wrap every section in a glass rectangle. Retain dark trust authority and use `gd-glass-dark` only on nested icon/status plates.

- [ ] **Step 5: Run the home and navigation E2E subset**

Run tests matching `assigned liquid glass tier|shows the bottom tab bar|hamburger|hero artwork`. Expected: PASS.

---

### Task 4: Materialize catalogue and product detail surfaces

**Files:**
- Modify: `src/components/catalog/catalog-hero.tsx`
- Modify: `src/components/catalog/catalog-view.tsx`
- Modify: `src/components/catalog/filters.tsx`
- Modify: `src/components/catalog/filters-sheet.tsx`
- Modify: `src/components/catalog/sort-select.tsx`
- Modify: `src/components/catalog/pagination.tsx`
- Modify: `src/components/ui/empty-state.tsx`
- Modify: `src/components/product/gallery.tsx`
- Modify: `src/components/product/buy-panel.tsx`
- Modify: `src/components/product/product-details.tsx`
- Modify: `src/components/product/quantity-stepper.tsx`
- Modify: `src/components/product/sticky-buy-bar.tsx`
- Modify: `src/components/product/wishlist-button.tsx`
- Modify: `src/app/prodotto/[slug]/page.tsx`
- Test: `tests/e2e/responsive.spec.ts`

**Interfaces:**
- Consumes: card, panel, compact and product-plate utilities.
- Produces: `catalog-hero`, `product-gallery`, `buy-panel` anchors and coherent catalogue/PDP hierarchy.

- [ ] **Step 1: Upgrade catalogue hero and filters**

Add `data-testid="catalog-hero"` and display glass to the catalogue hero content surface while keeping breadcrumbs and copy unchanged. Keep the desktop sidebar sticky and add `gd-glass-panel` directly to the element with `data-testid="filters"`; the mobile sheet remains panel glass. Convert filter chips, reset action, checkbox rows, slider plate, sort and pagination to compact material treatments without hiding semantic stock dots.

- [ ] **Step 2: Upgrade product gallery without blurring images**

Add `data-testid="product-gallery"` to the panel-glass gallery root. Apply `gd-product-plate` to the main image container and thumbnail image wells. Thumbnail buttons use compact glass, with selected state expressed by violet border plus `aria-current` or the existing selected logic.

- [ ] **Step 3: Make the buy area a functional panel**

Add `data-testid="buy-panel"` and `gd-glass-panel` to the product buy/details wrapper in `src/app/prodotto/[slug]/page.tsx`, or to the closest stable buy-panel root if that wrapper already owns the panel. Keep stock alert colors from `STATUS_PANEL`, quantity and CTA logic unchanged. Quantity, wishlist and tab buttons use compact glass.

- [ ] **Step 4: Refine details and mobile sticky bar**

Keep detail text on panel glass, use technical separators for specifications and compact styling for tabs/accordion controls. The sticky buy bar stays `gd-glass-compact`, uses the opaque fallback, and remains above page content without changing its intersection-observer behavior.

- [ ] **Step 5: Run catalogue and PDP tests**

Run tests matching `filters|product card|assigned liquid glass tier|sticky buy bar|card prices`. Expected: PASS.

---

### Task 5: Materialize cart, checkout and shared form controls

**Files:**
- Modify: `src/app/carrello/cart-client.tsx`
- Modify: `src/components/cart/cart-summary.tsx`
- Modify: `src/app/checkout/checkout-client.tsx`
- Modify: `src/components/ui/field.tsx`
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/toast.tsx`
- Test: `tests/e2e/responsive.spec.ts`

**Interfaces:**
- Consumes: panel and compact materials.
- Produces: `cart-summary`, `checkout-summary` anchors and reusable compact form controls.

- [ ] **Step 1: Replace flat loading and line-item plates**

Use card/panel material skeletons instead of `bg-grey-200`. Keep line items as panel glass and product image wells as `gd-product-plate`.

- [ ] **Step 2: Refine cart summary and shipping meter**

Add `data-testid="cart-summary"` and `gd-glass-panel` to the sticky cart summary root. Convert `FreeShippingMeter` to a compact/panel-derived plate while preserving progress calculation, available color and all totals test IDs.

- [ ] **Step 3: Refine checkout fieldsets and summary**

Keep fieldsets and sticky order review as panel glass. Add `data-testid="checkout-summary"` to the order review surface. Inputs, selects, radio labels and coupon controls consume compact glass through `Field` and shared control classes. Preserve error borders, accessible descriptions and payment CTA priority.

- [ ] **Step 4: Normalize shared input/button/toast states**

Change `Field` base from flat `bg-white` to `gd-glass-compact`, retaining semantic error border and `aria-invalid`. Use material variables for glass button hover/active/focus. Toasts use panel glass while success/error icon colors remain semantic.

- [ ] **Step 5: Run cart, checkout and unit tests**

Run:

```bash
pnpm exec playwright test tests/e2e/cart.spec.ts tests/e2e/responsive.spec.ts --workers=1 --grep "cart|checkout|assigned liquid glass tier"
pnpm test
```

Expected: all selected E2E and 66 unit tests pass.

---

### Task 6: Complete secondary routes, footer and fallback surfaces

**Files:**
- Modify: `src/app/account/page.tsx`
- Modify: `src/app/preferiti/page.tsx`
- Modify: `src/app/preferiti/wishlist-client.tsx`
- Modify: `src/app/ricerca/page.tsx`
- Modify: `src/app/chi-siamo/page.tsx`
- Modify: `src/components/layout/content-page.tsx`
- Modify: `src/app/not-found.tsx`
- Modify: `src/components/layout/footer.tsx`
- Modify: `src/components/layout/newsletter-form.tsx`
- Test: `tests/e2e/responsive.spec.ts`

**Interfaces:**
- Consumes: display, card, panel, compact and dark tiers.
- Produces: `wishlist-surface`, `search-surface`, `content-page`, `not-found-glass` anchors and complete public-route coverage.

- [ ] **Step 1: Add deliberate secondary-route surfaces**

Add a panel header surface or panel content region to account, wishlist and search without wrapping the entire route in one card. Add:

```tsx
data-testid="wishlist-surface"
data-testid="search-surface"
```

to the meaningful panel region. Product grids continue to use product cards. Empty and loading states use panel/card material plates.

- [ ] **Step 2: Refine About and content pages**

Keep About cards as card glass. In `ContentPage`, add `data-testid="content-page"` and panel glass to the article body region, not the full viewport. Preserve headings, breadcrumbs, notice semantics and body copy. Use technical dividers between sections.

- [ ] **Step 3: Refine 404 and footer**

Add `data-testid="not-found-glass"` and display glass to the focused 404 composition while preserving emblem, text and actions. Keep the footer graphite; apply dark glass only to nested newsletter/payment/status plates. Do not introduce a top bar.

- [ ] **Step 4: Run full route-contract and overflow tests**

Run the new route matrix and the 390/430/768 overflow test with one worker. Expected: PASS on every public route.

---

### Task 7: Visual audit, complete verification and delivery

**Files:**
- Modify only files already listed when a concrete visual defect is observed.
- Amend: `docs/superpowers/specs/2026-07-17-public-storefront-liquid-glass-design.md`
- Amend: `docs/superpowers/plans/2026-07-17-public-storefront-liquid-glass.md`

**Interfaces:**
- Consumes: completed public material system.
- Produces: one verified second commit and updated PR #1.

- [ ] **Step 1: Start the isolated preview and inspect required viewports**

Run the app from the isolated worktree on a port different from the original preview. Inspect `/`, `/negozio`, one category, one PDP, `/carrello`, `/checkout`, `/preferiti`, `/ricerca?q=shark`, `/account`, `/chi-siamo`, `/assistenza/faq`, `/legale/privacy` and a missing route at 390×844, 430×932, 768×1024 and 1440×900.

Check Chromium blur visibility, image sharpness, semantic state contrast, sticky layers, footer/bottom-bar separation and horizontal overflow.

- [ ] **Step 2: Verify no unsupported or duplicated styling**

Run:

```bash
rg -n "backdrop-(blur|filter)|bg-white|shadow-\[" src --glob "*.tsx"
```

Review every hit. Keep only semantic image plates, deliberate white marks and one-off layout shadows that cannot be represented by material tokens. Remove duplicated material strings.

- [ ] **Step 3: Run full verification**

Run, in order:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm exec playwright test --workers=1
pnpm build
git diff --check HEAD^
```

Expected: zero lint/type errors, 66 unit tests passing, all non-skipped E2E passing, production build exit 0 and no whitespace errors.

- [ ] **Step 4: Amend the single second commit**

Stage only files modified in the isolated worktree. Verify the diff contains no admin/Supabase files and no deletions from the original working tree. Amend without changing the message:

```bash
git add -- \
  docs/superpowers/specs/2026-07-17-public-storefront-liquid-glass-design.md \
  docs/superpowers/plans/2026-07-17-public-storefront-liquid-glass.md \
  src/styles/globals.css \
  tests/e2e/responsive.spec.ts \
  src/components/layout/header.tsx src/components/layout/mobile-menu.tsx \
  src/components/layout/bottom-tab-bar.tsx src/components/layout/search-box.tsx \
  src/components/layout/cart-indicator.tsx src/components/layout/content-page.tsx \
  src/components/layout/footer.tsx src/components/layout/newsletter-form.tsx \
  src/components/home/hero.tsx src/components/home/category-tiles.tsx \
  src/components/home/bundle-banner.tsx src/components/home/club-band.tsx \
  src/components/home/status-legend.tsx src/components/home/competitive-picks.tsx \
  src/components/home/trust.tsx src/components/product/product-card.tsx \
  src/components/product/product-carousel.tsx src/components/product/gallery.tsx \
  src/components/product/buy-panel.tsx src/components/product/product-details.tsx \
  src/components/product/quantity-stepper.tsx src/components/product/sticky-buy-bar.tsx \
  src/components/product/wishlist-button.tsx src/components/cart/cart-summary.tsx \
  src/components/catalog/catalog-hero.tsx src/components/catalog/catalog-view.tsx \
  src/components/catalog/filters.tsx src/components/catalog/filters-sheet.tsx \
  src/components/catalog/sort-select.tsx src/components/catalog/pagination.tsx \
  src/components/ui/button.tsx src/components/ui/carousel.tsx \
  src/components/ui/empty-state.tsx src/components/ui/field.tsx src/components/ui/toast.tsx \
  src/app/prodotto/[slug]/page.tsx src/app/carrello/cart-client.tsx \
  src/app/checkout/checkout-client.tsx src/app/account/page.tsx \
  src/app/preferiti/page.tsx src/app/preferiti/wishlist-client.tsx \
  src/app/ricerca/page.tsx src/app/chi-siamo/page.tsx src/app/not-found.tsx
git commit --amend --no-edit
```

- [ ] **Step 5: Push and update PR #1**

Push the detached worktree HEAD to the existing branch with lease protection:

```bash
git push --force-with-lease=codex/liquid-glass-coherence:aededc830a48ac1c586379df79393c3736087939 origin HEAD:codex/liquid-glass-coherence
```

Update PR #1 body with additional components, audited routes, exact test results and remaining Safari/iOS/manual checks. Verify PR #1 remains open, points to `main`, contains exactly two commits and is not merged.
