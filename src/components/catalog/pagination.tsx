"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

/** Windowed page list with ellipses, as drawn in design system §11. */
function pageList(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  let previous = 0;
  for (const page of sorted) {
    if (previous && page - previous > 1) out.push("gap");
    out.push(page);
    previous = page;
  }
  return out;
}

export function Pagination({ page, pageCount }: { page: number; pageCount: number }) {
  const router = useRouter();
  const params = useSearchParams();

  if (pageCount <= 1) return null;

  const go = (next: number) => {
    const query = new URLSearchParams(params.toString());
    if (next <= 1) query.delete("page");
    else query.set("page", String(next));
    const qs = query.toString();
    router.push(qs ? `?${qs}` : "?", { scroll: true });
  };

  return (
    <nav aria-label="Paginazione" data-testid="pagination" className="flex items-center justify-center gap-1.5">
      <PageButton onClick={() => go(page - 1)} disabled={page <= 1} label="Pagina precedente">
        <ChevronLeft className="size-4" aria-hidden="true" />
      </PageButton>

      {pageList(page, pageCount).map((entry, index) =>
        entry === "gap" ? (
          <span key={`gap-${index}`} className="px-1 text-small text-grey-400" aria-hidden="true">
            …
          </span>
        ) : (
          <PageButton
            key={entry}
            onClick={() => go(entry)}
            active={entry === page}
            label={`Pagina ${entry}`}
            current={entry === page}
          >
            <span className="tabular">{entry}</span>
          </PageButton>
        ),
      )}

      <PageButton onClick={() => go(page + 1)} disabled={page >= pageCount} label="Pagina successiva">
        <ChevronRight className="size-4" aria-hidden="true" />
      </PageButton>
    </nav>
  );
}

function PageButton({
  children,
  onClick,
  disabled = false,
  active = false,
  current = false,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  current?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={current ? "page" : undefined}
      className={cn(
        "gd-display inline-flex size-9 items-center justify-center rounded-full text-small font-bold transition-colors",
        active
          ? "bg-violet text-white"
          : "border border-grey-300 bg-white text-graphite hover:border-violet hover:text-violet",
        disabled && "pointer-events-none opacity-40",
      )}
    >
      {children}
    </button>
  );
}
