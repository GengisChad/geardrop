import { PROMO_CHIP, PROMO_LABEL, STOCK_CHIP, STOCK_LABEL } from "@/lib/labels";
import type { PromoTag, StockStatus } from "@/lib/commerce/types";
import { cn } from "@/lib/cn";

const PILL = "gd-display inline-flex items-center rounded-full px-2.5 py-1 text-[0.6875rem] font-bold leading-none tracking-wider";

/** Compact stock chip — design system §03 "STOCK CHIP (COMPATTO)". */
export function StockBadge({ status, className }: { status: StockStatus; className?: string }) {
  return <span className={cn(PILL, STOCK_CHIP[status], className)}>{STOCK_LABEL[status]}</span>;
}

/** Promo pill — design system §03 "NOVITÀ & PROMO". */
export function PromoBadge({ tag, className }: { tag: PromoTag; className?: string }) {
  return <span className={cn(PILL, PROMO_CHIP[tag], className)}>{PROMO_LABEL[tag]}</span>;
}

/** Violet type badge used on the mobile catalogue cards ("ATTACK TYPE"). */
export function TypeBadge({ children, className }: { children: string; className?: string }) {
  return <span className={cn(PILL, "bg-violet text-white", className)}>{children}</span>;
}

/** Numbered rank badge from "PIÙ VENDUTI"; first place is lime. */
export function RankBadge({ rank }: { rank: number }) {
  return (
    <span
      className={cn(
        "gd-display tabular inline-flex size-6 items-center justify-center rounded-md text-small font-bold leading-none",
        rank === 1 ? "bg-lime text-graphite" : "bg-graphite text-white",
      )}
      aria-hidden="true"
    >
      {rank}
    </span>
  );
}
