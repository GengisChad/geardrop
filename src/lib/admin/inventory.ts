import { z } from "zod";
import { skuSchema } from "@/lib/admin/products";

export const inventoryAdjustmentSchema = z.object({
  sku: skuSchema,
  delta: z.coerce.number().int().min(-100_000).max(100_000).refine((value) => value !== 0, {
    message: "La variazione non può essere zero",
  }),
  reason: z.enum(["manual_adjustment", "return", "damage"]),
  note: z.string().trim().max(500).transform((value) => value || null),
  confirmReduction: z.boolean().default(false),
}).superRefine((value, context) => {
  if (value.delta <= -10 && !value.confirmReduction) {
    context.addIssue({
      code: "custom",
      path: ["confirmReduction"],
      message: "Conferma esplicitamente la riduzione inventario",
    });
  }
});

export type InventoryAdjustmentInput = z.infer<typeof inventoryAdjustmentSchema>;
