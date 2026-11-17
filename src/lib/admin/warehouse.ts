import { z } from "zod";

/**
 * Warehouse at cost: amounts, schemas and the landed-cost arithmetic the database applies when
 * a goods receipt is confirmed, so the editor can show the same numbers before confirming.
 * Every amount is in euro cents, net of VAT.
 */

export const VAT_REGIMES = ["intra_ue", "nazionale", "extra_ue"] as const;
export type VatRegime = (typeof VAT_REGIMES)[number];

export const VAT_REGIME_LABELS: Record<VatRegime, string> = {
  intra_ue: "Intra UE — fattura senza IVA, inversione contabile",
  nazionale: "Nazionale — si registra l'imponibile",
  extra_ue: "Extra UE — imponibile, dazi tra le spese",
};

export const DOCUMENT_KINDS = ["invoice", "delivery_note"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  invoice: "Fattura",
  delivery_note: "DDT",
};

export const RECEIPT_STATUS_LABELS = {
  draft: "Bozza",
  confirmed: "Caricato",
  reversed: "Stornato",
} as const;

const MAX_CENTS = 100_000_000;

/**
 * An amount typed by a person: "6,50", "6.5", "1.234,56", "€ 12". Null when it is not a
 * non-negative amount with at most two decimals. "1.234" alone is refused: in Italian it is a
 * thousand, in English one euro and change, and a cost must not be guessed.
 */
export function parseEuroCents(value: string): number | null {
  const compact = value.trim().replace(/[\s€]/g, "");
  if (!compact) return null;
  const decimal = compact.includes(",") ? compact.replace(/\./g, "").replace(",", ".") : compact;
  if (!/^\d+(\.\d{1,2})?$/.test(decimal)) return null;
  const [whole = "0", fraction = ""] = decimal.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= MAX_CENTS ? cents : null;
}

/** Cents as a person types them back: 650 → "6,50". */
export function formatEuroInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** Gross price (VAT included) → net, as order_profit computes it. */
export function netOfVat(grossCents: number, vatRateBp: number): number {
  return Math.round((grossCents * 10_000) / (10_000 + vatRateBp));
}

/** Margin on the net price, in percent with one decimal; null without a cost or a price. */
export function marginPercent(netPriceCents: number, costCents: number | null): number | null {
  if (costCents === null || netPriceCents <= 0) return null;
  return Math.round(((netPriceCents - costCents) / netPriceCents) * 1000) / 10;
}

export type ReceiptLineCost = { readonly quantity: number; readonly unitCostCents: number };
export type LandedLine = {
  readonly allocatedCents: number;
  readonly landedTotalCents: number;
  readonly landedUnitCostCents: number;
};

/**
 * Spreads freight and duties over the lines by value (by quantity when nothing has a value);
 * the last line takes the rounding, so the lines add up to the document. Mirrors
 * public.confirm_supplier_receipt.
 */
export function allocateLandedCosts(lines: readonly ReceiptLineCost[], extraCents: number): readonly LandedLine[] {
  const goodsTotal = lines.reduce((sum, line) => sum + line.quantity * line.unitCostCents, 0);
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  let allocated = 0;
  return lines.map((line, index) => {
    const share = index === lines.length - 1
      ? extraCents - allocated
      : goodsTotal > 0
        ? Math.floor((extraCents * line.quantity * line.unitCostCents) / goodsTotal)
        : totalQuantity > 0 ? Math.floor((extraCents * line.quantity) / totalQuantity) : 0;
    allocated += share;
    const landedTotalCents = line.quantity * line.unitCostCents + share;
    return {
      allocatedCents: share,
      landedTotalCents,
      landedUnitCostCents: line.quantity > 0 ? Math.round(landedTotalCents / line.quantity) : 0,
    };
  });
}

const trimmed = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z.string().trim().max(max).transform((value) => (value === "" ? null : value)).nullable();
const id = z.coerce.number().int().positive();
const cents = z.number().int().min(0).max(MAX_CENTS);

export const supplierSchema = z.object({
  id: id.optional(),
  name: trimmed(160),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
  vatNumber: optionalText(32),
  vatRegime: z.enum(VAT_REGIMES),
  email: z.union([z.literal(""), z.email()]).transform((value) => (value === "" ? null : value)),
  notes: optionalText(2000),
  active: z.boolean(),
});
export type SupplierInput = z.infer<typeof supplierSchema>;

export const receiptLineSchema = z.object({
  productId: id,
  quantity: z.number().int().min(1).max(100_000),
  unitCostCents: cents,
});

export const receiptDraftSchema = z.object({
  id: id.optional(),
  supplierId: id,
  documentKind: z.enum(DOCUMENT_KINDS),
  documentNumber: trimmed(60),
  documentDate: z.iso.date(),
  freightCents: cents,
  dutiesCents: cents,
  notes: optionalText(2000),
  lines: z.array(receiptLineSchema).min(1).max(200).refine(
    (lines) => new Set(lines.map((line) => line.productId)).size === lines.length,
    { message: "Ogni prodotto compare una sola volta nel documento." },
  ),
});
export type ReceiptDraftInput = z.infer<typeof receiptDraftSchema>;

export const receiptReversalSchema = z.object({
  receiptId: id,
  reason: z.string().trim().min(3).max(500),
});

export const productCostSchema = z.object({
  productId: id,
  unitCostCents: cents,
  reason: z.string().trim().min(3).max(500),
  valueUnvaluedMovements: z.boolean(),
});

export const orderCostsSchema = z.object({
  orderId: id,
  shippingCostCents: cents.nullable(),
  packagingCostCents: cents.max(100_000).nullable(),
  paymentFeeCents: cents.nullable(),
});

export const costDefaultsSchema = z.object({
  vatRateBp: z.number().int().min(0).max(10_000),
  packagingCostCents: cents.max(100_000),
});

/** Why an order has no profit yet, in words. */
export const MISSING_COST_LABELS: Record<string, string> = {
  cost_of_goods: "costo merce",
  shipping_cost: "costo corriere",
  payment_fee: "commissione pagamento",
};

/** Euro amount for tables and panels, negative with a real minus: "−€3,89". */
export function formatEuro(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  const amount = (Math.abs(cents) / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" });
  return `${cents < 0 ? "−" : ""}€${amount}`;
}

export type CostImportRow = { readonly line: number; readonly sku: string; readonly unitCostCents: number };
export type CostImportParse = { readonly rows: readonly CostImportRow[]; readonly errors: readonly string[] };

/**
 * Costs pasted from a spreadsheet: one product per line, SKU then cost, separated by a
 * semicolon or a tab ("COBALT-DRAKE-4-60F;6,50"). A header line and empty lines are skipped;
 * an SKU listed twice, or a cost that cannot be read, is an error rather than a guess.
 */
export function parseCostImport(text: string): CostImportParse {
  const rows: CostImportRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const cells = raw.split(/[;\t]/).map((cell) => cell.trim());
    if (cells.every((cell) => cell === "")) return;
    const [sku = "", cost = ""] = cells;
    if (line === 1 && /^sku$/i.test(sku)) return;
    const unitCostCents = parseEuroCents(cost);
    if (!/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(sku) || unitCostCents === null || cells.filter((cell) => cell !== "").length !== 2) {
      errors.push(`Riga ${line}: scrivi SKU e costo separati da punto e virgola, es. COBALT-DRAKE-4-60F;6,50`);
      return;
    }
    const key = sku.toUpperCase();
    if (seen.has(key)) {
      errors.push(`Riga ${line}: ${sku} compare due volte`);
      return;
    }
    seen.add(key);
    rows.push({ line, sku, unitCostCents });
  });
  return { rows, errors };
}
