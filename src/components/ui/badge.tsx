import { PROMO_CHIP, PROMO_LABEL, STOCK_CHIP, STOCK_LABEL } from "@/lib/labels";
import type { PromoTag, StockStatus } from "@/lib/commerce/types";
import { cn } from "@/lib/cn";

const PILL =
  "gd-display gd-chamfer inline-flex shrink-0 items-center px-2.5 py-1 text-[0.6875rem] font-bold leading-none tracking-[0.12em]";

/** Compact stock chip — design system §03 "STOCK CHIP (COMPATTO)". */
export function StockBadge({ status, className }: { status: StockStatus; className?: string }) {
  return <span className={cn(PILL, STOCK_CHIP[status], className)}>{STOCK_LABEL[status]}</span>;
}

/** Promo chip; "Novità" wears the animated holographic foil. */
export function PromoBadge({ tag, className }: { tag: PromoTag; className?: string }) {
  return <span className={cn(PILL, "h-[1.625rem]", PROMO_CHIP[tag], className)}>{PROMO_LABEL[tag]}</span>;
}

/** Numbered rank badge; first place is lime. */
export function RankBadge({ rank }: { rank: number }) {
  return (
    <span
      className={cn(
        "gd-display gd-chamfer tabular inline-flex size-[1.625rem] items-center justify-center text-small font-bold leading-none",
        rank === 1 ? "bg-lime text-void" : "bg-white/10 text-graphite",
      )}
      aria-hidden="true"
    >
      {rank}
    </span>
  );
}
