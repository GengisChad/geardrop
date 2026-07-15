import Link from "next/link";
import { ArrowRight, PackageOpen, ShoppingCart } from "lucide-react";
import type { AppHref } from "@/lib/routes";
import { cn } from "@/lib/cn";

type EmptyStateProps = {
  title: string;
  message: string;
  href?: AppHref;
  linkLabel?: string;
  icon?: "cart" | "package";
  className?: string;
};

/** Empty state from design system §14. */
export function EmptyState({
  title,
  message,
  href,
  linkLabel = "Scopri i prodotti",
  icon = "package",
  className,
}: EmptyStateProps) {
  const Icon = icon === "cart" ? ShoppingCart : PackageOpen;

  return (
    <div
      data-testid="empty-state"
      className={cn(
        "flex flex-col items-center justify-center rounded-[--radius-card] border border-dashed border-grey-300 bg-white px-6 py-16 text-center",
        className,
      )}
    >
      <Icon className="size-12 text-grey-400" strokeWidth={1.5} aria-hidden="true" />
      <h2 className="mt-5 text-h3 font-bold text-graphite">{title}</h2>
      <p className="mt-2 max-w-sm text-small text-grey-600">{message}</p>
      {href ? (
        <Link
          href={href}
          className="gd-display group mt-6 inline-flex items-center gap-2 text-small font-bold tracking-wider text-violet hover:text-violet-ink"
        >
          {linkLabel}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
