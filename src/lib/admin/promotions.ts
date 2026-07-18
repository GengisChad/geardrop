import { z } from "zod";

const id = z.coerce.number().int().positive();
const ids = z.array(id).max(500).refine((value) => new Set(value).size === value.length, "Target duplicati");
export const promotionIdSchema = id;
export const promotionSchema = z.object({
  id: id.optional(),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).transform((value) => value || null).nullable(),
  discountKind: z.enum(["percentage", "fixed", "promotional_price"]),
  discountValue: z.coerce.number().int().positive(),
  minimumSubtotalCents: z.coerce.number().int().nonnegative(),
  minimumQuantity: z.coerce.number().int().positive().max(1000),
  priority: z.coerce.number().int().min(-100000).max(100000),
  stackable: z.boolean(),
  startsAt: z.iso.datetime({ offset: true }).nullable(),
  endsAt: z.iso.datetime({ offset: true }).nullable(),
  active: z.boolean(),
  productIds: ids,
  categoryIds: ids,
  bundleIds: ids,
}).superRefine((value, context) => {
  if (value.discountKind === "percentage" && value.discountValue > 100) context.addIssue({ code: "custom", path: ["discountValue"], message: "Percentuale massima 100" });
  if (value.startsAt && value.endsAt && new Date(value.endsAt) <= new Date(value.startsAt)) context.addIssue({ code: "custom", path: ["endsAt"], message: "Fine non valida" });
});
export type PromotionInput = z.infer<typeof promotionSchema>;
