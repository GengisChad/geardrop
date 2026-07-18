import { z } from "zod";

const nullableText = (max: number) => z.string().trim().max(max).transform((value) => value || null).nullable();

export const categoryIdSchema = z.coerce.number().int().positive();
export const categoryIdsSchema = z.array(categoryIdSchema).min(1).max(200).superRefine((ids, context) => {
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "Ogni categoria deve comparire una sola volta" });
  }
});

export const categoryEditorSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  tagline: z.string().trim().min(1).max(240),
  description: z.string().trim().min(1).max(12_000),
  mediaAssetId: categoryIdSchema.nullable(),
  publicationStatus: z.enum(["draft", "published", "archived"]),
  active: z.boolean(),
  seoTitle: nullableText(70),
  seoDescription: nullableText(180),
  sortOrder: z.coerce.number().int().min(-100_000).max(100_000),
});

export type CategoryEditorInput = z.infer<typeof categoryEditorSchema>;

