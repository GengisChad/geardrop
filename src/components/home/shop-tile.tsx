import type { Route } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The "see everything" tile that closes a row of product cards, with lime speed lines in its
 * corner like the pack artwork. It first closed the arsenal; it also fills the empty slots of
 * a short row (the hero's best sellers), so a row never ends in a dead gap (critique, 2026-10-11).
 */
export function ShopTile({
  href,
  kicker,
  title,
  className,
}: {
  readonly href: Route;
  readonly kicker: string;
  readonly title: string;
  readonly className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "gd-speedlines group @container flex h-full min-h-72 flex-col justify-end gap-3 border border-white/10 bg-surface p-4 transition-colors hover:border-lime sm:p-7",
        className,
      )}
    >
      <span className="gd-mono relative text-[0.625rem] text-grey-600 sm:text-[0.75rem]">{kicker}</span>
      {/* Sized by the tile's own width: one slot beside four cards, or two slots on a short row. */}
      <span className="gd-display-wide relative text-[clamp(1.25rem,11cqi,2.6rem)] font-extrabold leading-[0.95]">
        {title} <span className="text-lime">{"//"}</span>
      </span>
      <span className="gd-chamfer relative grid h-11 w-14 place-items-center bg-lime text-void transition-transform duration-200 group-hover:translate-x-1">
        <ArrowRight className="size-5" strokeWidth={2.5} aria-hidden="true" />
      </span>
    </Link>
  );
}

/**
 * The slots a tile has to fill so a row of `count` cards ends flush, per breakpoint. Class names
 * are spelled out whole so Tailwind sees them. `columns` lists the grid's columns at the base,
 * sm and lg breakpoints.
 */
const SPAN = {
  base: ["hidden", "col-span-1", "col-span-2", "col-span-3", "col-span-4"],
  sm: ["sm:hidden", "sm:block sm:col-span-1", "sm:block sm:col-span-2", "sm:block sm:col-span-3", "sm:block sm:col-span-4"],
  lg: ["lg:hidden", "lg:block lg:col-span-1", "lg:block lg:col-span-2", "lg:block lg:col-span-3", "lg:block lg:col-span-4"],
} as const;

export function fillerSpan(count: number, columns: { readonly base: number; readonly sm: number; readonly lg: number }): string {
  const rest = (cols: number) => (cols - (count % cols)) % cols;
  return cn(SPAN.base[rest(columns.base)], SPAN.sm[rest(columns.sm)], SPAN.lg[rest(columns.lg)]);
}
