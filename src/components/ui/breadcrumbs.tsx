import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { AppHref } from "@/lib/routes";
import { cn } from "@/lib/cn";

export type Crumb = { label: string; href?: AppHref };

export function Breadcrumbs({ items, className }: { items: readonly Crumb[]; className?: string }) {
  return (
    <nav aria-label="Percorso" className={cn("flex", className)}>
      <ol className="flex flex-wrap items-center gap-1.5 text-small">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={item.label} className="flex items-center gap-1.5">
              {item.href && !last ? (
                <Link href={item.href} className="text-grey-600 transition-colors hover:text-violet">
                  {item.label}
                </Link>
              ) : (
                <span className={last ? "font-semibold text-violet" : "text-grey-600"} aria-current={last ? "page" : undefined}>
                  {item.label}
                </span>
              )}
              {!last ? <ChevronRight className="size-3.5 text-grey-400" aria-hidden="true" /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
