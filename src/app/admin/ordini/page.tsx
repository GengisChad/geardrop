import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import { listAllOrders, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, type OrderStatus } from "@/lib/orders";
import { formatPrice } from "@/lib/format";
import { appRoute } from "@/lib/routes";

export const metadata: Metadata = { title: "Ordini" };

const dateFormatter = new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" });

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ stato?: string }>;
}) {
  if (!(await getStaffSession("admin"))) notFound();

  const { stato } = await searchParams;
  const status = (Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).find((value) => value === stato);
  const orders = await listAllOrders(status ? { status } : undefined);

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Filtra per stato" className="flex flex-wrap gap-2">
        <Link
          href="/admin/ordini"
          aria-current={status ? undefined : "page"}
          className="rounded-full border border-grey-300 px-4 py-1.5 text-[0.6875rem] text-grey-600 aria-[current]:border-violet aria-[current]:text-violet"
        >
          Tutti
        </Link>
        {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((value) => (
          <Link
            key={value}
            href={appRoute(`/admin/ordini?stato=${value}`)}
            aria-current={status === value ? "page" : undefined}
            className="rounded-full border border-grey-300 px-4 py-1.5 text-[0.6875rem] text-grey-600 aria-[current]:border-violet aria-[current]:text-violet"
          >
            {ORDER_STATUS_LABELS[value]}
          </Link>
        ))}
      </nav>

      {orders.length === 0 ? (
        <p className="text-small text-grey-600">Nessun ordine con questo filtro.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-small">
            <thead>
              <tr className="border-b border-grey-300 text-left">
                <th scope="col" className="gd-display py-2 pr-4 text-[0.625rem] uppercase tracking-wider text-grey-600">
                  Ordine
                </th>
                <th scope="col" className="gd-display py-2 pr-4 text-[0.625rem] uppercase tracking-wider text-grey-600">
                  Data
                </th>
                <th scope="col" className="gd-display py-2 pr-4 text-[0.625rem] uppercase tracking-wider text-grey-600">
                  Cliente
                </th>
                <th scope="col" className="gd-display py-2 pr-4 text-[0.625rem] uppercase tracking-wider text-grey-600">
                  Stato
                </th>
                <th scope="col" className="gd-display py-2 pr-4 text-[0.625rem] uppercase tracking-wider text-grey-600">
                  Pagamento
                </th>
                <th scope="col" className="gd-display py-2 text-right text-[0.625rem] uppercase tracking-wider text-grey-600">
                  Totale
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b border-grey-200">
                  <td className="py-2.5 pr-4">
                    <Link
                      href={appRoute(`/admin/ordini/${order.id}`)}
                      className="font-bold text-violet hover:text-violet-ink"
                    >
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-4 text-grey-600">{dateFormatter.format(new Date(order.createdAt))}</td>
                  <td className="py-2.5 pr-4 text-grey-600">{order.customerEmail}</td>
                  <td className="py-2.5 pr-4">{ORDER_STATUS_LABELS[order.status]}</td>
                  <td className="py-2.5 pr-4">{PAYMENT_STATUS_LABELS[order.paymentStatus]}</td>
                  <td className="py-2.5 text-right tabular-nums">
                    {formatPrice({ amount: order.totalCents, currency: "EUR" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
