import { z } from "zod";

const id = z.coerce.number().int().positive();
const optionalPositive = z.coerce.number().int().positive().nullable();
const ids = z.array(id).max(500).refine((value) => new Set(value).size === value.length, "Target duplicati");
export const couponIdSchema = id;
export const couponSchema = z.object({
  id: id.optional(),
  code: z.string().trim().min(1).max(80).transform((value) => value.toUpperCase()),
  discountKind: z.enum(["percentage", "fixed"]),
  discountValue: z.coerce.number().int().positive(),
  freeShipping: z.boolean(),
  minimumSubtotalCents: z.coerce.number().int().nonnegative(),
  maximumDiscountCents: optionalPositive,
  usageLimit: optionalPositive,
  perCustomerLimit: optionalPositive,
  firstPurchaseOnly: z.boolean(),
  startsAt: z.iso.datetime({ offset: true }).nullable(),
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
  active: z.boolean(),
  productIds: ids,
  categoryIds: ids,
  bundleIds: ids,
}).superRefine((value, context) => {
  if (value.discountKind === "percentage" && value.discountValue > 100) context.addIssue({ code: "custom", path: ["discountValue"], message: "Percentuale massima 100" });
  if (value.startsAt && value.expiresAt && new Date(value.expiresAt) <= new Date(value.startsAt)) context.addIssue({ code: "custom", path: ["expiresAt"], message: "Scadenza non valida" });
});
export type CouponInput = z.infer<typeof couponSchema>;
