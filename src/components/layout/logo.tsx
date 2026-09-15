import Image from "next/image";
import Link from "next/link";
import { brand, brandSize } from "@/data/assets";
import { cn } from "@/lib/cn";

/**
 * Emblem + wordmark for the dark theme. The supplied lockup is a light-background asset whose
 * graphite "GEAR" disappears on the Holo Drop ground, so the owner-approved design
 * (2026-09-15) sets the wordmark in the display face beside the supplied emblem. The emblem
 * itself is never redrawn or recoloured. (audit §7.1)
 */
export function Wordmark({
  className,
  priority = false,
  spin = true,
}: {
  className?: string;
  priority?: boolean;
  spin?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Image
        src={brand.emblem}
        alt=""
        aria-hidden="true"
        width={brandSize.emblem.width}
        height={brandSize.emblem.height}
        priority={priority}
        sizes="40px"
        className={cn("h-8 w-auto sm:h-9", spin && "animate-[gd-spin_14s_linear_infinite]")}
      />
      <span className="gd-display-wide text-[1.2rem] font-bold leading-none text-graphite sm:text-[1.45rem]">
        Gear<span className="text-lime">{"//"}</span>
        <span className="text-violet-soft">Drop</span>
      </span>
    </span>
  );
}

export function Logo({ className, priority = false }: { className?: string; priority?: boolean }) {
  return (
    <Link href="/" className={cn("inline-flex items-center", className)} aria-label="GEAR//DROP — vai alla home">
      <Wordmark priority={priority} />
    </Link>
  );
}

/** The emblem is the repeatable mark: loader, mobile menu, decorative details. (audit §7.2) */
export function Emblem({ className, size = 40 }: { className?: string; size?: number }) {
  return (
    <Image
      src={brand.emblem}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
    />
  );
}
