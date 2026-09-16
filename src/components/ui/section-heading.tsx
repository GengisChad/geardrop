import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { AppHref } from "@/lib/routes";
import { cn } from "@/lib/cn";

/**
 * The `///` glyph is the section marker across every mockup — always lime, never used
 * decoratively elsewhere. (audit §7.8)
 */
export function SlashMark({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("flex items-center gap-[3px]", className)}>
      {[0, 1, 2].map((i) => (
        <span key={i} className="block h-3.5 w-[3px] -skew-x-[20deg] bg-lime" />
      ))}
    </span>
  );
}

type SectionHeadingProps = {
  title: string;
  href?: AppHref;
  linkLabel?: string;
  /** Kept for callers from the light theme; every surface is dark now. */
  tone?: "light" | "dark";
  className?: string;
};

export function SectionHeading({ title, href, linkLabel = "Vedi tutti", className }: SectionHeadingProps) {
  return (
    <div className={cn("flex items-end gap-4", className)}>
      <h2 className="gd-display-wide text-[1.75rem] font-bold leading-[0.95] sm:text-[2.5rem]">{title}</h2>
      <SlashMark className="mb-2 hidden sm:flex" />
      <span className="mb-3 h-px flex-1 bg-white/10" />
      {href ? (
        <Link
          href={href}
          className="gd-display group inline-flex shrink-0 items-center gap-2.5 text-small font-bold tracking-[0.08em] text-graphite transition-colors hover:text-lime"
        >
          <span className="hidden sm:inline">{linkLabel}</span>
          <span className="gd-chamfer inline-flex size-9 items-center justify-center bg-lime text-void transition-transform duration-200 group-hover:translate-x-0.5">
            <ArrowRight className="size-4" strokeWidth={2.5} aria-hidden="true" />
          </span>
        </Link>
      ) : null}
    </div>
  );
}
