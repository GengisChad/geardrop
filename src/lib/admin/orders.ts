import { z } from "zod";
import type { StaffRole } from "@/lib/auth/roles";
import type { Database } from "@/lib/supabase/database.types";

export type OrderStatus = Database["public"]["Enums"]["order_status"];
export type PaymentStatus = Database["public"]["Enums"]["payment_status"];
export type AdminOrderQuery = {
  readonly q: string;
  readonly from: string | null;
  readonly to: string | null;
  readonly status: "all" | OrderStatus;
  readonly payment: "all" | PaymentStatus;
  readonly shipping: string;
  readonly coupon: string;
  readonly page: number;
  readonly pageSize: number;
};

type QueryRecord = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const statuses: readonly OrderStatus[] = ["pending", "confirmed", "processing", "shipped", "completed", "cancelled"];
const payments: readonly PaymentStatus[] = ["pending", "authorized", "paid", "failed", "refunded"];

export function normalizeAdminOrderQuery(input: QueryRecord): AdminOrderQuery {
  const status = first(input.status);
  const payment = first(input.payment);
  const from = first(input.from)?.trim() ?? "";
  const to = first(input.to)?.trim() ?? "";
  const page = Number.parseInt(first(input.page) ?? "1", 10);
  const pageSize = Number.parseInt(first(input.pageSize) ?? "25", 10);
  return {
    q: (first(input.q) ?? "").trim().slice(0, 120),
    from: z.iso.date().safeParse(from).success ? from : null,
    to: z.iso.date().safeParse(to).success ? to : null,
    status: statuses.includes(status as OrderStatus) ? status as OrderStatus : "all",
    payment: payments.includes(payment as PaymentStatus) ? payment as PaymentStatus : "all",
    shipping: (first(input.shipping) ?? "").trim().toLowerCase().slice(0, 80),
    coupon: (first(input.coupon) ?? "").trim().toUpperCase().slice(0, 80),
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    pageSize: Number.isSafeInteger(pageSize) ? Math.min(100, Math.max(10, pageSize)) : 25,
  };
}

export function orderPiiVisibility(role: StaffRole) {
  const manager = role === "owner" || role === "admin";
  return { view: manager, export: manager } as const;
}

export function maskEmail(value: string): string {
  const [local = "", domain = ""] = value.split("@");
  return `${local.slice(0, 1)}***@${domain || "***"}`;
}

export function csvOrderCell(value: string | number | null): string {
  let text = value === null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

const orderId = z.coerce.number().int().positive();
export const orderTransitionSchema = z.object({ orderId, toStatus: z.enum(["confirmed", "processing", "shipped", "completed"]), note: z.string().trim().max(1000).transform((value) => value || null) });
export const orderCancellationSchema = z.object({ orderId, note: z.string().trim().min(1).max(1000), confirmed: z.literal(true) });
export const orderNoteSchema = z.object({ orderId, note: z.string().trim().min(1).max(4000) });
export const trackingSchema = z.object({ orderId, carrier: z.string().trim().min(1).max(120), code: z.string().trim().min(1).max(240), url: z.union([z.url({ protocol: /^https$/ }), z.literal("")]).transform((value) => value || null) });
export const refundPreparationSchema = z.object({ orderId, amountCents: z.coerce.number().int().positive(), reason: z.string().trim().min(3).max(1000) });

export function allowedOrderTransitions(status: OrderStatus): readonly OrderStatus[] {
  const transitions: Record<OrderStatus, readonly OrderStatus[]> = {
    pending: ["confirmed", "cancelled"], confirmed: ["processing", "cancelled"], processing: ["shipped", "cancelled"],
    shipped: ["completed"], completed: [], cancelled: [],
  };
  return transitions[status];
}

export function addressLines(value: unknown): readonly string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  const keys = ["recipient", "name", "company", "address", "address1", "address2", "postalCode", "postal_code", "city", "province", "country"];
  return keys.flatMap((key) => typeof record[key] === "string" && record[key].trim() ? [record[key].trim()] : []);
}
