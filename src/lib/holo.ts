import type { CSSProperties } from "react";
import type { BladeType, CategorySlug, Product } from "@/lib/commerce/types";
import { BLADE_TYPE_LABEL, STOCK_LABEL } from "@/lib/labels";

/**
 * Presentation helpers for the Holo Drop cards: foil colours, the short labels a card
 * prints and the scarcity line. Pure functions, so server and client render the same.
 */

export type HoloPalette = Readonly<{ f1: string; f2: string; f3: string; f4: string; glow: string }>;

const palette = (f1: string, f2: string, f3: string, f4: string, glow: string): HoloPalette => ({ f1, f2, f3, f4, glow });

/** Foil colours taken from each pack's own artwork, so a card shimmers like its box. */
const BY_SLUG: Readonly<Record<string, HoloPalette>> = {
  "glory-valkerion-lf": palette("#fff3c4", "#c6ff00", "#9d6bff", "#ffd36b", "rgba(255, 211, 107, 0.4)"),
  "hurricane-enlil-is-7-55t": palette("#c9fbff", "#3cf0ff", "#3a5bff", "#c6ff00", "rgba(60, 240, 255, 0.4)"),
  "shatter-horus-9-65gb": palette("#ffd3db", "#ff5470", "#7a3cff", "#e8ecf5", "rgba(255, 84, 112, 0.4)"),
  "cobalt-dragoon-2-60c": palette("#d6f0ff", "#4db8ff", "#3a5bff", "#c6ff00", "rgba(77, 184, 255, 0.3)"),
  "soar-phoenix-9-60gf": palette("#ffe2c4", "#ff7a3d", "#ff2d55", "#ffd36b", "rgba(255, 122, 61, 0.3)"),
  "saber-samurai-2-70l": palette("#eadcff", "#b07cff", "#7a3cff", "#ff7a3d", "rgba(176, 124, 255, 0.3)"),
  "blast-pegasus-a-tr": palette("#f1ffc4", "#c6ff00", "#1fd1a5", "#3cf0ff", "rgba(198, 255, 0, 0.3)"),
  "drop-attack-battle-set": palette("#d6e2ff", "#6b8cff", "#7a3cff", "#3cf0ff", "rgba(107, 140, 255, 0.3)"),
  "sneak-attack-battle-set": palette("#d9ffe6", "#3dff8a", "#1fae5b", "#c6ff00", "rgba(61, 255, 138, 0.3)"),
};

const BY_TYPE: Readonly<Record<BladeType, HoloPalette>> = {
  attacco: palette("#f1ffc4", "#c6ff00", "#7a3cff", "#3cf0ff", "rgba(198, 255, 0, 0.3)"),
  bilanciato: palette("#c9fbff", "#3cf0ff", "#3a5bff", "#c6ff00", "rgba(60, 240, 255, 0.35)"),
  stamina: palette("#ffd3db", "#ff5470", "#7a3cff", "#e8ecf5", "rgba(255, 84, 112, 0.35)"),
  difesa: palette("#d6e2ff", "#6b8cff", "#7a3cff", "#3cf0ff", "rgba(107, 140, 255, 0.3)"),
};

const DEFAULT_PALETTE = palette("#eadcff", "#b07cff", "#7a3cff", "#c6ff00", "rgba(122, 60, 255, 0.35)");

export function holoPalette(product: Pick<Product, "slug" | "bladeType">): HoloPalette {
  return BY_SLUG[product.slug] ?? (product.bladeType ? BY_TYPE[product.bladeType] : DEFAULT_PALETTE);
}

/** The palette as the CSS custom properties `.gd-holo` reads. */
export function holoStyle(product: Pick<Product, "slug" | "bladeType">): CSSProperties {
  const { f1, f2, f3, f4, glow } = holoPalette(product);
  return { "--f1": f1, "--f2": f2, "--f3": f3, "--f4": f4, "--glow": glow } as CSSProperties;
}

const KIND_LABEL: Readonly<Record<CategorySlug, string>> = {
  "beyblade-x": "Beyblade X",
  lanciatori: "Lanciatore",
  stadi: "Stadio",
  accessori: "Accessorio",
};

/** The card's type chip: the blade type for a top, the kind of item otherwise. */
export function kindLabel(product: Pick<Product, "bladeType" | "category">): string {
  return product.bladeType ? BLADE_TYPE_LABEL[product.bladeType] : KIND_LABEL[product.category];
}

/** The two-letter product line ("UX") from a spec such as "UX (Infinity Starter Pack)". */
export function productLine(product: Pick<Product, "specs">): string | null {
  const value = product.specs.find((spec) => spec.label === "Linea")?.value ?? "";
  return /^([A-Z]{2})\b/.exec(value)?.[1] ?? null;
}

/** Scarcity line: the remaining allocation when it is small, the plain status otherwise. */
export function availabilityLine(product: Pick<Product, "stock" | "availableQuantity">): string {
  if (product.stock === "esaurito") return STOCK_LABEL.esaurito;
  const left = product.availableQuantity;
  if (left !== undefined && left > 0 && left <= 10) return `Solo ${left} ${left === 1 ? "pezzo" : "pezzi"}`;
  return STOCK_LABEL[product.stock];
}

/**
 * A product name for display that never wraps inside its part code: a word joiner after each
 * hyphen keeps "7-55T" whole. Use it for visible text only, never for alt text or labels.
 */
export function displayName(name: string): string {
  return name.replaceAll("-", "-⁠");
}

/** A name without its trailing part code, for tight labels: "Glory Valkerion LF" → "Glory Valkerion". */
export function shortName(name: string): string {
  const words = name.split(" ");
  return words.length > 2 ? words.slice(0, 2).join(" ") : name;
}
