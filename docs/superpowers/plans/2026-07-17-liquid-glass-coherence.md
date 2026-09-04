# GEAR//DROP Liquid Glass Coherence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the enlarged hero artwork and a tiered liquid-glass material system feel consistent across the complete GEAR//DROP storefront.

**Architecture:** Centralize material behavior in global Tailwind utilities, then map existing components to display, card, panel, compact and dark tiers according to function. Keep semantic states and business logic unchanged; verify the shared visual contract through Playwright computed-style and responsive layout assertions.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.9, Tailwind CSS 4, Playwright 1.61, Vitest 4.

## Global Constraints

- Glass is restrained: fine white rims, controlled blur, subtle internal highlights and diffuse shadows.
- Violet and lime remain accents, never large decorative glows.
- Functional surfaces remain more opaque than promotional surfaces.
- Focus states and semantic status colors remain explicit.
- Backdrop-filter fallbacks must remain readable.
- Reduced-motion mode removes lift and animated sheen.
- No horizontal overflow may be introduced.
- Commerce logic, information architecture, copy and product imagery remain unchanged.

---

### Task 1: Define and verify the shared material tiers

**Files:**
- Modify: `src/styles/globals.css`
- Modify: `tests/e2e/responsive.spec.ts`

**Interfaces:**
- Consumes: existing Tailwind utility names `gd-glass`, `gd-glass-strong`, and `gd-glass-dark`.
- Produces: reusable utility names `gd-glass`, `gd-glass-card`, `gd-glass-panel`, `gd-glass-compact`, `gd-glass-dark`, and `gd-glass-interactive`.

- [ ] **Step 1: Add the failing material-contract test**

Add a Playwright test that loads the home page, finds representative display, card and panel surfaces by their utility classes, and asserts each has a non-`none` `backdrop-filter`, a translucent background color and a visible border. The test must also assert that panel opacity is greater than card opacity and card opacity is greater than display opacity using the computed `backgroundColor` alpha channel.

```ts
test("liquid glass tiers preserve hierarchy", async ({ page }) => {
  await page.goto("/");

  const styles = await page.evaluate(() => {
    const read = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Missing glass surface: ${selector}`);
      const style = getComputedStyle(element);
      const alpha = Number(style.backgroundColor.match(/[\d.]+(?=\))/g)?.at(-1) ?? 1);
      return {
        alpha,
        backdrop: style.backdropFilter || style.webkitBackdropFilter,
        border: style.borderTopWidth,
      };
    };
    return {
      display: read(".gd-glass"),
      card: read(".gd-glass-card"),
      panel: read(".gd-glass-panel"),
    };
  });

  expect(styles.display.backdrop).not.toBe("none");
  expect(styles.card.backdrop).not.toBe("none");
  expect(styles.panel.backdrop).not.toBe("none");
  expect(styles.display.border).not.toBe("0px");
  expect(styles.display.alpha).toBeLessThan(styles.card.alpha);
  expect(styles.card.alpha).toBeLessThan(styles.panel.alpha);
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `pnpm exec playwright test tests/e2e/responsive.spec.ts --grep "liquid glass tiers"`

Expected: FAIL because `.gd-glass-card` and `.gd-glass-panel` do not exist.

- [ ] **Step 3: Implement the material utilities**

Replace the current light-glass utilities with a shared tokenized family. Each utility must set a translucent `background`, `backdrop-filter`, prefixed backdrop filter, a one-pixel rim and a layered inset/ambient shadow. `gd-glass-interactive` owns the restrained hover lift and violet reflection; reduced motion disables its transform.

```css
@utility gd-glass {
  background: color-mix(in srgb, white 62%, transparent);
  backdrop-filter: blur(24px) saturate(1.55);
  -webkit-backdrop-filter: blur(24px) saturate(1.55);
  border: 1px solid color-mix(in srgb, white 72%, transparent);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.88), inset 0 -1px 0 rgba(122, 60, 255, 0.05), 0 24px 60px -34px rgba(18, 20, 23, 0.42);
}

@utility gd-glass-card {
  background: color-mix(in srgb, white 74%, transparent);
  backdrop-filter: blur(28px) saturate(1.5);
  -webkit-backdrop-filter: blur(28px) saturate(1.5);
  border: 1px solid color-mix(in srgb, white 78%, transparent);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.94), inset 0 -1px 0 rgba(122, 60, 255, 0.06), 0 26px 60px -34px rgba(18, 20, 23, 0.38);
}

@utility gd-glass-panel {
  background: color-mix(in srgb, white 86%, transparent);
  backdrop-filter: blur(30px) saturate(1.35);
  -webkit-backdrop-filter: blur(30px) saturate(1.35);
  border: 1px solid color-mix(in srgb, white 84%, transparent);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.96), inset 0 -1px 0 rgba(18, 20, 23, 0.04), 0 24px 54px -34px rgba(18, 20, 23, 0.34);
}

@utility gd-glass-compact {
  background: color-mix(in srgb, white 76%, transparent);
  backdrop-filter: blur(20px) saturate(1.45);
  -webkit-backdrop-filter: blur(20px) saturate(1.45);
  border: 1px solid color-mix(in srgb, white 72%, transparent);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 12px 30px -22px rgba(18, 20, 23, 0.42);
}
```

- [ ] **Step 4: Run the focused test and confirm it passes**

Run: `pnpm exec playwright test tests/e2e/responsive.spec.ts --grep "liquid glass tiers"`

Expected: PASS.

- [ ] **Step 5: Commit the material system**

```bash
git add src/styles/globals.css tests/e2e/responsive.spec.ts
git commit -m "feat: add tiered liquid glass system"
```

### Task 2: Enlarge and rebalance the hero artwork

**Files:**
- Modify: `src/components/home/hero.tsx`
- Modify: `src/components/home/hero-impact.tsx`
- Modify: `tests/e2e/responsive.spec.ts`

**Interfaces:**
- Consumes: the display tier `gd-glass` from Task 1.
- Produces: `data-testid="hero-glass"` and `data-testid="hero-impact"` layout anchors used by responsive tests.

- [ ] **Step 1: Add the failing hero-scale and overflow tests**

At a 1440×1000 viewport, assert the impact artwork is at least 42% of the hero glass width. At a 390×844 viewport, assert the document has no horizontal overflow.

```ts
test("hero artwork is dominant without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const hero = page.getByTestId("hero-glass");
  const impact = page.getByTestId("hero-impact");
  const heroBox = await hero.boundingBox();
  const impactBox = await impact.boundingBox();
  expect(heroBox).not.toBeNull();
  expect(impactBox).not.toBeNull();
  expect(impactBox!.width / heroBox!.width).toBeGreaterThanOrEqual(0.42);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
```

- [ ] **Step 2: Run the hero test and confirm failure**

Run: `pnpm exec playwright test tests/e2e/responsive.spec.ts --grep "hero artwork is dominant"`

Expected: FAIL because the test IDs are missing or the artwork ratio is below 0.42.

- [ ] **Step 3: Implement the hero rebalance**

Add the test IDs, change the desktop grid to give the art more room, remove the component's restrictive `max-w-[760px]`, and allow a controlled desktop scale/offset while keeping mobile width constrained. In `hero.tsx`, replace the current glass-card and grid opening tags with:

```tsx
<div data-testid="hero-glass" className="gd-glass relative overflow-hidden rounded-[2rem] px-6 py-10 sm:px-10 lg:px-12 lg:py-16">
  <div className="relative grid items-center gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:gap-0">
```

In `hero-impact.tsx`, replace the current wrapper opening tag with the following tag, add `data-testid`, and change the existing `sizes` prop to the shown value. Preserve the current image source, alt text, intrinsic dimensions, priority flag and `className` unchanged.

```tsx
<div
  data-testid="hero-impact"
  className="relative mx-auto w-[112%] max-w-none -translate-x-[2%] sm:w-full lg:w-[128%] lg:-translate-x-[8%]"
>
```

```tsx
sizes="(min-width: 1280px) 840px, (min-width: 1024px) 58vw, 94vw"
```

- [ ] **Step 4: Run the hero test and confirm it passes**

Run: `pnpm exec playwright test tests/e2e/responsive.spec.ts --grep "hero artwork is dominant"`

Expected: PASS at both viewport sizes.

- [ ] **Step 5: Commit the hero change**

```bash
git add src/components/home/hero.tsx src/components/home/hero-impact.tsx tests/e2e/responsive.spec.ts
git commit -m "feat: enlarge hero energy artwork"
```

### Task 3: Map storefront surfaces to the material tiers

**Files:**
- Modify: `src/components/home/category-tiles.tsx`
- Modify: `src/components/home/competitive-picks.tsx`
- Modify: `src/components/home/trust.tsx`
- Modify: `src/components/product/product-card.tsx`
- Modify: `src/components/product/gallery.tsx`
- Modify: `src/components/product/product-details.tsx`
- Modify: `src/components/catalog/catalog-view.tsx`
- Modify: `src/components/catalog/filters-sheet.tsx`
- Modify: `src/components/layout/header.tsx`
- Modify: `src/components/layout/mobile-menu.tsx`
- Modify: `src/components/layout/bottom-tab-bar.tsx`
- Modify: `src/components/product/sticky-buy-bar.tsx`
- Modify: `src/app/account/page.tsx`
- Modify: `src/app/carrello/cart-client.tsx`
- Modify: `src/app/checkout/checkout-client.tsx`
- Modify: `tests/e2e/responsive.spec.ts`

**Interfaces:**
- Consumes: all glass utilities from Task 1.
- Produces: consistent class mapping: promotional cards use `gd-glass-card`, functional panels use `gd-glass-panel`, compact navigation uses `gd-glass-compact`, interactive cards add `gd-glass-interactive`, and dark trust content uses `gd-glass-dark`.

- [ ] **Step 1: Add the failing cross-route surface test**

Assert that home, catalog, product, cart, checkout and account each expose the expected shared tier and that representative surfaces retain non-`none` backdrop filtering.

```ts
test("storefront routes share the liquid glass vocabulary", async ({ page }) => {
  const routes = ["/", "/negozio", "/prodotto/wizard-arrow-4-80b", "/carrello", "/checkout", "/account"];
  for (const route of routes) {
    await page.goto(route);
    const surface = page.locator(".gd-glass-card, .gd-glass-panel, .gd-glass-compact");
    expect(await surface.count()).toBeGreaterThan(0);
    const filter = await surface.first().evaluate((element) => {
      const style = getComputedStyle(element);
      return style.backdropFilter || style.webkitBackdropFilter;
    });
    expect(filter).not.toBe("none");
  }
});
```

- [ ] **Step 2: Run the cross-route test and confirm failure**

Run: `pnpm exec playwright test tests/e2e/responsive.spec.ts --grep "storefront routes share"`

Expected: FAIL on routes that still expose only the old `gd-glass-strong` utility or opaque navigation bars.

- [ ] **Step 3: Replace the legacy tier intentionally**

Apply these exact rules:

- Category tiles, product cards, competitive cards and account option cards: `gd-glass-card gd-glass-interactive`.
- Gallery, product details, catalog filters, cart rows/summary, checkout fieldsets/order summary: `gd-glass-panel`.
- Header, mobile menu, bottom tab bar, sticky buy bar and compact floating controls: `gd-glass-compact`.
- Trust band nested icon surfaces: `gd-glass-dark`; keep the graphite parent surface authoritative.
- Keep selected, available, incoming, sold-out and preorder backgrounds semantic instead of converting them to neutral glass.

- [ ] **Step 4: Run the focused cross-route and existing commerce tests**

Run: `pnpm exec playwright test tests/e2e/responsive.spec.ts --grep "storefront routes share" && pnpm test`

Expected: the Playwright test passes and all Vitest tests pass.

- [ ] **Step 5: Commit the surface mapping**

```bash
git add src/components src/app/account/page.tsx src/app/carrello/cart-client.tsx src/app/checkout/checkout-client.tsx tests/e2e/responsive.spec.ts
git commit -m "feat: unify storefront glass surfaces"
```

### Task 4: Visual review and complete verification

**Files:**
- Modify only files from Tasks 1–3 when the live visual review identifies a concrete defect.

**Interfaces:**
- Consumes: completed material tiers, hero layout and component mapping.
- Produces: a verified desktop/mobile storefront with no console errors, overflow or broken checks.

- [ ] **Step 1: Inspect the live preview at desktop width**

Open `http://localhost:3000/` at the normal in-app browser viewport. Verify the hero art reads as the dominant right-side element, card surfaces share the same rim/highlight logic, and product content remains crisp.

- [ ] **Step 2: Inspect representative functional routes**

Open `/negozio`, `/prodotto/wizard-arrow-4-80b`, `/carrello`, `/checkout` and `/account`. Verify the glass hierarchy is coherent while panel copy, inputs, status colors and focus indicators remain legible.

- [ ] **Step 3: Inspect mobile width and correct only observed defects**

Use a 390×844 viewport. Verify the hero stays contained, fixed bars do not overlap content incorrectly and `document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1`.

- [ ] **Step 4: Run the full verification suite**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm exec playwright test && pnpm build`

Expected: all commands exit 0 with no failing tests.

- [ ] **Step 5: Review the final diff**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only intentional implementation files, pre-existing user changes and generated screenshot updates are listed.
