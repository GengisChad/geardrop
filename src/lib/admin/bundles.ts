import { z } from "zod";
import type { StaffRole } from "@/lib/auth/roles";

export const bundleIdSchema = z.coerce.number().int().positive();
export const bundleItemSchema = z.object({
  productId: bundleIdSchema,
  quantity: z.coerce.number().int().min(1).max(1_000),
  sortOrder: z.coerce.number().int().min(0).max(100_000),
});

export const bundleEditorSchema = z.object({
  slug: z.string().trim().min(2).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  eyebrow: z.string().trim().min(1).max(120),
  titleLineOne: z.string().trim().min(1).max(160),
  titleLineTwo: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(12_000),
  priceCents: z.coerce.number().int().nonnegative(),
  compareAtPriceCents: z.coerce.number().int().positive(),
  heroProductId: bundleIdSchema,
  mediaAssetId: bundleIdSchema.nullable(),
  availabilityOverride: z.enum(["preorder", "incoming"]).nullable(),
  sortOrder: z.coerce.number().int().min(-100_000).max(100_000),
  active: z.boolean(),
  startsAt: z.iso.datetime({ offset: true }).nullable(),
  endsAt: z.iso.datetime({ offset: true }).nullable(),
  items: z.array(bundleItemSchema).min(1).max(100),
}).superRefine((value, context) => {
  if (value.compareAtPriceCents <= value.priceCents) {
    context.addIssue({ code: "custom", path: ["compareAtPriceCents"], message: "Il prezzo barrato deve superare il prezzo" });
  }
  if (value.startsAt && value.endsAt && new Date(value.endsAt) <= new Date(value.startsAt)) {
    context.addIssue({ code: "custom", path: ["endsAt"], message: "La fine deve seguire l'inizio" });
  }
  if (new Set(value.items.map((item) => item.productId)).size !== value.items.length) {
    context.addIssue({ code: "custom", path: ["items"], message: "Ogni prodotto può comparire una sola volta" });
  }
  if (!value.items.some((item) => item.productId === value.heroProductId)) {
    context.addIssue({ code: "custom", path: ["heroProductId"], message: "Il prodotto hero deve essere incluso nel bundle" });
  }
});

export type BundleEditorInput = z.infer<typeof bundleEditorSchema>;

export function bundleMutationCapabilities(role: StaffRole) {
  return { editContent: true, editCommerce: role === "owner" || role === "admin" } as const;
}

