import { Headphones, Lock, RotateCcw, ShieldCheck, Truck, Users } from "lucide-react";
import { cn } from "@/lib/cn";

type TrustItem = { Icon: typeof Truck; title: string; lines: readonly [string, string] };

/** Dark band from mockup-home-upper, with the notched corner. */
const DARK_ITEMS: readonly TrustItem[] = [
  { Icon: Truck, title: "Spedizione veloce", lines: ["Consegna rapida in", "tutta Italia"] },
  { Icon: ShieldCheck, title: "Prodotti originali", lines: ["Solo prodotti ufficiali", "Beyblade X"] },
  { Icon: Lock, title: "Checkout sicuro", lines: ["Pagamenti protetti", "al 100%"] },
  { Icon: Users, title: "Scelti dai blader", lines: ["La community italiana", "si fida di noi"] },
];

/** Light bar from mockup-home-lower / the PDP. */
const LIGHT_ITEMS: readonly TrustItem[] = [
  { Icon: Truck, title: "Spedizione veloce", lines: ["Consegna rapida in tutta Italia", ""] },
  { Icon: Lock, title: "Pagamenti sicuri", lines: ["PayPal, Carte, Klarna", ""] },
  { Icon: RotateCcw, title: "Reso facile", lines: ["30 giorni per cambiare idea", ""] },
  { Icon: Headphones, title: "Assistenza dedicata", lines: ["Siamo qui per te", ""] },
];

export function TrustBandDark({ className }: { className?: string }) {
  return (
    <section className={cn("mx-auto max-w-[1400px] px-4 sm:px-6", className)}>
      <h2 className="sr-only">Perché comprare da GEAR//DROP</h2>
      <ul className="gd-notch-lg grid grid-cols-1 gap-px overflow-hidden rounded-[--radius-card] bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
        {DARK_ITEMS.map(({ Icon, title, lines }) => (
          <li key={title} className="flex items-center gap-4 bg-graphite p-5 lg:p-6">
            <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full border border-violet/60 bg-violet/10">
              <Icon className="size-5 text-violet" strokeWidth={2} aria-hidden="true" />
            </span>
            <span>
              <span className="gd-display block text-small font-bold tracking-wider text-white">{title}</span>
              <span className="block text-[0.6875rem] leading-tight text-grey-400">
                {lines[0]}
                {lines[1] ? (
                  <>
                    <br />
                    {lines[1]}
                  </>
                ) : null}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TrustBarLight({ className }: { className?: string }) {
  return (
    <section className={cn("mx-auto max-w-[1400px] px-4 sm:px-6", className)}>
      <h2 className="sr-only">Servizi GEAR//DROP</h2>
      <ul className="grid grid-cols-1 gap-px overflow-hidden rounded-[--radius-card] border border-grey-200 bg-grey-200 sm:grid-cols-2 lg:grid-cols-4">
        {LIGHT_ITEMS.map(({ Icon, title, lines }) => (
          <li key={title} className="flex items-center gap-3.5 bg-white p-5">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-violet-tint">
              <Icon className="size-4.5 text-violet" strokeWidth={2} aria-hidden="true" />
            </span>
            <span>
              <span className="gd-display block text-small font-bold tracking-wider text-graphite">{title}</span>
              <span className="block text-[0.6875rem] leading-tight text-grey-600">{lines[0]}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
