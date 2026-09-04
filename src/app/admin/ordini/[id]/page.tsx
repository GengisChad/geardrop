import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import {
  getOrderById,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABELS,
} from "@/lib/orders";
import { formatPrice } from "@/lib/format";
import { setOrderStatusAction } from "@/app/admin/actions";
import { AdminField, AdminForm, adminControlClass } from "@/components/admin/admin-form";

export const metadata: Metadata = { title: "Dettaglio ordine" };

const dateFormatter = new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" });

type Address = {
  first_name?: string;
  last_name?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  province?: string;
  phone?: string;
};

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getStaffSession("admin"))) notFound();

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const order = await getOrderById(id);
  if (!order) notFound();

  const money = (cents: number) => formatPrice({ amount: cents, currency: "EUR" });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin/ordini" className="text-small text-violet hover:text-violet-ink">
          ← Tutti gli ordini
        </Link>
        <h2 className="mt-2 gd-display-wide text-[1.5rem] font-extrabold text-graphite">{order.orderNumber}</h2>
        <p className="text-[0.6875rem] text-grey-600">
          {dateFormatter.format(new Date(order.createdAt))} · {order.customerEmail} · {order.shippingMethodLabel}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_minmax(0,22rem)]">
        <section>
          <h3 className="gd-display text-small font-bold tracking-wider text-graphite">Righe</h3>
          <table className="mt-3 w-full border-collapse text-small">
            <tbody>
              {order.items.map((item) => (
                <tr key={item.sku} className="border-b border-grey-200">
                  <td className="py-2.5 pr-4">
                    <span className="block text-graphite">{item.name}</span>
                    <span className="block text-[0.6875rem] text-grey-600">{item.sku}</span>
                  </td>
                  <td className="py-2.5 pr-4 text-grey-600">×{item.quantity}</td>
                  <td className="py-2.5 text-right tabular-nums">{money(item.lineTotalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <dl className="mt-4 flex flex-col gap-1 text-small">
            <div className="flex justify-between">
              <dt className="text-grey-600">Subtotale</dt>
              <dd className="tabular-nums">{money(order.subtotalCents)}</dd>
            </div>
            {order.discountCents > 0 ? (
              <div className="flex justify-between">
                <dt className="text-grey-600">Sconto</dt>
                <dd className="tabular-nums text-violet">−{money(order.discountCents)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-grey-600">Spedizione</dt>
              <dd className="tabular-nums">{money(order.shippingCents)}</dd>
            </div>
            <div className="flex justify-between border-t border-grey-200 pt-2 font-bold">
              <dt>Totale</dt>
              <dd className="tabular-nums">{money(order.totalCents)}</dd>
            </div>
          </dl>
        </section>

        <aside className="flex flex-col gap-6">
          <section className="gd-glass-card rounded-[--radius-glass] p-5">
            <h3 className="gd-display text-small font-bold tracking-wider text-graphite">Stato</h3>
            <p className="mt-1 mb-4 text-[0.6875rem] text-grey-600">
              Annullare restituisce i pezzi al magazzino. Riaprire un ordine annullato li riprende e fallisce se non
              sono più disponibili.
            </p>

            <AdminForm action={setOrderStatusAction} submitLabel="Aggiorna" variant="primary">
              <input type="hidden" name="orderId" value={order.id} />
              <AdminField label="Stato ordine">
                <select name="status" defaultValue={order.status} className={adminControlClass}>
                  {ORDER_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {ORDER_STATUS_LABELS[value]}
                    </option>
                  ))}
                </select>
              </AdminField>
              <AdminField label="Pagamento">
                <select name="paymentStatus" defaultValue={order.paymentStatus} className={adminControlClass}>
                  {PAYMENT_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {PAYMENT_STATUS_LABELS[value]}
                    </option>
                  ))}
                </select>
              </AdminField>
              <AdminField label="Nota (facoltativa)">
                <input name="note" maxLength={300} className={adminControlClass} />
              </AdminField>
            </AdminForm>
          </section>

          <OrderAddress order={order} />
        </aside>
      </div>
    </div>
  );
}

/** Address snapshots are immutable JSONB written at checkout, so they are read defensively. */
async function OrderAddress({ order }: { order: { id: number } }) {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("shipping_address, customer_phone, notes")
    .eq("id", order.id)
    .maybeSingle();

  const address = (data?.shipping_address ?? {}) as Address;

  return (
    <section className="gd-glass-card rounded-[--radius-glass] p-5">
      <h3 className="gd-display text-small font-bold tracking-wider text-graphite">Spedizione</h3>
      <address className="mt-2 not-italic text-small text-grey-600">
        {[address.first_name, address.last_name].filter(Boolean).join(" ") || "—"}
        <br />
        {address.address ?? "—"}
        <br />
        {[address.postal_code, address.city, address.province].filter(Boolean).join(" ")}
        {address.phone || data?.customer_phone ? (
          <>
            <br />
            {address.phone ?? data?.customer_phone}
          </>
        ) : null}
      </address>
      {data?.notes ? <p className="mt-3 text-[0.6875rem] text-grey-600">Note: {data.notes}</p> : null}
    </section>
  );
}
