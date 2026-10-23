import Link from "next/link";
import type { AppHref } from "@/lib/routes";
import { cn } from "@/lib/cn";

export type Crumb = { label: string; href?: AppHref };

export function Breadcrumbs({ items, className }: { items: readonly Crumb[]; className?: string }) {
  return (
    <nav aria-label="Percorso" className={cn("flex", className)}>
      <ol className="gd-mono flex flex-wrap items-center gap-2 text-[0.75rem] uppercase tracking-[0.04em]">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={item.label} className="flex items-center gap-2">
              {item.href && !last ? (
                <Link href={item.href} className="text-grey-600 transition-colors hover:text-lime">
                  {item.label}
                </Link>
              ) : (
                <span className={last ? "text-graphite" : "text-grey-600"} aria-current={last ? "page" : undefined}>
                  {item.label}
                </span>
              )}
              {!last ? (
                <span aria-hidden="true" className="text-grey-400">
                  /
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
