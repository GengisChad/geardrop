import { Hourglass, Truck, XCircle, CheckCircle2 } from "lucide-react";
import { STOCK_HINT, STOCK_LABEL } from "@/lib/labels";
import type { StockStatus } from "@/lib/commerce/types";
import { cn } from "@/lib/cn";

/** Status legend row from mockup-home-upper. */
const ORDER: readonly { status: StockStatus; Icon: typeof Truck; ring: string; tone: string }[] = [
  { status: "pre-ordine", Icon: Hourglass, ring: "bg-preorder-bg", tone: "text-preorder" },
  { status: "in-arrivo", Icon: Truck, ring: "bg-incoming-bg", tone: "text-graphite" },
  { status: "esaurito", Icon: XCircle, ring: "bg-soldout-solid", tone: "text-white" },
  { status: "disponibile", Icon: CheckCircle2, ring: "bg-available-solid", tone: "text-white" },
];

export function StatusLegend() {
  return (
    <section className="mx-auto max-w-[1400px] px-4 pb-10 sm:px-6">
      <h2 className="sr-only">Legenda della disponibilità</h2>
      <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-[--radius-card] border border-grey-200 bg-grey-200 lg:grid-cols-4">
        {ORDER.map(({ status, Icon, ring, tone }) => (
          <li key={status} className="flex items-center gap-3 bg-white p-4">
            <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-full", ring)}>
              <Icon className={cn("size-4.5", tone)} strokeWidth={2.5} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="gd-display block text-small font-bold tracking-wider text-graphite">
                {STOCK_LABEL[status]}
              </span>
              <span className="block text-[0.6875rem] leading-tight text-grey-600">{STOCK_HINT[status]}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
