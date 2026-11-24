import type { ProductImage } from "@/data/assets";
import type { BladeType, CategorySlug, Product, PromoTag } from "./types";

/**
 * What the back office has changed on a product the shop sells from its catalogue (owner,
 * 2026-11-24: "se da scheda prodotto cambio nome, sku o simile la pagina effettivamente non si
 * aggiorna"). The shop reads its copy from src/data/catalog.ts and, until now, only price and
 * stock from the database, so a name saved on the product sheet never reached the page.
 *
 * Each save on the sheet records which fields it changed in products.storefront_fields, and the
 * shop takes from the database exactly those fields: whatever the back office never touched keeps
 * the catalogue's copy, so an old text left in a database row cannot come back on the page by
 * itself. The SKU is not here because the shop never prints it: it lives in the orders and the
 * back office, where the sheet already saves it.
 */

export const STOREFRONT_FIELDS = [
  "name",
  "tagline",
  "description",
  "category",
  "blade_type",
  "specs",
  "features",
  "box_contents",
  "images",
  "tags",
] as const;
export type StorefrontField = (typeof STOREFRONT_FIELDS)[number];

const KNOWN_FIELDS: ReadonlySet<string> = new Set(STOREFRONT_FIELDS);
const CATEGORIES: ReadonlySet<string> = new Set<CategorySlug>(["beyblade-x", "lanciatori", "stadi", "accessori"]);
const BLADE_TYPES: ReadonlySet<string> = new Set<BladeType>(["attacco", "difesa", "stamina", "bilanciato"]);
const PROMO_TAGS: ReadonlySet<string> = new Set<PromoTag>(["novita", "offerta", "limited", "esclusiva"]);

type Ordered = { readonly sort_order: number };

/** A product row as the shop reads it, with the lists the sheet edits. */
export type StorefrontContentRow = {
  readonly slug: string;
  readonly storefront_fields: readonly string[] | null;
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  readonly blade_type: string | null;
  readonly category?: { readonly slug: string } | readonly { readonly slug: string }[] | null;
  readonly specs?: readonly (Ordered & { readonly label: string; readonly value: string })[] | null;
  readonly features?: readonly (Ordered & { readonly title: string; readonly description: string })[] | null;
  readonly box_contents?: readonly (Ordered & { readonly content: string })[] | null;
  readonly images?: readonly (Ordered & {
    readonly src: string;
    readonly width: number;
    readonly height: number;
    readonly alt: string;
    readonly published: boolean;
    readonly is_primary: boolean;
  })[] | null;
  readonly tags?: readonly { readonly tag: string }[] | null;
};

/** The fields already recorded plus the new ones, without repeats and in a stable order. */
export function mergeStorefrontFields(current: readonly string[] | null | undefined, added: readonly StorefrontField[]): StorefrontField[] {
  const wanted = new Set<string>([...(current ?? []), ...added]);
  return STOREFRONT_FIELDS.filter((field) => wanted.has(field));
}

/** The content fields a save on the sheet changed, comparing the row before with what was typed. */
export function changedContentFields(
  before: { readonly name: string; readonly tagline: string; readonly description: string; readonly category_id: number; readonly blade_type: string | null },
  after: { readonly name: string; readonly tagline: string; readonly description: string; readonly categoryId: number; readonly bladeType: string | null },
): StorefrontField[] {
  const fields: StorefrontField[] = [];
  if (before.name.trim() !== after.name.trim()) fields.push("name");
  if (before.tagline.trim() !== after.tagline.trim()) fields.push("tagline");
  if (before.description.trim() !== after.description.trim()) fields.push("description");
  if (before.category_id !== after.categoryId) fields.push("category");
  if ((before.blade_type ?? null) !== (after.bladeType ?? null)) fields.push("blade_type");
  return fields;
}

function ordered<T extends Ordered>(values: readonly T[] | null | undefined): readonly T[] {
  return [...(values ?? [])].sort((left, right) => left.sort_order - right.sort_order);
}

function first<T>(value: T | readonly T[] | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? ((value[0] as T | undefined) ?? null) : (value as T);
}

/**
 * The shop serves photos from its own files only (next.config: no remote images), so a photo is
 * taken from the sheet only when it is one of those files; one uploaded to the media library is
 * left out rather than breaking the page.
 */
function localImages(row: StorefrontContentRow): readonly ProductImage[] {
  const published = [...(row.images ?? [])]
    .filter((image) => image.published && image.src.startsWith("/") && !image.src.startsWith("//"))
    .filter((image) => Number.isSafeInteger(image.width) && image.width > 0 && Number.isSafeInteger(image.height) && image.height > 0)
    .sort((left, right) => Number(right.is_primary) - Number(left.is_primary) || left.sort_order - right.sort_order);
  return published.map(({ src, width, height, alt }) => ({ src, width, height, alt }));
}

/** One product with the fields the back office changed. */
function withSheetContent(product: Product, row: StorefrontContentRow): Product {
  const fields = new Set((row.storefront_fields ?? []).filter((field) => KNOWN_FIELDS.has(field)));
  if (fields.size === 0) return product;
  const copy: { -readonly [Key in keyof Product]?: Product[Key] } = { ...product };

  if (fields.has("name") && row.name.trim()) copy.name = row.name.trim();
  if (fields.has("tagline") && row.tagline.trim()) copy.tagline = row.tagline.trim();
  if (fields.has("description") && row.description.trim()) copy.description = row.description.trim();
  if (fields.has("category")) {
    const slug = first(row.category)?.slug;
    if (slug && CATEGORIES.has(slug)) copy.category = slug as CategorySlug;
  }
  if (fields.has("blade_type")) {
    if (row.blade_type === null) delete copy.bladeType;
    else if (BLADE_TYPES.has(row.blade_type)) copy.bladeType = row.blade_type as BladeType;
  }
  // A list read without its rows (a failed embed) is not an emptied list: the catalogue's stays.
  if (fields.has("specs") && row.specs) copy.specs = ordered(row.specs).map(({ label, value }) => ({ label, value }));
  if (fields.has("features") && row.features) copy.features = ordered(row.features).map(({ title, description }) => ({ title, description }));
  if (fields.has("box_contents") && row.box_contents) copy.boxContents = ordered(row.box_contents).map(({ content }) => content);
  if (fields.has("images")) {
    // A product page always has a photo: with none of the shop's own files, the catalogue's stay.
    const images = localImages(row);
    if (images.length > 0) copy.images = images;
  }
  if (fields.has("tags") && row.tags) copy.tags = row.tags.map(({ tag }) => tag).filter((tag): tag is PromoTag => PROMO_TAGS.has(tag));
  return copy as Product;
}

/**
 * The catalogue with the copy the back office changed, matched by slug. Products the database
 * does not return, and fields it never changed, stay exactly as catalogued.
 */
export function applyStorefrontContent(products: readonly Product[], rows: readonly StorefrontContentRow[]): readonly Product[] {
  if (rows.length === 0) return products;
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  return products.map((product) => {
    const row = bySlug.get(product.slug);
    return row ? withSheetContent(product, row) : product;
  });
}
