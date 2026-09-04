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

/** Owner-supplied packshots, normalised to square WebP tiles. */
export const productImages = {
  "cobalt-dragoon-2-60c": [
    {
      src: "/products/cobalt-dragoon-2-60c.webp",
      width: 1000,
      height: 1000,
      alt: "Confezione Beyblade X Cobalt Dragoon 2-60C con lanciatore a corda blu e trottola",
    },
  ],
  "soar-phoenix-9-60gf": [
    {
      src: "/products/soar-phoenix-9-60gf.webp",
      width: 1000,
      height: 1000,
      alt: "Confezione Beyblade X Soar Phoenix 9-60GF rossa con lanciatore e trottola",
    },
  ],
  "saber-samurai-2-70l": [
    {
      src: "/products/saber-samurai-2-70l.webp",
      width: 1000,
      height: 1000,
      alt: "Confezione Beyblade X Saber Samurai 2-70L viola con lanciatore a impugnatura e trottola",
    },
  ],
  "blast-pegasus-a-tr": [
    {
      src: "/products/blast-pegasus-a-tr.webp",
      width: 1000,
      height: 1000,
      alt: "Beyblade X Blast Pegasus A Tr con Clip & Rip Launcher verde e trottola",
    },
  ],
  "drop-attack-battle-set": [
    {
      src: "/products/drop-attack-battle-set.webp",
      width: 1000,
      height: 1000,
      alt: "Beyblade X Drop Attack Battle Set: stadio blu, due trottole e due lanciatori",
    },
  ],
  "sneak-attack-battle-set": [
    {
      src: "/products/sneak-attack-battle-set.webp",
      width: 1000,
      height: 1000,
      alt: "Beyblade X Sneak Attack Battle Set: stadio verde, due trottole e due lanciatori",
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
