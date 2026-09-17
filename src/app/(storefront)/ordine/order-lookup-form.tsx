"use client";

import { useActionState } from "react";
import { CheckCircle2, Package, PackageCheck, Truck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { PREORDER_DELIVERY } from "@/lib/labels";
import { trackingLink } from "@/lib/orders/carriers";
import { lookupOrderAction, type OrderLookupResult } from "./actions";

const STATUS_LABELS: Record<string, string> = {
  pending: "In attesa",
  confirmed: "Confermato",
  processing: "In lavorazione",
  shipped: "Spedito",
  completed: "Completato",
  cancelled: "Annullato",
};

const STATUS_STEPS = ["confirmed", "processing", "shipped", "completed"] as const;
type ActiveStep = (typeof STATUS_STEPS)[number];

function stepIndex(status: string): number {
  const idx = STATUS_STEPS.indexOf(status as ActiveStep);
  return idx === -1 ? -1 : idx;
}

const dateFormat = new Intl.DateTimeFormat("it-IT", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Rome",
});

export function OrderLookupForm() {
  const [result, action, pending] = useActionState<OrderLookupResult | null, FormData>(
    lookupOrderAction,
    null,
  );

  return (
    <div className="mx-auto max-w-lg">
      <form action={action} className="gd-glass-panel flex flex-col gap-5 p-6">
        <div className="flex flex-col gap-1.5">
          <label
            className="text-small font-medium text-graphite"
            htmlFor="orderNumber"
          >
            Numero ordine
          </label>
          <input
            className={inputClass(false)}
            id="orderNumber"
            name="orderNumber"
            placeholder="GD-XXXXXXXX"
            required
            type="text"
            autoComplete="off"
            maxLength={80}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            className="text-small font-medium text-graphite"
            htmlFor="email"
          >
            Email dell&apos;ordine
          </label>
          <input
            className={inputClass(false)}
            id="email"
            name="email"
            placeholder="nome@esempio.com"
            required
            type="email"
            autoComplete="email"
            maxLength={320}
          />
        </div>

        <Button disabled={pending} type="submit" variant="primary" fullWidth>
          {pending ? "Ricerca…" : "Traccia ordine"}
        </Button>
      </form>

      {result?.ok === false ? (
        <div className="mt-6 flex items-start gap-3 rounded-[--radius-glass] border border-soldout/30 bg-soldout-bg px-4 py-3">
          <XCircle className="mt-0.5 size-4 shrink-0 text-soldout" aria-hidden="true" />
          <p className="text-small text-soldout">{result.message}</p>
        </div>
      ) : null}

      {result?.ok === true ? <OrderResult order={result.order} /> : null}
    </div>
  );
}

function OrderResult({
  order,
}: {
  readonly order: Extract<OrderLookupResult, { ok: true }>["order"];
}) {
  const link = trackingLink(order.tracking_carrier, order.tracking_code, order.tracking_url);
  const current = stepIndex(order.status);
  const cancelled = order.status === "cancelled";
  const hasPreorder = order.items.some((item) => item.preorder_quantity > 0);

  return (
    <div className="mt-6 flex flex-col gap-5">
      <div className="gd-glass-panel p-6">
        <p className="text-small text-grey-600">Ordine</p>
        <p className="mt-1 text-h3 font-bold text-graphite">{order.order_number}</p>
        <p className="mt-1 text-small text-grey-600">
          Ricevuto il{" "}
          {dateFormat.format(new Date(order.created_at))}
        </p>
      </div>

      {/* Status timeline */}
      <div className="gd-glass-panel p-6">
        <h2 className="mb-4 text-small font-medium text-graphite">Stato spedizione</h2>

        {cancelled ? (
          <div className="flex items-center gap-2.5 text-soldout">
            <XCircle className="size-5 shrink-0" aria-hidden="true" />
            <span className="font-medium">Annullato</span>
          </div>
        ) : (
          <ol className="flex flex-col gap-3">
            {STATUS_STEPS.map((step, index) => {
              const reached = current >= index;
              const active = current === index;
              return (
                <li
                  key={step}
                  className="flex items-center gap-3"
                  aria-current={active ? "step" : undefined}
                >
                  <span
                    className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-bold transition-colors ${
                      reached
                        ? "bg-lime text-void"
                        : "border border-white/15 text-grey-600"
                    }`}
                    aria-hidden="true"
                  >
                    {reached ? (
                      step === "shipped" ? (
                        <Truck className="size-3.5" />
                      ) : step === "completed" ? (
                        <PackageCheck className="size-3.5" />
                      ) : (
                        <CheckCircle2 className="size-3.5" />
                      )
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span
                    className={`text-small ${reached ? "font-medium text-graphite" : "text-grey-600"}`}
                  >
                    {STATUS_LABELS[step] ?? step}
                    {step === "shipped" && order.shipped_at
                      ? ` · ${dateFormat.format(new Date(order.shipped_at))}`
                      : ""}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {hasPreorder ? (
          <p className="mt-4 text-[0.6875rem] text-grey-600">
            <strong>Pre-ordine:</strong> {PREORDER_DELIVERY.toLowerCase()}.
          </p>
        ) : null}
      </div>

      {/* Tracking link */}
      {link ? (
        <div className="gd-glass-panel flex items-center gap-4 p-5">
          <Package className="size-6 shrink-0 text-lime" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-small font-medium text-graphite">
              {order.tracking_carrier ?? "Corriere"}
              {order.tracking_code ? ` · ${order.tracking_code}` : ""}
            </p>
          </div>
          <a
            href={link}
            rel="noopener noreferrer"
            target="_blank"
            className="gd-display text-[0.6875rem] font-bold tracking-[0.08em] text-lime underline-offset-2 hover:underline"
          >
            Segui il pacco
          </a>
        </div>
      ) : null}

      {/* Items */}
      {order.items.length > 0 ? (
        <div className="gd-glass-panel p-6">
          <h2 className="mb-3 text-small font-medium text-graphite">
            Prodotti ({order.items.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {order.items.map((item, index) => (
              <li
                key={index}
                className="flex items-baseline justify-between gap-4 text-small"
              >
                <span className="text-graphite">{item.product_name_snapshot}</span>
                <span className="shrink-0 text-grey-600">
                  {item.quantity === item.preorder_quantity
                    ? `${item.quantity} × (pre-ordine)`
                    : item.preorder_quantity > 0
                      ? `${item.quantity} × (${item.preorder_quantity} in pre-ordine)`
                      : `${item.quantity} ×`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
