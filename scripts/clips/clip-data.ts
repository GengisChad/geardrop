import { cutoutSrc } from "../../src/data/assets";
import { PRODUCTS } from "../../src/data/catalog";
import { bladeName, holoPalette, partCode, partMark } from "../../src/lib/holo";
import { BLADE_TYPE_LABEL } from "../../src/lib/labels";

/**
 * Which products get a clip, which two of their catalogue features the clip calls out (by their
 * exact titles), and whether the tagline runs. A tagline that talks about price stays out: a
 * video cannot follow a price change. Keep this list equal to `productClips` in data/assets.ts.
 */
export type ClipSpec = {
  readonly slug: string;
  readonly callouts: readonly [string, string];
  readonly tagline: boolean;
  /**
   * The plate colour, taken from the pack's artwork, for a product with no palette of its own in
   * holo.ts: there it falls back to violet, which in X-Rail means "on its way" (pre-orders). The
   * site cards keep holo.ts until the owner adds these palettes there.
   */
  readonly tint?: string;
};

export const CLIP_SPECS: readonly ClipSpec[] = [
  { slug: "glory-valkerion-lf", callouts: ["Ratchet integrato", "Starter completo"], tagline: true },
  { slug: "wand-wizard-1-60r", callouts: ["La blade più larga", "Starter completo"], tagline: true, tint: "#3dff8a" },
  // "Il Low Rush al prezzo di un booster" compares prices, so this one runs without its tagline.
  { slug: "impact-drake-9-60lr", callouts: ["Bit Low Rush", "Solo la trottola"], tagline: false, tint: "#ff5470" },
  { slug: "hover-wyvern-3-85n", callouts: ["Bit Needle", "Solo la trottola"], tagline: true, tint: "#1fd1a5" },
  { slug: "soar-phoenix-9-60gf", callouts: ["Upper Attack", "Starter completo"], tagline: true },
];

/** What a clip composition reads (window.__CLIP__): facts that stay true, and nothing else. */
export type ClipData = {
  readonly slug: string;
  readonly name: string;
  readonly code: string;
  readonly mark: string | null;
  readonly type: string | null;
  readonly callouts: readonly [string, string];
  readonly tagline: string | null;
  readonly tint: string;
  /** Public path of the transparent cut-out. */
  readonly cutout: string;
};

export function clipData(spec: ClipSpec): ClipData {
  const product = PRODUCTS.find((candidate) => candidate.slug === spec.slug);
  if (!product) throw new Error(`No product "${spec.slug}" in the catalogue.`);
  if (product.bundleOf) throw new Error(`"${spec.slug}" is a bundle: clips show one product.`);
  // Every clip stamps the part code; render.mjs refuses a clip without one.
  const code = partCode(product);
  if (!code) throw new Error(`"${spec.slug}" has no part code to stamp.`);
  const titles = new Set(product.features.map((feature) => feature.title));
  for (const callout of spec.callouts) {
    if (!titles.has(callout)) throw new Error(`"${spec.slug}" lists no feature "${callout}" in the catalogue.`);
  }
  const image = product.images[0];
  const cutout = image ? cutoutSrc(image.src) : null;
  if (!cutout) throw new Error(`"${spec.slug}" has no cut-out to animate.`);
  const [first, second] = spec.callouts;
  return {
    slug: product.slug,
    name: bladeName(product.name, code),
    code,
    mark: partMark(code),
    type: product.bladeType ? BLADE_TYPE_LABEL[product.bladeType] : null,
    callouts: [first.toLocaleUpperCase("it-IT"), second.toLocaleUpperCase("it-IT")],
    tagline: spec.tagline ? product.tagline : null,
    tint: spec.tint ?? holoPalette(product).f2,
    cutout,
  };
}
