# GEAR//DROP Liquid Glass Coherence

## Goal

Make liquid glass the consistent material language of the entire storefront while preserving the fast, clean and elite character of GEAR//DROP. The hero remains the visual reference; other surfaces inherit its material properties without becoming uniformly transparent or decorative.

## Visual principles

- Coherence means a shared material system, not identical opacity everywhere.
- Glass is restrained: fine white rims, controlled blur, subtle internal highlights and diffuse shadows.
- Violet and lime remain accents. They may tint reflections and active states, but never become large decorative glows.
- Hierarchy comes from opacity, elevation and scale. Functional surfaces remain more opaque than promotional surfaces.
- Motion is limited to small elevation and highlight changes on hover and respects reduced-motion preferences.

## Surface system

Create four reusable glass tiers in the global design layer:

1. **Display glass** — the most translucent tier, used by the hero and large promotional fields.
2. **Card glass** — slightly more opaque, used by category, product, competitive, account and informational cards.
3. **Panel glass** — the most legible light tier, used by checkout, cart, filters, forms and product-detail panels.
4. **Dark glass** — used on the trust band and dark/footer-adjacent surfaces.

All tiers share the same rim, saturation, shadow logic and corner vocabulary. Compact controls receive a small glass treatment derived from the same tokens.

## Hero

- Increase the right-side energy artwork by roughly 30–35% on desktop.
- Let the artwork occupy more of the right column and approach the card edge without clipping its meaningful energy trails.
- Rebalance the desktop grid so the larger art does not compress the headline or CTA group.
- Keep mobile contained and readable; scale up modestly there rather than forcing desktop overflow.
- Preserve the supplied artwork without filters that wash out its colors.

## Site application

- Home: category tiles, product cards, competitive cards and trust surfaces use the shared tiers.
- Catalog and PDP: filters, product gallery, detail panels, product cards and compact controls use the same material vocabulary.
- Cart, checkout and account: use panel glass for readability, with selected and status states remaining semantically distinct.
- Navigation: header, mobile menu, bottom navigation and sticky purchase bar use compact glass where translucency is safe.
- Footer: remains dark and authoritative; only nested surfaces and separators adopt dark-glass cues so the footer retains visual weight.
- Inputs, badges and destructive/status feedback remain materially compatible but keep their semantic colors and sufficient contrast.

## Interaction and accessibility

- Hover raises eligible cards by no more than 4px and introduces a restrained violet reflection.
- Focus states remain explicit and are never replaced by glass highlights.
- Text-bearing surfaces maintain sufficient opacity and contrast over the ambient background.
- Backdrop-filter fallbacks remain readable because each tier has a real translucent background color.
- Reduced-motion mode removes lift and animated sheen while retaining static depth.

## Responsive behavior

- Desktop emphasizes hero scale and layered depth.
- Tablet preserves the two-column hero until the existing breakpoint becomes cramped.
- Mobile stacks content, keeps artwork inside the card and reduces blur/shadow cost where needed.
- No horizontal overflow is introduced by oversized artwork or specular pseudo-elements.

## Verification

- Compare the live home page at desktop and mobile widths.
- Spot-check catalog, product detail, cart, checkout and account surfaces for material consistency.
- Verify no clipping, horizontal overflow, unreadable text or hidden focus indicators.
- Run lint, type checking, unit tests and a production build.

## Out of scope

- Reworking information architecture, copy, commerce logic or product imagery.
- Adding ornamental animations, heavy glow effects or a new color palette.
- Making every element translucent regardless of its functional role.
