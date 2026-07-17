import Link from "next/link";
import { Crown, Gift, Percent, Sparkles, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";

/** "GEAR//DROP CLUB" band from mockup-home-lower. */
const PERKS = [
  { Icon: Percent, title: "5% di sconto", copy: "Su tutti gli ordini" },
  { Icon: Sparkles, title: "Drop in anteprima", copy: "Accesso anticipato" },
  { Icon: Trophy, title: "Punti fedeltà", copy: "1€ = 10 punti" },
  { Icon: Gift, title: "Regali esclusivi", copy: "Solo per i membri" },
] as const;

export function ClubBand() {
  return (
    <section className="mx-auto max-w-[1400px] px-4 pb-12 sm:px-6">
      <div
        data-testid="club-glass"
        className="gd-glass gd-editorial-panel relative overflow-hidden rounded-[--radius-glass-lg]"
      >
        <div
          aria-hidden="true"
          className="absolute -left-10 top-1/2 size-72 -translate-y-1/2 rounded-full bg-violet/12 blur-3xl"
        />

        <div className="relative grid gap-6 p-6 lg:grid-cols-[minmax(0,18rem)_1fr] lg:items-center lg:gap-8 lg:p-8">
          <div className="flex items-start gap-4">
            <span className="gd-glass-compact inline-flex size-12 shrink-0 items-center justify-center rounded-2xl">
              <Crown className="size-6 text-violet" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-h3 font-bold text-graphite">GEAR//DROP Club</h2>
              <p className="mt-1 text-small text-grey-600">Entra nel club. Sblocca vantaggi esclusivi.</p>
              <Button as={Link} href="/account" variant="primary" size="sm" className="mt-4">
                Scopri di più
              </Button>
            </div>
          </div>

          <ul className="grid grid-cols-2 gap-4 border-t border-violet/10 pt-6 lg:grid-cols-4 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            {PERKS.map(({ Icon, title, copy }) => (
              <li key={title} className="flex items-center gap-3">
                <span className="gd-glass-compact inline-flex size-10 shrink-0 items-center justify-center rounded-2xl">
                  <Icon className="size-4 text-violet" strokeWidth={2} aria-hidden="true" />
                </span>
                <span>
                  <span className="gd-display block text-[0.6875rem] font-bold tracking-wider text-graphite">{title}</span>
                  <span className="block text-[0.6875rem] leading-tight text-grey-600">{copy}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
