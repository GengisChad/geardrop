import { Star } from "lucide-react";
import { formatCount, formatRating } from "@/lib/format";
import { cn } from "@/lib/cn";

type RatingProps = {
  value: number;
  count?: number;
  size?: "sm" | "md";
  showValue?: boolean;
  className?: string;
};

/** Stars use a clipped overlay so a 4,5 renders as a real half star, not a rounded one. */
export function Rating({ value, count, size = "sm", showValue = false, className }: RatingProps) {
  const star = size === "sm" ? "size-3.5" : "size-5";
  const label = count !== undefined ? `${formatRating(value)} su 5, ${formatCount(count)} recensioni` : `${formatRating(value)} su 5`;

  return (
    <div className={cn("flex items-center gap-1.5", className)} title={label}>
      <span className="relative inline-flex" aria-hidden="true">
        <span className="flex gap-0.5">
          {Array.from({ length: 5 }, (_, i) => (
            <Star key={i} className={cn(star, "text-grey-300")} fill="currentColor" strokeWidth={0} />
          ))}
        </span>
        <span className="absolute inset-0 overflow-hidden" style={{ width: `${(value / 5) * 100}%` }}>
          <span className="flex gap-0.5">
            {Array.from({ length: 5 }, (_, i) => (
              <Star key={i} className={cn(star, "shrink-0 text-[#FFC107]")} fill="currentColor" strokeWidth={0} />
            ))}
          </span>
        </span>
      </span>
      {showValue ? <span className="tabular text-small font-semibold text-graphite">{formatRating(value)}</span> : null}
      {count !== undefined ? (
        <span className="tabular text-small text-grey-600">
          {showValue ? `(${formatCount(count)} recensioni)` : `(${formatCount(count)})`}
        </span>
      ) : null}
      <span className="sr-only">{label}</span>
    </div>
  );
}
