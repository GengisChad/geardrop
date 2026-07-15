import Image from "next/image";
import Link from "next/link";
import { brand, brandSize } from "@/data/assets";
import { cn } from "@/lib/cn";

/**
 * The wordmark is a supplied asset: never rebuilt with a font, never outlined,
 * never recoloured. (audit §7.1)
 */
export function Logo({ className, priority = false }: { className?: string; priority?: boolean }) {
  return (
    <Link href="/" className={cn("inline-flex items-center", className)} aria-label="GEAR//DROP — vai alla home">
      <Image
        src={brand.lockup}
        alt="GEAR//DROP"
        width={brandSize.lockup.width}
        height={brandSize.lockup.height}
        priority={priority}
        sizes="(min-width: 1024px) 260px, 190px"
        className="h-8 w-auto sm:h-10 lg:h-11"
      />
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
