"use client";

import { Heart } from "lucide-react";
import { useWishlist } from "@/lib/store/wishlist";
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

  return (
    <button
      type="button"
      onClick={() => toggle(slug)}
      aria-pressed={isSaved}
      aria-label={isSaved ? `Rimuovi ${name} dai preferiti` : `Aggiungi ${name} ai preferiti`}
      data-testid="wishlist-toggle"
      className={cn(
        "gd-glass-compact gd-glass-interactive inline-flex items-center justify-center rounded-full",
        "size-11",
        size === "md" && "border border-grey-300",
        className,
      )}
    >
      <Heart
        className={cn(
          size === "sm" ? "size-4" : "size-5",
          "transition-colors duration-200",
          isSaved ? "text-violet" : "text-graphite",
        )}
        fill={isSaved ? "currentColor" : "none"}
        strokeWidth={2}
        aria-hidden="true"
      />
    </button>
  );
}
