import { Headphones, Lock, RotateCcw, ShieldCheck, Truck, Users } from "lucide-react";
import { cn } from "@/lib/cn";

type TrustItem = { Icon: typeof Truck; title: string; lines: readonly [string, string] };

/** Dark band from mockup-home-upper. */
const DARK_ITEMS: readonly TrustItem[] = [
  { Icon: Truck, title: "Spedizione veloce", lines: ["Consegna rapida in", "tutta Italia"] },
  { Icon: ShieldCheck, title: "Prodotti originali", lines: ["Solo prodotti ufficiali", "Beyblade X"] },
  { Icon: Lock, title: "Checkout sicuro", lines: ["Pagamenti protetti", "al 100%"] },
  { Icon: Users, title: "Scelti dai blader", lines: ["La community italiana", "si fida di noi"] },
];

/** Light bar from mockup-home-lower / the PDP. */
const LIGHT_ITEMS: readonly TrustItem[] = [
  { Icon: Truck, title: "Spedizione veloce", lines: ["Consegna rapida in tutta Italia", ""] },
  // No gateway is integrated: naming PayPal, cards or Klarna here would promise a
  // checkout the backend cannot honour.
  { Icon: Lock, title: "Checkout sicuro", lines: ["Connessione protetta SSL", ""] },
  { Icon: RotateCcw, title: "Reso facile", lines: ["30 giorni per cambiare idea", ""] },
  { Icon: Headphones, title: "Assistenza dedicata", lines: ["Siamo qui per te", ""] },
];

export function TrustBandDark({ className }: { className?: string }) {
  return (
    <section className={cn("mx-auto max-w-[1400px] px-4 sm:px-6", className)}>
      <h2 className="sr-only">Perché comprare da GEAR//DROP</h2>
      {/* Dark frosted glass floating on the light page. */}
      <div className="gd-glass-dark relative overflow-hidden rounded-[--radius-glass-lg]">
        <div
          aria-hidden="true"
          className="absolute -left-16 top-1/2 size-72 -translate-y-1/2 rounded-full bg-violet/25 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -right-10 -top-10 size-52 rounded-full bg-lime/10 blur-3xl"
        />
        <ul className="relative grid grid-cols-2 gap-x-4 gap-y-6 p-6 sm:gap-8 sm:p-8 lg:grid-cols-4">
          {DARK_ITEMS.map(({ Icon, title, lines }) => (
            <li key={title} className="flex items-center gap-3.5">
              <span className="gd-glass-dark inline-flex size-11 shrink-0 items-center justify-center rounded-2xl">
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
      </div>
    </section>
  );
}

export function TrustBarLight({ className }: { className?: string }) {
  return (
    <section className={cn("mx-auto max-w-[1400px] px-4 sm:px-6", className)}>
      <h2 className="sr-only">Servizi GEAR//DROP</h2>
      <ul className="gd-glass-card grid grid-cols-2 gap-x-4 gap-y-5 rounded-[--radius-glass] p-5 sm:gap-6 sm:p-6 lg:grid-cols-4">
        {LIGHT_ITEMS.map(({ Icon, title, lines }) => (
          <li key={title} className="flex items-center gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-violet-tint ring-1 ring-white/60">
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
