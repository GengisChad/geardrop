import { Crown, Package, Zap } from "lucide-react";

const ITEMS = [
  { Icon: Package, text: "Spedizione gratuita sopra 59€" },
  { Icon: Zap, text: "Nuovi drop ogni settimana" },
  { Icon: Crown, text: "Club GEAR//DROP" },
] as const;

/**
 * Graphite bar above the header. On mobile the three claims marquee instead of
 * wrapping — the mockup shows all three on one line and they will not fit at 375px.
 */
export function AnnouncementBar() {
  return (
    <div className="on-dark relative overflow-hidden bg-graphite text-white">
      <div className="mx-auto hidden max-w-[1400px] items-center justify-between px-6 py-2.5 md:flex">
        {ITEMS.map(({ Icon, text }) => (
          <p key={text} className="gd-display flex items-center gap-2 text-[0.6875rem] font-bold tracking-wider">
            <Icon className="size-3.5 text-lime" strokeWidth={2.5} aria-hidden="true" />
            {text}
          </p>
        ))}
      </div>

      <div className="gd-scrollbar-none flex overflow-hidden py-2.5 md:hidden">
        <div className="flex shrink-0 animate-[gd-marquee_18s_linear_infinite] items-center gap-8 pr-8">
          {[...ITEMS, ...ITEMS].map(({ Icon, text }, i) => (
            <p
              key={`${text}-${i}`}
              className="gd-display flex shrink-0 items-center gap-2 text-[0.6875rem] font-bold tracking-wider"
              aria-hidden={i >= ITEMS.length}
            >
              <Icon className="size-3.5 text-lime" strokeWidth={2.5} aria-hidden="true" />
              {text}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
