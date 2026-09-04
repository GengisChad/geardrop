# GearDrop preorder go-live design

**Date:** 2026-09-04  
**Base:** `origin/main` at `2264f497a48a30e4a78551b89bc4904da9be95e0`  
**Goal:** publish the owner-supplied six-product preorder catalogue, remove unsupported claims, add privacy-minimised Vercel page analytics, and deploy the verified result through the repository's `main` branch.

## Scope and invariants

- The six owner-supplied products and their prices are the only products presented by the static catalogue.
- Every product is a preorder with a reviewed allocation: 10, 60, 30, 30, 30, and 30 units respectively.
- Supabase remains authoritative whenever `COMMERCE_PROVIDER=supabase`; bundled data is only the safe storefront fallback.
- A database quote and `create_order` retain the final word on availability. The browser may prevent an obviously excessive quantity, but it never invents stock or pricing.
- Existing per-line limit `10` remains in force. Available quantity is therefore displayed independently from the per-order cap.
- A migration may replace known seeded catalogue content and archive known mock products, but must not reset a quantity already consumed by a prior preorder.
- No migration enables order intake. `site_settings.accept_orders` remains an owner-controlled operational gate.
- The site must not present fabricated community size, ratings, bestseller ranks, newsletter success, loyalty benefits, bundle savings, payment completion, or expedited shipping.
- “14 days” means dispatch from GearDrop within fourteen days after order confirmation; carrier transit begins after dispatch.
- Terms and privacy placeholders are not legal copy. They remain non-published and order intake is treated as blocked until seller identity and reviewed legal texts exist.
- Vercel Analytics records public storefront pageviews only. Admin, account, and authentication routes are excluded; URL query strings and fragments are removed; no custom order event or personal data is sent.
- Canonical URLs are self-referential and query-free for public indexable routes.

## Catalogue and availability model

The `Product` storefront projection gains an optional `availableQuantity`. Static products receive the supplied allocation. Supabase catalogue reads project `preorder_allocation` for preorder rows and `stock_quantity` otherwise. Cart quotes expose the same available quantity from the authoritative row used to validate the line.

The product page renders “N pre-ordini rimasti” and caps its stepper at `min(10, availableQuantity)`. The cart renders the current remainder and applies the same cap. A persisted cart that exceeds a newer, lower allocation remains visible with the existing line error and cannot proceed until reduced or removed.

The forward migration upserts the six products, their reviewed content and media, sets preorder status, and seeds allocation only for a row that has not already entered the same preorder campaign. Re-running the migration cannot replenish a partially consumed allocation. Known old mock products are archived rather than deleted so historical references remain valid.

## Truthful storefront

The home page keeps the existing visual system but uses neutral sections: “In evidenza”, “Pre-ordini aperti”, and product discovery. Rating UI and `AggregateRating` structured data are absent at zero reviews. The fake Club and bundle sections are hidden. The newsletter control is removed until a backend exists. Footer community copy describes the project without a number.

Shipping, hero, trust, FAQ, and product-detail copy use the preorder dispatch window and distinguish it from carrier transit. Checkout keeps the already-truthful statement that no payment is taken and no automatic email is sent.

Generated Supabase seed content is updated only through its TypeScript sources and generator. A separate guarded forward migration updates known stale CMS defaults and unpublishes only legal rows that still contain the known placeholder marker.

## Analytics and metadata

`@vercel/analytics@2.0.1` is mounted in the storefront layout only when `VERCEL_ENV=production`. A pure sanitizer applies exact path boundaries, drops sensitive routes, removes query/hash data, and fails closed for invalid URLs. The first release uses pageviews only because checkout registers an unpaid order and plan support for custom events is not guaranteed.

The root layout no longer imposes `/` as the canonical for every route. Each indexable route owns a clean self-canonical; search/filter query variants canonicalize to the route without query parameters.

## Deployment and rollback

All local gates and focused browser checks run in the isolated worktree `C:\Users\feder\Downloads\GearDrop-preorder-production`. After review, the branch is fetched and must still be a descendant of current `origin/main`; its HEAD is pushed non-force to `origin/main`, which triggers the existing Vercel Git deployment. The production domain `https://geardropshop.it` is then checked for the exact commit, catalogue copy, canonicals, and Analytics script/request behavior.

Rollback is a normal revert commit pushed to `main`; no database reset, force push, stock reset, or destructive rollback is allowed. Database migrations remain forward-only.
