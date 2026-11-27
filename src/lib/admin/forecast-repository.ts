import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;
export type ForecastRow = Database["public"]["Functions"]["get_inventory_forecast"]["Returns"][number];

export type ForecastWindow = { readonly leadDays: number; readonly targetDays: number };

export const DEFAULT_FORECAST_WINDOW: ForecastWindow = { leadDays: 14, targetDays: 45 };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function bounded(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

/** Supplier lead time and days of stock to hold, from the page's query string. */
export function normalizeForecastWindow(input: Record<string, string | string[] | undefined>): ForecastWindow {
  return {
    leadDays: bounded(first(input.consegna), DEFAULT_FORECAST_WINDOW.leadDays, 0, 365),
    targetDays: bounded(first(input.copertura), DEFAULT_FORECAST_WINDOW.targetDays, 1, 365),
  };
}

export async function loadInventoryForecast(client: Client, organizationId: number, window: ForecastWindow): Promise<readonly ForecastRow[]> {
  const { data, error } = await client.rpc("get_inventory_forecast", {
    p_organization_id: organizationId,
    p_lead_days: window.leadDays,
    p_target_days: window.targetDays,
  });
  if (error) throw new Error("Impossibile calcolare le previsioni");
  return data ?? [];
}

/** A channel poll's votes (get_telegram_poll_results, 20261127160000), for the forecast page. */
export type PollResult = {
  readonly id: number;
  readonly productId: number | null;
  readonly subject: string;
  readonly status: string;
  readonly options: readonly string[];
  readonly counts: readonly number[];
  readonly totalVoters: number;
  readonly openedAt: string | null;
};

/** The published polls; an empty list when the function is not there yet or answers nothing. */
export async function loadPollResults(client: Client, organizationId: number): Promise<readonly PollResult[]> {
  const { data, error } = await client.rpc("get_telegram_poll_results", { p_organization_id: organizationId });
  if (error) return [];
  return (data ?? []).map((row) => ({
    id: row.id,
    productId: row.product_id ?? null,
    subject: row.subject,
    status: row.status,
    options: Array.isArray(row.options) ? row.options.filter((item): item is string => typeof item === "string") : [],
    counts: Array.isArray(row.counts) ? row.counts.map((item) => (typeof item === "number" ? item : 0)) : [],
    totalVoters: row.total_voters,
    openedAt: row.opened_at ?? null,
  }));
}

/** "12 sì su 20": the first answer is the yes. */
export function pollSignal(poll: Pick<PollResult, "counts" | "totalVoters">): string {
  return `${poll.counts[0] ?? 0} sì su ${poll.totalVoters}`;
}

export type ForecastUrgency = "esaurito" | "sotto-scorta" | "da-riordinare" | "ok" | "fermo";

/** How urgent a row is: out of stock, below the reorder point, reorder advised, fine, or not selling. */
export function forecastUrgency(row: Pick<ForecastRow, "stock_quantity" | "unlimited_stock" | "daily_rate" | "reorder_point" | "suggested_reorder">): ForecastUrgency {
  if (row.unlimited_stock) return "ok";
  if (Number(row.daily_rate) === 0) return row.stock_quantity <= 0 ? "esaurito" : "fermo";
  if (row.stock_quantity <= 0) return "esaurito";
  if (row.reorder_point !== null && row.stock_quantity <= row.reorder_point) return "sotto-scorta";
  return row.suggested_reorder > 0 ? "da-riordinare" : "ok";
}
