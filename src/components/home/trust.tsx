import { Fragment } from "react";
import { Lock, RotateCcw, Truck } from "lucide-react";
import { cn } from "@/lib/cn";
import { FREE_SHIPPING_FROM_LABEL, SHIPPING_FLAT_LABEL, STANDARD_DELIVERY } from "@/lib/labels";

type TrustItem = { readonly Icon: typeof Truck; readonly title: string; readonly sub: string };

/**
 * The three promises checkout actually keeps: Stripe payment (card and PayPal, owner 2026-10-13), flat shipping, free returns. The
 * delivery time is the in-stock one unless the page sells a pre-order.
 */
function trustItems(delivery: string): readonly TrustItem[] {
  return [
    { Icon: Lock, title: "Pagamento sicuro", sub: "Carta, PayPal, Apple Pay o Google Pay sulla pagina protetta di Stripe." },
    { Icon: Truck, title: `Spedizione da ${SHIPPING_FLAT_LABEL}`, sub: `${delivery}. Gratis da ${FREE_SHIPPING_FROM_LABEL}. Solo in Italia.` },
    { Icon: RotateCcw, title: "Reso gratuito", sub: "30 giorni per ripensarci: la spedizione del reso la paghiamo noi." },
  ];
}

/**
 * Full-bleed lime band for the homepage and catalogue: the promises set like a decal strip,
 * separated by violet slashes. `className` spaces the band from what follows.
 */
export function TrustBandDark({ className }: { className?: string }) {
  return (
    <div className={className}>
      <section className="bg-lime text-void">
        <h2 className="sr-only">Perché comprare da GEAR//DROP</h2>
        <ul className="mx-auto grid max-w-[1400px] gap-6 px-4 py-9 sm:grid-cols-3 sm:px-6 md:py-12 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center lg:gap-7 lg:px-10">
          {trustItems(STANDARD_DELIVERY).map(({ title, sub }, index) => (
            <Fragment key={title}>
              {index > 0 ? (
                <li aria-hidden="true" className="gd-display-wide hidden text-[4rem] font-black leading-none text-violet lg:block">
                  {"//"}
                </li>
              ) : null}
              <li className="min-w-0">
                <h3 className="text-[1.6rem] font-extrabold leading-[0.95] sm:text-[1.3rem] sm:[font-stretch:118%] lg:text-[1.9rem] lg:[font-stretch:132%]">{title}</h3>
                <p className="mt-2 max-w-[36ch] text-small leading-relaxed sm:text-[0.9375rem]">{sub}</p>
              </li>
            </Fragment>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** Tighter row of carbon panels; a pre-order page passes its own delivery time. */
export function TrustBarLight({ className, delivery = STANDARD_DELIVERY }: { className?: string; delivery?: string }) {
  return (
    <section className={cn("mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-10", className)}>
      <h2 className="sr-only">Perché comprare da GEAR//DROP</h2>
      <ul className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        {trustItems(delivery).map(({ Icon, title, sub }) => (
          <li key={title} className="gd-hud flex items-start gap-3.5 p-4">
            <Icon className="mt-0.5 size-5 shrink-0 text-lime" strokeWidth={2} aria-hidden="true" />
            <span>
              <span className="gd-display block text-[1rem] font-bold tracking-[0.04em]">{title}</span>
              <span className="mt-1 block text-small leading-snug text-grey-600">{sub}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
