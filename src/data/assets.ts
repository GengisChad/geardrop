/**
 * Single source of truth for every binary path in the project.
 *
 * Nothing else in the codebase should hardcode a path under /public. Swapping the
 * placeholder product cut-outs for real photography is a change to this file plus the
 * files on disk — no component needs to be touched.
 *
 * Provenance: see scripts/build-assets.py and docs/reference-audit.md.
 */

export const brand = {
  /** Emblem + wordmark. Supplied asset — never redraw, recolour or outline it. */
  lockup: "/brand/lockup.png",
  /** Wordmark only. Never reconstruct this with a font. */
  wordmark: "/brand/wordmark.png",
  /** The repeatable mark: favicon, loader, mobile menu, decorative details. */
  emblem: "/brand/emblem.png",
  emblem192: "/brand/emblem-192.png",
  emblem512: "/brand/emblem-512.png",
  appleIcon: "/brand/emblem-180.png",
} as const;

/**
 * Intrinsic sizes of the processed brand files, so next/image never guesses.
 * These differ from the supplied files: the source art has no alpha channel — it ships
 * with a fake-transparency checkerboard painted in — so build-assets.py strips that and
 * trims to the artwork. Keep in sync with the script's output.
 */
export const brandSize = {
  lockup: { width: 2362, height: 399 },
  wordmark: { width: 2159, height: 194 },
  emblem: { width: 1017, height: 940 },
} as const;

export type ProductImage = {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
};

/**
 * Product art, cut out of the supplied mockups (the only source provided — no
 * standalone photography came with the brief, and downloading imagery is forbidden).
 * Resolutions are therefore modest; see docs/reference-audit.md §9.
 */
export const productImages = {
  "stadio-beystadium-x-attack-set": [
    {
      src: "/products/stadio-beystadium-x-attack-set-1.png",
      width: 530,
      height: 472,
      alt: "Stadio Beystadium X Attack Set con arena verde, due trottole e due lanciatori",
    },
  ],
  "wizard-arrow-4-80b": [
    {
      src: "/products/wizard-arrow-4-80b-1.png",
      width: 213,
      height: 195,
      alt: "Trottola Wizard Arrow 4-80B nera e oro",
    },
  ],
  "cobalt-dragoon-2-60c": [
    {
      src: "/products/cobalt-dragoon-2-60c-1.png",
      width: 430,
      height: 459,
      alt: "Confezione Cobalt Dragoon 2-60C con lanciatore blu e trottola",
    },
    {
      src: "/products/cobalt-dragoon-2-60c-2.png",
      width: 261,
      height: 171,
      alt: "Lanciatore blu e trottola Cobalt Dragoon 2-60C",
    },
  ],
  "phoenix-wing-9-60gf": [
    {
      src: "/products/phoenix-wing-9-60gf-1.png",
      width: 189,
      height: 167,
      alt: "Trottola Phoenix Wing 9-60GF rossa e oro",
    },
  ],
  "shark-edge-3-60lf": [
    {
      src: "/products/shark-edge-3-60lf-1.png",
      width: 194,
      height: 155,
      alt: "Trottola Shark Edge 3-60LF argento e teal",
    },
  ],
  "dran-sword-4-80db": [
    {
      src: "/products/dran-sword-4-80db-1.png",
      width: 191,
      height: 151,
      alt: "Trottola Dran Sword 4-80DB bianca e viola con lanciatore",
    },
  ],
  "dran-buster-1-60a": [
    {
      src: "/products/dran-buster-1-60a-1.png",
      width: 176,
      height: 165,
      alt: "Trottola Dran Buster 1-60A rossa e argento",
    },
  ],
  "sneak-attack-battle-set": [
    {
      src: "/products/sneak-attack-battle-set-1.png",
      width: 172,
      height: 168,
      alt: "Confezione Sneak Attack Battle Set",
    },
  ],
} as const satisfies Record<string, readonly ProductImage[]>;

export type ProductSlug = keyof typeof productImages;

/** Tile art for categories with no sellable SKU of their own. */
export const categoryArt = {
  lanciatori: { src: "/categories/lanciatori.png", width: 107, height: 136 },
  accessori: { src: "/categories/accessori.png", width: 118, height: 144 },
} as const;

/**
 * The supplied mockups. Reference only — deliberately not imported by any component.
 * Listed so the paths stay tracked and reviewable. (audit §7.9)
 */
export const reference = {
  homeUpper: "/reference/home-upper.png",
  homeLower: "/reference/home-lower.png",
  catalogDesktop: "/reference/catalog-desktop.png",
  catalogMobile: "/reference/catalog-mobile.png",
  pdpStadiumDesktop: "/reference/pdp-stadium-desktop.png",
  pdpCobaltMobile: "/reference/pdp-cobalt-mobile.png",
  designSystem: "/reference/design-system.png",
} as const;
