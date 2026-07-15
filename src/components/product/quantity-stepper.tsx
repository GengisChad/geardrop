"use client";

import { Minus, Plus } from "lucide-react";
import { MAX_QUANTITY_PER_LINE } from "@/lib/store/cart";
import { cn } from "@/lib/cn";

type QuantityStepperProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  size?: "sm" | "md";
  label?: string;
};

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = MAX_QUANTITY_PER_LINE,
  size = "md",
  label = "Quantità",
}: QuantityStepperProps) {
  const height = size === "sm" ? "h-9" : "h-12";
  const button = size === "sm" ? "size-9" : "size-12";

  return (
    <div className={cn("inline-flex items-center rounded-full border border-grey-300 bg-white", height)}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="Diminuisci quantità"
        data-testid="qty-decrease"
        className={cn(
          button,
          "inline-flex items-center justify-center rounded-full text-graphite transition-colors hover:text-violet disabled:opacity-30",
        )}
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>

      <input
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        aria-label={label}
        data-testid="qty-input"
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, Math.trunc(next))));
        }}
        className="tabular gd-display w-10 border-0 bg-transparent text-center text-small font-bold text-graphite [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />

      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="Aumenta quantità"
        data-testid="qty-increase"
        className={cn(
          button,
          "inline-flex items-center justify-center rounded-full text-graphite transition-colors hover:text-violet disabled:opacity-30",
        )}
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
