import { PROMO_CHIP, PROMO_LABEL, STOCK_LABEL } from "@/lib/labels";
import type { PromoTag, StockStatus } from "@/lib/commerce/types";
import { cn } from "@/lib/cn";

/** Status colours for the word itself; the slanted mark beside it repeats the colour. */
const STOCK_TEXT: Record<StockStatus, string> = {
  disponibile: "text-available",
  "in-arrivo": "text-incoming",
  "pre-ordine": "text-preorder",
  esaurito: "text-soldout",
};

/** Stock status: a slanted mark and the word, so the meaning never rests on colour alone. */
export function StockBadge({
  status,
  label,
  className,
}: {
  status: StockStatus;
  /** Overrides the word, for a state the status alone cannot name (a sold-out pre-order). */
  label?: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-[0.75rem] font-semibold leading-none", STOCK_TEXT[status], className)}>
      <span aria-hidden="true" className="gd-dot size-2" />
      {label ?? STOCK_LABEL[status]}
    </span>
  );
}

/** Promo badge as a die-cut sticker with the logo's white keyline; "Novità" is holographic. */
export function PromoBadge({ tag, className }: { tag: PromoTag; className?: string }) {
  // gd-sticker-land: it lands as its card scrolls into view (globals.css), at rest everywhere else.
  return <span className={cn("gd-sticker gd-sticker-land px-2 py-1 text-[0.6875rem]", PROMO_CHIP[tag], className)}>{PROMO_LABEL[tag]}</span>;
}

/** Numbered rank badge; first place is lime. */
export function RankBadge({ rank }: { rank: number }) {
  return (
    <span
      className={cn(
        "gd-display-wide gd-chamfer tabular inline-flex h-[1.625rem] min-w-8 items-center justify-center px-2 text-small font-extrabold leading-none",
        rank === 1 ? "bg-lime text-void" : "bg-white/10 text-graphite",
      )}
      aria-hidden="true"
    >
      {rank}
    </span>
  );
}
