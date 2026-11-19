"use client";

import { useState, type CSSProperties, type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Shown = {
  readonly value: string;
  /** What stood here before this value; null until the value first changes. */
  readonly previous: string | null;
  /** Counts the changes, so a digit that changes twice rolls twice. */
  readonly turn: number;
  readonly down: boolean;
};

const numberIn = (text: string) => Number(text.replace(/\D/g, "")) || 0;

/**
 * A number whose changed digits roll like a counter: up when it grows, down when it shrinks.
 * The first paint is at rest, and only the digits that differ move. The text of the element is
 * always exactly `value`: the digit leaving is drawn by CSS from `data-previous` (globals.css),
 * so nothing reads the old number.
 *
 * It only animates the change it is given. A total stays the server's: pass the quoted value and
 * the roll starts when the answer arrives.
 */
export function RollingNumber({ value, className, ...rest }: { readonly value: string } & Omit<HTMLAttributes<HTMLSpanElement>, "children">) {
  // React's "adjust state when a prop changes" pattern: no effect, no extra paint.
  const [shown, setShown] = useState<Shown>({ value, previous: null, turn: 0, down: false });
  if (shown.value !== value) {
    setShown({ value, previous: shown.value, turn: shown.turn + 1, down: numberIn(value) < numberIn(shown.value) });
  }

  const { previous } = shown;
  const characters = [...value];

  return (
    <span className={cn("whitespace-nowrap", className)} {...rest}>
      {characters.map((character, index) => {
        // Aligned from the right, so 9 → 10 rolls the units and the new ten rolls in beside it.
        const before = previous === null ? undefined : [...previous][[...previous].length - (characters.length - index)];
        const rolls = previous !== null && /\d/.test(character) && before !== character;
        if (!rolls) return <span key={index}>{character}</span>;
        return (
          <span
            key={`${index}:${shown.turn}`}
            className="gd-roll-cell"
            data-previous={before !== undefined && /\d/.test(before) ? before : ""}
            data-down={shown.down ? "" : undefined}
            style={{ "--gd-roll-i": index } as CSSProperties}
          >
            <span className="gd-roll-in">{character}</span>
          </span>
        );
      })}
    </span>
  );
}
