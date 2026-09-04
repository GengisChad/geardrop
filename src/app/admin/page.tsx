import type { Metadata } from "next";
import Link from "next/link";
import { getStaffSession, hasAtLeast } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/orders";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Panoramica" };

type Tile = { label: string; value: string; hint?: string };

/**
 * Counts are read with `head: true`, so PostgREST returns the count without the rows —
 * the dashboard never pulls order PII it does not display.
 */
export default async function AdminHomePage() {
  const session = await getStaffSession("editor");
  const supabase = await createClient();
  const canSeeOrders = session ? hasAtLeast(session.role, "admin") : false;

  const [{ count: productCount }, { count: outOfStock }, { data: settings }] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("stock_quantity", 0),
    supabase.from("store_settings").select("checkout_enabled, max_quantity_per_line").eq("id", 1).maybeSingle(),
  ]);

  const statusCounts: Partial<Record<OrderStatus, number>> = {};
  let revenueCents = 0;

  if (canSeeOrders) {
    const statuses = Object.keys(ORDER_STATUS_LABELS) as OrderStatus[];
    const counts = await Promise.all(
      statuses.map((status) =>
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", status),
      ),
    );
    statuses.forEach((status, index) => {
      statusCounts[status] = counts[index]?.count ?? 0;
    });

    const { data: paid } = await supabase.from("orders").select("total_cents").neq("status", "cancelled");
    revenueCents = (paid ?? []).reduce((sum, row) => sum + row.total_cents, 0);
  }

  const tiles: Tile[] = [
    { label: "Prodotti", value: String(productCount ?? 0), hint: `${outOfStock ?? 0} a zero pezzi` },
    {
      label: "Vendite",
      value: settings?.checkout_enabled ? "Aperte" : "Chiuse",
      hint: `max ${settings?.max_quantity_per_line ?? 10} pezzi per riga`,
    },
  ];

  if (canSeeOrders) {
    tiles.push(
      { label: "Ordini in attesa", value: String(statusCounts.pending ?? 0), hint: "da confermare" },
      {
        label: "Valore ordini",
        value: formatPrice({ amount: revenueCents, currency: "EUR" }),
        hint: "annullati esclusi",
      },
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <li key={tile.label} className="gd-glass-card rounded-[--radius-glass] p-5">
            <p className="gd-display text-[0.625rem] font-bold uppercase tracking-wider text-grey-600">{tile.label}</p>
            <p className="mt-2 gd-display-wide text-[1.75rem] font-extrabold text-graphite">{tile.value}</p>
            {tile.hint ? <p className="text-[0.6875rem] text-grey-600">{tile.hint}</p> : null}
          </li>
        ))}
      </ul>

      {canSeeOrders ? (
        <section>
          <h2 className="gd-display text-small font-bold tracking-wider text-graphite">Ordini per stato</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((status) => (
              <li
                key={status}
                className="rounded-full border border-grey-300 px-4 py-1.5 text-[0.6875rem] text-grey-600"
              >
                {ORDER_STATUS_LABELS[status]}:{" "}
                <strong className="text-graphite">{statusCounts[status] ?? 0}</strong>
              </li>
            ))}
          </ul>
          <Link href="/admin/ordini" className="mt-4 inline-block text-small font-bold text-violet hover:text-violet-ink">
            Apri gli ordini →
          </Link>
        </section>
      ) : (
        <p className="text-small text-grey-600">
          Il ruolo <strong>editor</strong> gestisce il catalogo. Ordini, magazzino e coupon richiedono un ruolo admin.
        </p>
      )}
    </div>
  );
}
