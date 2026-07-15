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
  /** Renders for the dark bands (bundle banner, trust band). */
  tone?: "light" | "dark";
  className?: string;
};

export function SectionHeading({
  title,
  href,
  linkLabel = "Vedi tutti",
  tone = "light",
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn("flex items-center gap-4", className)}>
      <h2 className={cn("text-h3 font-bold sm:text-[1.75rem]", tone === "dark" ? "text-white" : "text-graphite")}>
        {title}
      </h2>
      <SlashMark />
      <span className={cn("h-px flex-1", tone === "dark" ? "bg-white/15" : "bg-grey-300")} />
      {href ? (
        <Link
          href={href}
          className={cn(
            "gd-display group inline-flex shrink-0 items-center gap-2 text-small font-bold tracking-wider",
            tone === "dark" ? "text-white" : "text-graphite",
          )}
        >
          <span className="hidden sm:inline">{linkLabel}</span>
          <span className="inline-flex size-7 items-center justify-center rounded-full bg-lime text-graphite transition-transform duration-200 group-hover:translate-x-0.5">
            <ArrowRight className="size-4" strokeWidth={2.5} aria-hidden="true" />
          </span>
        </Link>
      ) : null}
    </div>
  );
}
