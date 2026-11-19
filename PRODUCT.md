# Product

## Register

brand

The storefront (home, shop, product pages) is the brand surface. Cart, checkout and the admin are task surfaces and follow the product register: familiar controls, no decoration in the way of paying.

## Users

Italian Beyblade X players and the parents who buy for them.
- Most arrive on a phone, from Instagram and YouTube content by @GengisChad, often one-handed and with little patience.
- They know the pieces by name (Soar Phoenix, Glory Valkerion, Bit LF, 9-60) and come for a specific top, an arena or a deal.
- Parents need to understand quickly what is in the box, whether it ships now, and what it costs to ship.

## Product Purpose

GEAR//DROP (geardropshop.it) sells original Hasbro Beyblade X online, plus Takara Tomy pieces: starters, boosters, an all-in-one stadium set, launchers and grips from its own shelf (since 2026-11-06), limited editions on consignment.
- Online only: InPost point 5,65 €, Poste home 6,65 €, free shipping from 100 €.
- Release pre-orders are sold apart from pieces in stock. A sold-out product offers "Avvisami".
- Success means more completed orders from mobile visitors: a clear price, an honest availability, the shipping cost and an obvious next step on every product.

## Brand Personality

Tech, energetic, honest. "X-Rail" (owner, 2026-10-23), built on the 2026-09-15 "Holo Drop" dark arena: lime and violet on near-black, Anybody in three widths (expanded italic display and prices, condensed product names, normal body) with JetBrains Mono for part codes, and a vocabulary taken from the logo and the toy:
- slanted "//" buttons and a lime highlight slab;
- die-cut stickers with the logo's white keyline, holographic foil on new releases only;
- the part code split from the name, its ratchet number printed behind the packshot;
- the stadium's toothed X-line rail for dividers and the free-shipping meter.

Over it, "Glitch 2077" (owner, 2026-11-17, picked from three looks shown on the real pages): the look of his own carousels, standing still on the shop.
- the headline split out of register, cyan to the left and magenta to the right, its slab cut in steps;
- scanlines on the ground instead of the slash hatch, a measuring grid behind each packshot;
- HUD corners on the product cards, cyan part codes and rails, a terminal prompt before each shelf title;
- product names in JetBrains Mono capitals, prices in lime with one magenta ghost.

Lime means "ships now / buy", violet means "on its way" (pre-orders); cyan and magenta are seconds and never carry a meaning of their own. Energy comes from the products and the type, never from motion that slows the page: the glitch never flickers. The copy is short, direct Italian and never promises what the shop cannot keep.

## Anti-references

- A generic Shopify or marketplace template (white grid, stock badges, "Best seller" ribbons everywhere).
- Motion-heavy sections like the old "battle" animation, which the owner removed on 2026-09-21.
- Fake urgency or invented numbers (counters, reviews, "X people are watching").
- Changing the owner's home order: best sellers, then new arrivals and pre-orders, then ready to ship, then the rest. A spotlight the owner asks for (`SPOTLIGHT_SLUGS`, since 2026-11-06) goes before them, and only while the owner wants it.

## Design Principles

1. **Sell on the phone first.** Price, availability and the add-to-cart action must sit in reach of the thumb and be readable at a glance.
2. **Honest by default.** Every number shown is real: stock, savings against the packs, delivery times. A promise the shop cannot keep is a bug.
3. **The product is the hero.** The owner's own packshots carry the page; type and colour frame them, they do not compete with them. When a photo is too small, the manufacturer's official packshot may replace it if it is faithful to the edition sold and carries no watermark (owner, 2026-10-29); each one's source is in `docs/product-photo-sources.md`.
4. **Keep the X-Rail vocabulary, in its Glitch 2077 dress.** Dark arena, lime/violet with their meanings, the slash, the sticker, the part code and the rail, with the split headline, the scanlines and the HUD corners over them; no ambient glows, gradient text, frosted glass or a kicker above every section. Cart, checkout and account stay plain: no split on their titles.
5. **Fast and calm.** No heavy animation; motion only for state and feedback. The X-Rail motion set (owner, 2026-10-29: the toothed free-shipping rail, product clips in the gallery, the cut of light on add, landing stickers, the sliding ratchet number, the card-to-product photo) follows it: each animation runs once and settles, nothing delays the first paint, and reduced motion stops it all. Three more joined it on 2026-11-19, picked by the owner from touchable proposals: the photo's flight into the cart with the drop sheet and its rail lit from the server's quote, the scan-in of a shelf arriving from below the fold (in place of the fade every section shared), and the micro-answers (rolling digits on quoted totals, the heart splitting out of register, the tab bar's sliding marker, a short vibration on Android).

## Accessibility & Inclusion

WCAG 2.2 AA:
- body text contrast ≥ 4.5:1 on the dark background;
- touch targets ≥ 44 px;
- visible focus states;
- every animation respects `prefers-reduced-motion`;
- meaning never carried by colour alone (stock states use words as well as colour).
