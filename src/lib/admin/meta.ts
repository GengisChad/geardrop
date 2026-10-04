import { z } from "zod";
import { BUNDLES, PRODUCTS } from "@/data/catalog";
import { META_TIERS, PERIOD } from "@/lib/meta/types";

/**
 * Schemas for the META ATTUALE panel.
 *
 * A ranking entry's product slug is checked against the catalogue here rather than by a
 * foreign key: the catalogue file is what the storefront sells from, and a slug that only
 * the products table knows would render as a link to a page that does not exist. Catching
 * the typo at save time is the difference between the owner fixing it in the panel and a
 * reader finding a 404.
 */

const CATALOGUE_SLUGS = new Set([...PRODUCTS, ...BUNDLES].map((product) => product.slug));

export const metaSnapshotIdSchema = z.coerce.number().int().positive();
const nullableText = (max: number) => z.string().trim().max(max).transform((value) => value || null).nullable();

export const productSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => value || null)
  .nullable()
  .refine((value) => value === null || CATALOGUE_SLUGS.has(value as never), {
    message: "Questo slug non esiste a catalogo. Lascia vuoto se non vendiamo il pezzo.",
  });

export const metaSnapshotSchema = z.object({
  id: metaSnapshotIdSchema.optional(),
  month: z
    .string()
    .trim()
    .regex(PERIOD, "Usa AAAA-MM per un mese (2026-10) o AAAA-MM-GG per una settimana (2026-10-05)"),
  title: z.string().trim().min(1).max(160),
  sourceNote: z.string().trim().min(1).max(400),
  intro: nullableText(2000),
  publicationStatus: z.enum(["draft", "published", "archived"]),
  active: z.boolean(),
  seoTitle: nullableText(70),
  seoDescription: nullableText(180),
});

export const metaRankingEntrySchema = z.object({
  pieceName: z.string().trim().min(1).max(200),
  archetype: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(1).max(2000),
  productSlug: productSlugSchema,
  videoUrl: z.union([z.url({ protocol: /^https$/ }), z.literal("")]).transform((value) => value || null).nullable(),
});

export const metaRankingsSchema = z.object({
  snapshotId: metaSnapshotIdSchema,
  tierType: z.enum(META_TIERS),
  // The rank is the position in this list; nobody should be typing numbers that have to
  // stay unique while they reorder.
  entries: z.array(metaRankingEntrySchema).max(50),
});

export const metaVideosSchema = z.object({
  videos: z
    .array(
      z.object({
        youtubeUrl: z.url({ protocol: /^https$/ }).max(500),
        title: z.string().trim().min(1).max(200),
        description: nullableText(500),
        active: z.boolean(),
      }),
    )
    .max(100),
});

export type MetaSnapshotInput = z.infer<typeof metaSnapshotSchema>;
export type MetaRankingEntryInput = z.infer<typeof metaRankingEntrySchema>;
export type MetaVideosInput = z.infer<typeof metaVideosSchema>;

/** Offered in the panel next to the slug field, so nobody has to remember them. */
export function catalogueSlugOptions(): readonly { readonly slug: string; readonly name: string }[] {
  return [...PRODUCTS, ...BUNDLES]
    .map((product) => ({ slug: product.slug as string, name: product.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "it"));
}
