import type { Route } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Emblem } from "@/components/layout/logo";
import { cn } from "@/lib/cn";

/**
 * The dashed "see everything" tile that closes a row of product cards. It first closed the
 * arsenal; it also fills the empty slots of a short row (the hero's best sellers, a one-card
 * "Appena arrivati"), so a row never ends in a dead gap (critique, 2026-10-11).
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
        "group relative flex h-full min-h-72 flex-col justify-end gap-3 overflow-hidden border border-dashed border-lime/40 bg-[radial-gradient(circle_at_70%_25%,rgba(122,60,255,0.28),transparent_60%)] p-4 transition-colors hover:border-lime sm:p-6",
        className,
      )}
    >
      <Emblem
        size={260}
        className="pointer-events-none absolute -right-12 -top-10 w-40 opacity-35 animate-[gd-spin_20s_linear_infinite] motion-reduce:animate-none sm:w-64"
      />
      <span className="gd-mono relative text-[0.625rem] uppercase tracking-[0.12em] text-lime sm:text-[0.6875rem]">{kicker}</span>
      <span className="gd-display-wide relative text-[1.45rem] font-bold leading-[0.95] sm:text-[2.1rem]">{title}</span>
      <span className="gd-chamfer relative grid size-12 place-items-center bg-lime text-void transition-transform duration-200 group-hover:translate-x-1">
        <ArrowRight className="size-5" aria-hidden="true" />
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
