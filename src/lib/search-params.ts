import { z } from "zod";
import type { ProductQuery } from "@/lib/commerce/types";

const stock = z.enum(["disponibile", "in-arrivo", "pre-ordine", "esaurito"]);
const bladeType = z.enum(["attacco", "difesa", "stamina", "bilanciato"]);
const category = z.enum(["beyblade-x", "lanciatori", "stadi", "accessori"]);
const sort = z.enum(["popolari", "novita", "prezzo-asc", "prezzo-desc", "nome"]);

/** Accepts `?stock=a&stock=b` and `?stock=a,b`; Next gives arrays for repeated keys. */
const list = <T extends z.ZodType>(item: T) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      const raw = Array.isArray(value) ? value : [value];
      const parts = raw.flatMap((entry) => entry.split(","));
      const parsed = parts.map((part) => item.safeParse(part.trim())).filter((r) => r.success);
      return parsed.length ? (parsed.map((r) => r.data) as z.infer<T>[]) : undefined;
    });

/** Prices arrive in euros in the URL ("?max=60"); the domain works in cents. */
const euros = z
  .string()
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : undefined;
  });

const schema = z.object({
  q: z.string().optional(),
  categoria: category.optional().catch(undefined),
  sort: sort.optional().catch(undefined),
  stock: list(stock),
  type: list(bladeType),
  min: euros,
  max: euros,
  page: z
    .string()
    .optional()
    .transform((value) => {
      const parsed = Number(value);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
    }),
});

export type RawSearchParams = Record<string, string | string[] | undefined>;

/**
 * URL -> ProductQuery. Unknown or malformed values are dropped rather than throwing:
 * a hand-edited query string should degrade to the default listing, not a 500.
 *
 * Keys are omitted (never set to undefined) to satisfy exactOptionalPropertyTypes.
 */
export function parseProductQuery(params: RawSearchParams): ProductQuery {
  const parsed = schema.safeParse(params);
  if (!parsed.success) return {};

  const { q, categoria, sort: sortKey, stock: stockValues, type, min, max, page } = parsed.data;
  const query: Record<string, unknown> = {};
  if (q?.trim()) query["search"] = q.trim();
  if (categoria) query["category"] = categoria;
  if (sortKey) query["sort"] = sortKey;
  if (stockValues?.length) query["stock"] = stockValues;
  if (type?.length) query["bladeType"] = type;
  if (min !== undefined) query["minPrice"] = min;
  if (max !== undefined) query["maxPrice"] = max;
  if (page !== undefined) query["page"] = page;
  return query as ProductQuery;
}

/** Builds a query string from the active filters, dropping empties so URLs stay clean. */
export function buildSearchParams(query: ProductQuery & { q?: string }): string {
  const params = new URLSearchParams();
  if (query.search) params.set("q", query.search);
  if (query.sort && query.sort !== "popolari") params.set("sort", query.sort);
  if (query.stock?.length) params.set("stock", query.stock.join(","));
  if (query.bladeType?.length) params.set("type", query.bladeType.join(","));
  if (query.minPrice !== undefined) params.set("min", String(query.minPrice / 100));
  if (query.maxPrice !== undefined) params.set("max", String(query.maxPrice / 100));
  if (query.page && query.page > 1) params.set("page", String(query.page));
  const out = params.toString();
  return out ? `?${out}` : "";
}
