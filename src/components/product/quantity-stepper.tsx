"use client";

import { Minus, Plus } from "lucide-react";
import { RollingNumber } from "@/components/ui/rolling-number";
import { MAX_QUANTITY_PER_LINE } from "@/lib/store/cart";
import { hapticTick } from "@/lib/haptics";
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
  const step = (next: number) => {
    hapticTick();
    onChange(next);
  };

  return (
    <div className={cn("inline-flex items-center border border-white/20 bg-surface", height)}>
      <button
        type="button"
        onClick={() => step(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="Diminuisci quantità"
        data-testid="qty-decrease"
        className={cn(
          button,
          "inline-flex items-center justify-center text-graphite transition-[color,scale] duration-150 hover:text-lime active:scale-90 disabled:opacity-30",
        )}
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>

      {/*
        The field stays a real number input, for the keyboard and for screen readers. While it is
        not being typed in, its digits are drawn by the counter above it, which rolls on a change.
      */}
      <span className="relative inline-flex h-full items-center">
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
          className="peer tabular gd-display w-10 border-0 bg-transparent text-center text-small font-bold text-transparent caret-lime [appearance:textfield] focus:text-graphite focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <RollingNumber
          value={String(value)}
          aria-hidden="true"
          className="tabular gd-display pointer-events-none absolute inset-0 flex items-center justify-center text-small font-bold text-graphite peer-focus:opacity-0"
        />
      </span>

      <button
        type="button"
        onClick={() => step(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="Aumenta quantità"
        data-testid="qty-increase"
        className={cn(
          button,
          "inline-flex items-center justify-center text-graphite transition-[color,scale] duration-150 hover:text-lime active:scale-90 disabled:opacity-30",
        )}
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
