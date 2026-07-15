"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { SORT_KEYS, SORT_LABEL } from "@/lib/labels";
import type { SortKey } from "@/lib/commerce/types";

/** Native select: it gets the platform picker on mobile for free. */
export function SortSelect() {
  const router = useRouter();
  const params = useSearchParams();
  const current = (params.get("sort") ?? "popolari") as SortKey;

  return (
    <label className="flex items-center gap-2">
      <span className="gd-display hidden text-[0.6875rem] font-bold tracking-wider text-grey-600 sm:inline">
        Ordina per
      </span>
      <select
        value={current}
        data-testid="sort-select"
        onChange={(event) => {
          const next = new URLSearchParams(params.toString());
          const value = event.target.value;
          if (value === "popolari") next.delete("sort");
          else next.set("sort", value);
          next.delete("page");
          const qs = next.toString();
          router.push(qs ? `?${qs}` : "?", { scroll: false });
        }}
        className="h-10 rounded-full border border-grey-300 bg-white px-4 pr-8 text-small text-graphite transition-colors hover:border-violet focus:border-violet focus:outline-none"
      >
        {SORT_KEYS.map((key) => (
          <option key={key} value={key}>
            {SORT_LABEL[key]}
          </option>
        ))}
      </select>
    </label>
  );
}
