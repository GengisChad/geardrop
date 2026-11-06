"use client";

import { BadgeCheck, X } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";
import type { CartQuote } from "@/lib/commerce/types";
import { useCart } from "@/lib/store/cart";
import { cn } from "@/lib/cn";

/**
 * Where a buyer types a code: a club's or a coupon made on the site. Folded away by default: a buyer
 * without one should not be sent hunting for it. Whether the code holds, and whether it lowers
 * anything in this cart, is the quote's answer, never the browser's.
 */
export function ClubCodeField({ quote }: { quote: CartQuote }) {
  const clubCode = useCart((state) => state.clubCode);
  const setClubCode = useCart((state) => state.setClubCode);
  const [draft, setDraft] = useState("");
  const inputId = useId();

  if (quote.couponCode) {
    // A valid code can still cover nothing here: a club's tiers skip the new arrivals, for one.
    const lowersSomething = quote.lines.some((line) => line.clubUnitPrice);
    return (
      <div
        data-testid="club-code-applied"
        className={cn(
          "rounded-xl border px-3.5 py-2.5 text-small",
          lowersSomething ? "border-available/30 bg-available-bg" : "border-white/10 bg-grey-100",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <p className={cn("flex min-w-0 items-center gap-2 font-semibold", lowersSomething ? "text-available" : "text-grey-600")}>
            <BadgeCheck className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {lowersSomething ? "Sconto attivo" : "Codice valido"} · {quote.couponCode}
            </span>
          </p>
          <button
            type="button"
            onClick={() => setClubCode(null)}
            aria-label="Rimuovi il codice"
            className="shrink-0 rounded-full p-1.5 text-grey-600 transition-colors hover:text-soldout"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        {lowersSomething ? null : (
          <p data-testid="club-code-no-discount" className="mt-1 text-[0.6875rem] text-grey-600">
            Su questi pezzi il codice non dà sconto.
          </p>
        )}
      </div>
    );
  }

  const apply = () => {
    if (draft.trim()) setClubCode(draft);
  };
  // Enter applies the code. No <form> of its own: on the checkout this sits inside the order form.
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    apply();
  };
  const error = clubCode ? quote.couponError : null;

  return (
    <details className="group text-small" open={Boolean(clubCode)}>
      <summary className="cursor-pointer list-none text-grey-600 transition-colors hover:text-violet-soft [&::-webkit-details-marker]:hidden">
        Hai un codice sconto?
      </summary>
      <div className="mt-3 flex gap-2" data-testid="club-code-form">
        <label htmlFor={inputId} className="sr-only">
          Codice sconto
        </label>
        <TextInput
          id={inputId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={clubCode ?? "CODICE"}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={40}
          hasError={Boolean(error)}
          className="uppercase"
        />
        <Button type="button" onClick={apply} variant="tertiary" size="sm" className="h-11 shrink-0" data-testid="club-code-apply">
          Applica
        </Button>
      </div>
      {error ? (
        <p role="alert" data-testid="club-code-error" className="mt-2 flex items-start justify-between gap-2 text-[0.6875rem] text-soldout">
          <span>{error}</span>
          <button type="button" onClick={() => setClubCode(null)} className="shrink-0 font-semibold underline">
            Rimuovi
          </button>
        </p>
      ) : null}
    </details>
  );
}
