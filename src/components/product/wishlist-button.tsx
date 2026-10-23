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
        "inline-flex size-11 items-center justify-center border bg-void/65 transition-colors duration-200 hover:border-lime",
        size === "md" ? "border-white/20" : "border-white/10",
        className,
      )}
    >
      <Heart
        className={cn(
          size === "sm" ? "size-4" : "size-5",
          "transition-colors duration-200",
          isSaved ? "text-violet-soft" : "text-graphite",
        )}
        fill={isSaved ? "currentColor" : "none"}
        strokeWidth={2}
        aria-hidden="true"
      />
    </button>
  );
}
