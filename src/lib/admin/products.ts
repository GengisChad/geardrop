import { z } from "zod";
import type { StaffRole } from "@/lib/auth/roles";

export const publicationStatusSchema = z.enum(["draft", "published", "archived"]);
export const availabilityOverrideSchema = z.enum(["preorder", "incoming"]).nullable();
export const adminProductComputedStateSchema = z.object({
  stock_status: z.enum(["disponibile", "in-arrivo", "pre-ordine", "esaurito"]),
  is_purchasable: z.boolean(),
});
export const skuSchema = z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const nullableText = (max: number) => z.string().trim().max(max).transform((value) => value || null).nullable();

export const productEditorSchema = z.object({
  name: z.string().trim().min(2).max(160),
  shortName: nullableText(80),
  slug: z.string().trim().min(2).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  sku: skuSchema,
  categoryId: z.coerce.number().int().positive(),
  tagline: z.string().trim().min(1).max(240),
  description: z.string().trim().min(1).max(12000),
  priceCents: z.coerce.number().int().nonnegative(),
  compareAtPriceCents: z.coerce.number().int().positive().nullable(),
  publicationStatus: publicationStatusSchema,
  active: z.boolean(),
  bladeType: z.enum(["attacco", "difesa", "stamina", "bilanciato"]).nullable(),
  manageStock: z.boolean(),
  lowStockThreshold: z.coerce.number().int().min(0).max(100000),
  allowBackorder: z.boolean(),
  availabilityOverride: availabilityOverrideSchema,
  preorderAllocation: z.coerce.number().int().min(0).max(100000),
  preorderReleaseDate: z.iso.date().nullable(),
  preorderWarningConfirmed: z.boolean(),
  seoTitle: nullableText(70),
  seoDescription: nullableText(180),
  sortOrder: z.coerce.number().int().min(-100000).max(100000),
}).superRefine((value, context) => {
  if (value.compareAtPriceCents !== null && value.compareAtPriceCents <= value.priceCents) {
    context.addIssue({ code: "custom", path: ["compareAtPriceCents"], message: "Il prezzo barrato deve superare il prezzo" });
  }
  if (value.availabilityOverride === "preorder") {
    if (value.preorderAllocation <= 0) {
      context.addIssue({ code: "custom", path: ["preorderAllocation"], message: "Imposta una disponibilità preordine" });
    }
    if (!value.preorderReleaseDate && !value.preorderWarningConfirmed) {
      context.addIssue({ code: "custom", path: ["preorderReleaseDate"], message: "Indica la data o conferma l'avviso" });
    }
  } else if (value.preorderAllocation !== 0) {
    context.addIssue({ code: "custom", path: ["preorderAllocation"], message: "La quantità preordine richiede il relativo override" });
  }
});

export type ProductEditorInput = z.infer<typeof productEditorSchema>;

export function slugifyProduct(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

export type EffectiveAvailability = z.infer<typeof adminProductComputedStateSchema>["stock_status"];

export function productMutationCapabilities(role: StaffRole) {
  const manager = role === "owner" || role === "admin";
  return {
    editContent: true,
    editCommerce: manager,
    publish: true,
    hardDelete: manager,
    duplicate: true,
  } as const;
}

export type AdminProductSort = "updated-desc" | "updated-asc" | "name-asc" | "price-asc" | "price-desc" | "stock-asc";
export type AdminProductQuery = {
  readonly q: string;
  readonly publication: "all" | "draft" | "published" | "archived";
  readonly availability: "all" | EffectiveAvailability;
  readonly category: number | null;
  readonly lowStock: boolean;
  readonly sort: AdminProductSort;
  readonly page: number;
  readonly pageSize: number;
};

type QueryRecord = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function normalizeAdminProductQuery(input: QueryRecord): AdminProductQuery {
  const publication = first(input.publication);
  const availability = first(input.availability);
  const sort = first(input.sort);
  const page = Number.parseInt(first(input.page) ?? "1", 10);
  const pageSize = Number.parseInt(first(input.pageSize) ?? "20", 10);
  const category = Number.parseInt(first(input.category) ?? "", 10);
  const allowedSorts: readonly AdminProductSort[] = ["updated-desc", "updated-asc", "name-asc", "price-asc", "price-desc", "stock-asc"];
  const allowedAvailability: readonly AdminProductQuery["availability"][] = ["all", "disponibile", "in-arrivo", "pre-ordine", "esaurito"];
  return {
    q: (first(input.q) ?? "").trim().slice(0, 100),
    publication: publication === "draft" || publication === "published" || publication === "archived" ? publication : "all",
    availability: allowedAvailability.includes(availability as AdminProductQuery["availability"])
      ? availability as AdminProductQuery["availability"]
      : "all",
    category: Number.isSafeInteger(category) && category > 0 ? category : null,
    lowStock: first(input.lowStock) === "true",
    sort: allowedSorts.includes(sort as AdminProductSort) ? sort as AdminProductSort : "updated-desc",
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    pageSize: Number.isSafeInteger(pageSize) ? Math.min(50, Math.max(10, pageSize)) : 20,
  };
}

export const productIdSchema = z.coerce.number().int().positive();
export const productIdsSchema = z.array(productIdSchema).min(1).max(100);
export const promoTagSchema = z.enum(["novita", "offerta", "limited", "esclusiva"]);
export const relationTypeSchema = z.enum(["related", "upsell", "cross_sell", "compatible"]);
