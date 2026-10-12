import type { ReactNode } from "react";
import { Hourglass, Lock, RotateCcw, Truck } from "lucide-react";
import { PARTNER_SHIPPING_METHOD, SHIPPING_METHODS, FREE_SHIPPING_THRESHOLD } from "@/data/catalog";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/lib/commerce/types";
import { cn } from "@/lib/cn";

type DeliverySummaryProps = { product: Product };

/** Short € label without a trailing ",00". */
const eur = (cents: number) =>
  formatPrice({ amount: cents, currency: "EUR" }).replace(/,00$/, "");

type Row = { readonly key: string; readonly icon: typeof Truck; readonly tone: string; readonly text: ReactNode };

/**
 * Compact delivery block right below the cart button on the PDP (owner, 2026-10-12): what the
 * parcel costs, when it arrives, returns and payment, at the moment of deciding. It replaced the
 * three trust cards that used to sit under the grid and said the same things further down.
 * Prices always come from the catalogue constants, so they cannot drift from checkout.
 */
export function DeliverySummary({ product }: DeliverySummaryProps) {
  const inpost = SHIPPING_METHODS.find((m) => m.code === "inpost-point")!;
  const poste = SHIPPING_METHODS.find((m) => m.code === "standard")!;
  const method = (label: string, cents: number) => (
    <>
      <span className="font-medium text-graphite">{label}</span>
      {" · "}
      {eur(cents)}
    </>
  );
  const free: Row = { key: "free", icon: Truck, tone: "text-lime", text: `Gratis da ${eur(FREE_SHIPPING_THRESHOLD)}` };
  const stripe: Row = { key: "stripe", icon: Lock, tone: "text-violet-soft", text: "Pagamento sicuro sulla pagina di Stripe" };

  const rows: readonly Row[] = product.consignment
    ? [
        // Takara consignment: the partner ships it to a Poste point or Locker from his warehouse.
        { key: "partner", icon: Truck, tone: "text-violet-soft", text: method(PARTNER_SHIPPING_METHOD.label, PARTNER_SHIPPING_METHOD.priceCents) },
        { key: "partner-time", icon: Hourglass, tone: "text-violet-soft", text: "Spedito dal nostro partner · 2-6 giorni lavorativi" },
        free,
        // No 30-day return row: that policy covers the parcels the shop ships itself; the
        // partner's return terms are not set down anywhere yet.
        stripe,
      ]
    : [
        // A pre-order's wait is not repeated here: the status panel right above already says it.
        { key: "inpost", icon: Truck, tone: "text-violet-soft", text: method(inpost.label, inpost.priceCents) },
        { key: "poste", icon: Truck, tone: "text-violet-soft", text: method(poste.label, poste.priceCents) },
        free,
        { key: "returns", icon: RotateCcw, tone: "text-violet-soft", text: "Reso gratuito entro 30 giorni" },
        stripe,
      ];

  return (
    <ul data-testid="delivery-summary" className="mt-4 flex flex-col gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
      {rows.map(({ key, icon: Icon, tone, text }) => (
        <li key={key} className="flex items-start gap-2.5 text-small text-grey-600">
          <Icon className={cn("mt-0.5 size-3.5 shrink-0", tone)} aria-hidden="true" />
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}
