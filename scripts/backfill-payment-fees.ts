import { pathToFileURL } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { stripePaymentFee } from "../src/lib/orders/payment-fee";
import { createStripeClient, type StripeClient } from "../src/lib/payments/stripe-api";
import type { Database } from "../src/lib/supabase/database.types";

/**
 * Fills the Stripe fee of orders paid before the shop recorded it, so their profit stops being
 * incomplete. Reads the fee from each payment's balance transaction — Stripe's own number, never
 * an estimate — and writes it with the same function the webhook uses, which never overwrites a
 * fee typed by staff. Orders whose fee Stripe has not settled yet are left alone and can be
 * picked up by a later run.
 *
 * Dry run by default; nothing is written without `--apply`.
 *
 *   pnpm tsx scripts/backfill-payment-fees.ts             preview
 *   pnpm tsx scripts/backfill-payment-fees.ts --apply     write the fees
 *   … --limit 50                                          how many orders at most (default 200)
 */

export type PendingOrder = {
  readonly id: number;
  readonly order_number: string;
  readonly total_cents: number;
  readonly stripe_payment_intent_id: string | null;
};

export type BackfillReport = {
  readonly filled: readonly { readonly orderNumber: string; readonly feeCents: number }[];
  readonly unsettled: readonly string[];
  readonly withoutPayment: readonly string[];
  readonly failed: readonly { readonly orderNumber: string; readonly reason: string }[];
};

export function parseLimit(argv: readonly string[], fallback = 200): number {
  const index = argv.indexOf("--limit");
  const value = index >= 0 ? Number(argv[index + 1]) : Number.NaN;
  return Number.isSafeInteger(value) && value > 0 && value <= 2000 ? value : fallback;
}

/** Cents as euros, for the report only. */
const euros = (cents: number) => `€${(cents / 100).toFixed(2).replace(".", ",")}`;

export async function backfillPaymentFees(
  supabase: SupabaseClient<Database>,
  stripe: StripeClient,
  options: { readonly limit: number; readonly apply: boolean },
): Promise<BackfillReport> {
  const { data, error } = await supabase
    .from("orders")
    .select("id,order_number,total_cents,stripe_payment_intent_id")
    .in("payment_status", ["paid", "refunded"])
    .is("payment_fee_cents", null)
    .order("created_at", { ascending: false })
    .limit(options.limit);
  if (error) throw new Error(`Ordini non leggibili: ${error.message}`);

  const filled: { orderNumber: string; feeCents: number }[] = [];
  const unsettled: string[] = [];
  const withoutPayment: string[] = [];
  const failed: { orderNumber: string; reason: string }[] = [];

  for (const order of (data ?? []) as readonly PendingOrder[]) {
    if (!order.stripe_payment_intent_id) {
      withoutPayment.push(order.order_number);
      continue;
    }
    let fee: number | null;
    try {
      fee = await stripePaymentFee(stripe, order.stripe_payment_intent_id);
    } catch (error) {
      failed.push({ orderNumber: order.order_number, reason: error instanceof Error ? error.message : String(error) });
      continue;
    }
    if (fee === null) {
      unsettled.push(order.order_number);
      continue;
    }
    if (options.apply) {
      const written = await supabase.rpc("record_order_payment_fee", { p_order_id: order.id, p_fee_cents: fee });
      if (written.error) {
        failed.push({ orderNumber: order.order_number, reason: written.error.message });
        continue;
      }
    }
    filled.push({ orderNumber: order.order_number, feeCents: fee });
  }
  return { filled, unsettled, withoutPayment, failed };
}

async function main(argv: readonly string[]): Promise<void> {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // No file: the keys may still come from the shell environment.
  }
  const stripeKey = process.env["STRIPE_SECRET_KEY"]?.trim();
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"]?.trim();
  const secretKey = process.env["SUPABASE_SECRET_KEY"]?.trim();
  const missing = [
    ["STRIPE_SECRET_KEY", stripeKey],
    ["NEXT_PUBLIC_SUPABASE_URL", url],
    ["SUPABASE_SECRET_KEY", secretKey],
  ].flatMap(([name, value]) => (value ? [] : [name as string]));
  if (!stripeKey || !url || !secretKey) {
    console.error(`Mancano queste variabili in .env.local: ${missing.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const apply = argv.includes("--apply");
  const limit = parseLimit(argv);
  const supabase = createClient<Database>(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  console.log(`Database: ${new URL(url).host} · al massimo ${limit} ordini`);
  console.log(apply ? "Scrittura attiva.\n" : "Anteprima: nessuna modifica. Rilancia con --apply per scrivere.\n");

  const report = await backfillPaymentFees(supabase, createStripeClient(stripeKey), { limit, apply });
  for (const order of report.filled) {
    console.log(`${apply ? "scritta" : "da scrivere"}  ${order.orderNumber}  commissione ${euros(order.feeCents)}`);
  }
  const total = report.filled.reduce((sum, order) => sum + order.feeCents, 0);
  console.log(`\n${report.filled.length} ordini · commissioni totali ${euros(total)}`);
  if (report.unsettled.length) console.log(`${report.unsettled.length} in attesa che Stripe chiuda la transazione: ${report.unsettled.slice(0, 5).join(", ")}…`);
  if (report.withoutPayment.length) console.log(`${report.withoutPayment.length} senza pagamento Stripe (incasso manuale): ${report.withoutPayment.slice(0, 5).join(", ")}…`);
  for (const failure of report.failed) console.error(`errore  ${failure.orderNumber}: ${failure.reason}`);
  if (report.failed.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2));
}
