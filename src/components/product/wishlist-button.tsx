"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { useWishlist } from "@/lib/store/wishlist";
import { hapticTick } from "@/lib/haptics";
import { cn } from "@/lib/cn";

type WishlistButtonProps = {
  slug: string;
  name: string;
  size?: "sm" | "md";
  className?: string;
};

export function WishlistButton({ slug, name, size = "sm", className }: WishlistButtonProps) {
  const toggle = useWishlist((s) => s.toggle);
  const hydrated = useWishlist((s) => s.hydrated);
  const saved = useWishlist((s) => s.slugs.includes(slug));
  // Before rehydration the server rendered "not saved"; don't contradict it.
  const isSaved = hydrated && saved;
  // Counts the saves made by hand on this button: a favourite stored earlier opens at rest.
  const [saves, setSaves] = useState(0);
  const justSaved = isSaved && saves > 0;
  const icon = size === "sm" ? "size-4" : "size-5";

  return (
    <button
      type="button"
      onClick={() => {
        if (!isSaved) {
          setSaves((count) => count + 1);
          hapticTick();
        }
        toggle(slug);
      }}
      aria-pressed={isSaved}
      aria-label={isSaved ? `Rimuovi ${name} dai preferiti` : `Aggiungi ${name} ai preferiti`}
      data-testid="wishlist-toggle"
      className={cn(
        "inline-flex size-11 items-center justify-center border bg-void/65 transition-colors duration-200 hover:border-lime",
        size === "md" ? "border-white/20" : "border-white/10",
        className,
      )}
    >
      <span className="relative inline-flex">
        {/* Saved by hand: the heart splits out of register and snaps back, once (Glitch 2077). */}
        {justSaved ? (
          <span key={saves} aria-hidden="true" data-testid="wishlist-split" className="pointer-events-none absolute inset-0 motion-reduce:hidden">
            <Heart className={cn(icon, "absolute inset-0 animate-[gd-heart-cyan_0.36s_steps(4,end)_both] text-cyan")} fill="currentColor" strokeWidth={0} />
            <Heart className={cn(icon, "absolute inset-0 animate-[gd-heart-magenta_0.36s_steps(4,end)_both] text-magenta")} fill="currentColor" strokeWidth={0} />
          </span>
        ) : null}
        <Heart
          key={justSaved ? saves : "rest"}
          className={cn(
            icon,
            "relative transition-colors duration-200",
            isSaved ? "text-violet-soft" : "text-graphite",
            justSaved && "motion-safe:animate-[gd-heart-land_0.32s_var(--ease-out-gear)]",
          )}
          fill={isSaved ? "currentColor" : "none"}
          strokeWidth={2}
          aria-hidden="true"
        />
      </span>
    </button>
  );
}
