import { z } from "zod";

/**
 * "Codici ed etichette" (owner, 2026-11-18): the barcode on each box (GTIN), the shop's own SKU
 * labels, and the parcel check that scans every piece before the box is closed.
 */

/** A scan or a typed code, as a reader sends it: trimmed, inner spaces gone. */
export function normalizeScan(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

/** GTIN-8, -12, -13 or -14 with a valid check digit (the last one). */
export function isValidGtin(value: string): boolean {
  if (!/^(\d{8}|\d{12,14})$/.test(value)) return false;
  const digits = [...value].map(Number);
  const check = digits.pop()!;
  // From the right, the digit next to the check digit weighs 3, the one before it 1, and so on.
  const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export const productGtinSchema = z.object({
  productId: z.coerce.number().int().positive(),
  gtin: z
    .string()
    .transform(normalizeScan)
    .refine((value) => value === "" || isValidGtin(value), "Codice a barre non valido: controlla le cifre (8, 12, 13 o 14).")
    .transform((value) => value || null),
});

export const packCheckSchema = z.object({
  orderId: z.coerce.number().int().positive(),
  pieces: z.coerce.number().int().positive().max(500),
});

export type PackLine = {
  readonly key: string;
  readonly name: string;
  readonly sku: string;
  readonly gtin: string | null;
  readonly expected: number;
};

export type ScanOutcome =
  | { readonly kind: "match"; readonly key: string; readonly name: string }
  | { readonly kind: "extra"; readonly key: string; readonly name: string }
  | { readonly kind: "unknown"; readonly code: string };

/**
 * One scan against the order: the shop's SKU (from our label, any case) or the box barcode.
 * A piece already counted as many times as ordered is an extra one, and is not counted.
 */
export function applyScan(lines: readonly PackLine[], counted: Readonly<Record<string, number>>, raw: string): ScanOutcome {
  const code = normalizeScan(raw);
  const upper = code.toUpperCase();
  const line = lines.find((candidate) => candidate.sku.toUpperCase() === upper || (candidate.gtin !== null && candidate.gtin === code));
  if (!line) return { kind: "unknown", code };
  return (counted[line.key] ?? 0) >= line.expected
    ? { kind: "extra", key: line.key, name: line.name }
    : { kind: "match", key: line.key, name: line.name };
}

export function packComplete(lines: readonly PackLine[], counted: Readonly<Record<string, number>>): boolean {
  return lines.length > 0 && lines.every((line) => (counted[line.key] ?? 0) >= line.expected);
}

export type LabelRequest = { readonly productId: number; readonly copies: number };

/** At most this many labels in one print: four A4 sheets of 24. */
export const LABEL_LIMIT = 96;

/**
 * The print request from "Codici ed etichette": `?copie=12:3&copie=15:1` (product id : copies).
 * Bad or zero entries are dropped, repeats add up, the total stops at the limit.
 */
export function parseLabelRequests(value: string | string[] | undefined): readonly LabelRequest[] {
  const parts = (Array.isArray(value) ? value : [value ?? ""]).flatMap((item) => item.split(","));
  const copies = new Map<number, number>();
  for (const part of parts) {
    const [id, count] = part.split(":").map((piece) => Number(piece?.trim()));
    if (!Number.isSafeInteger(id) || id! <= 0 || !Number.isSafeInteger(count) || count! <= 0) continue;
    copies.set(id!, (copies.get(id!) ?? 0) + count!);
  }
  let left = LABEL_LIMIT;
  const requests: LabelRequest[] = [];
  for (const [productId, count] of copies) {
    if (left === 0) break;
    const taken = Math.min(count, left);
    requests.push({ productId, copies: taken });
    left -= taken;
  }
  return requests;
}
