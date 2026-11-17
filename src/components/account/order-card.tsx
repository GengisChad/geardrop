import { Truck, XCircle } from "lucide-react";
import { ParcelUpdates } from "@/components/orders/parcel-updates";
import { trackingLink } from "@/lib/orders/carriers";
import { ORDER_STATUS_LABEL, ORDER_STEPS, orderProgress, parcelDeliveredAt } from "@/lib/orders/customer-order-status";
import type { CustomerOrder } from "@/lib/orders/customer-orders";

const EURO = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
// The server renders in UTC: dates and times are the buyer's, in Italy.
const DAY = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", timeZone: "Europe/Rome" });
const DATE = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "numeric", timeZone: "Europe/Rome" });

/** The date a step was reached, when the order or InPost records it. */
function stepDate(step: (typeof ORDER_STEPS)[number], order: CustomerOrder, deliveredAt: string | null): string | null {
  if (step === "shipped" && order.shippedAt) return DAY.format(new Date(order.shippedAt));
  if (step === "completed" && deliveredAt) return DAY.format(new Date(deliveredAt));
  return null;
}

/**
 * One order on the account page: how far it got, and once shipped where the parcel is. For an
 * InPost parcel still travelling the latest event comes from InPost itself, with every step of
 * the journey one tap away; other couriers get their own tracking page.
 */
export function OrderCard({ order }: { readonly order: CustomerOrder }) {
  const cancelled = order.status === "cancelled";
  const current = orderProgress(order.status, order.parcelEvents);
  const deliveredAt = order.deliveredAt ?? parcelDeliveredAt(order.parcelEvents);
  const link = trackingLink(order.trackingCarrier, order.trackingCode, order.trackingUrl);

  return (
    <li className="gd-glass-card rounded-2xl px-4 py-4" data-testid="order-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="gd-display text-small font-bold text-graphite">{order.orderNumber}</span>
        <span className="text-[0.6875rem] text-grey-600">{DATE.format(new Date(order.createdAt))}</span>
        <span className="text-small font-bold text-graphite">{EURO.format(order.totalCents / 100)}</span>
      </div>

      {cancelled ? (
        <p className="mt-3 flex items-center gap-2 text-small font-bold text-soldout" data-testid="order-status">
          <XCircle className="size-4 shrink-0" aria-hidden="true" />
          {ORDER_STATUS_LABEL.cancelled}
        </p>
      ) : (
        <ol className="mt-3 grid grid-cols-4 gap-1.5" aria-label="Stato dell'ordine" data-testid="order-status">
          {ORDER_STEPS.map((step, index) => {
            const reached = index <= current;
            const date = reached ? stepDate(step, order, deliveredAt) : null;
            return (
              <li key={step} className="flex min-w-0 flex-col gap-1" aria-current={index === current ? "step" : undefined}>
                <span className={`h-1.5 rounded-full ${reached ? "bg-lime" : "bg-white/10"}`} aria-hidden="true" />
                <span className={`text-[0.625rem] leading-tight ${reached ? "font-bold text-graphite" : "text-grey-600"}`}>
                  {ORDER_STATUS_LABEL[step]}
                  {date ? <span className="block font-normal text-grey-600">{date}</span> : null}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {order.trackingCode || link ? (
        <div className="mt-3 rounded-xl bg-white/[0.04] p-3" data-testid="order-parcel">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-graphite">
            <Truck className="size-4 shrink-0 text-violet-soft" aria-hidden="true" />
            <span className="font-bold">{order.trackingCarrier ?? "Corriere"}</span>
            {order.trackingCode ? <span className="break-all text-grey-600">{order.trackingCode}</span> : null}
            {link ? (
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="gd-display ml-auto text-[0.6875rem] font-bold tracking-[0.08em] text-lime underline-offset-2 hover:underline"
              >
                Segui il pacco
              </a>
            ) : null}
          </p>

          <ParcelUpdates events={order.parcelEvents} />
        </div>
      ) : !cancelled && current < ORDER_STEPS.indexOf("shipped") ? (
        <p className="mt-3 text-[0.6875rem] text-grey-600">
          Quando lo spediamo trovi qui corriere e codice, e ti arriva un&rsquo;email.
        </p>
      ) : null}

      {order.items.length > 0 ? (
        <p className="mt-3 text-[0.6875rem] text-grey-600">
          {order.items
            .map((item) =>
              item.preorderQuantity > 0
                ? `${item.quantity} × ${item.name} (${item.preorderQuantity === item.quantity ? "pre-ordine" : `${item.preorderQuantity} in pre-ordine`})`
                : `${item.quantity} × ${item.name}`,
            )
            .join(" · ")}
        </p>
      ) : null}
    </li>
  );
}
