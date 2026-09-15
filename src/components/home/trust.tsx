import { Lock, RotateCcw, Truck } from "lucide-react";
import { cn } from "@/lib/cn";

type TrustItem = { readonly Icon: typeof Truck; readonly title: string; readonly sub: string };

/** The three promises checkout actually keeps: Stripe payment, flat shipping, free returns. */
const ITEMS: readonly TrustItem[] = [
  { Icon: Lock, title: "Pagamento sicuro", sub: "Paghi sulla pagina protetta di Stripe con carta e i wallet disponibili." },
  { Icon: Truck, title: "Spedizione €4,90", sub: "Gratis per ordini da €59 in su." },
  { Icon: RotateCcw, title: "Reso gratuito", sub: "30 giorni per ripensarci: la spedizione del reso la paghiamo noi." },
];

function TrustHud({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <section className={cn("mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-10", className)}>
      <h2 className="sr-only">Perché comprare da GEAR//DROP</h2>
      <ul className={cn("grid gap-3 sm:gap-5", compact ? "sm:grid-cols-3" : "md:grid-cols-3")}>
        {ITEMS.map(({ Icon, title, sub }) => (
          <li key={title} className={cn("gd-hud flex items-start gap-4", compact ? "p-4" : "p-5 sm:p-6")}>
            <span className="grid size-12 shrink-0 place-items-center border border-lime/25 bg-lime/[0.08] text-lime">
              <Icon className="size-5" strokeWidth={1.8} aria-hidden="true" />
            </span>
            <span>
              <span className="gd-display block text-[1.0625rem] font-bold tracking-[0.04em]">{title}</span>
              <span className="mt-1 block text-small leading-snug text-grey-600">{sub}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Full HUD band for the homepage and catalogue. */
export function TrustBandDark({ className }: { className?: string }) {
  return <TrustHud {...(className ? { className } : {})} />;
}

/** Tighter row for the product page. */
export function TrustBarLight({ className }: { className?: string }) {
  return <TrustHud {...(className ? { className } : {})} compact />;
}
