"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, Home, ShoppingBag, Trophy, User } from "lucide-react";
import type { AppHref } from "@/lib/routes";
import { selectCartCount, useCart } from "@/lib/store/cart";
import { useWishlist } from "@/lib/store/wishlist";
import { cn } from "@/lib/cn";

/** Mobile tab bar, transcribed from mockup-catalog-mobile. */
const TABS = [
  { label: "Home", href: "/" as AppHref, Icon: Home },
  { label: "Negozio", href: "/negozio" as AppHref, Icon: ShoppingBag },
  // Five tabs is what fits at 375px — a sixth wraps "Account" onto its own row and
  // breaks the bar. "Meta" takes the slot "Arrivi" held: new arrivals are the first
  // thing on the home page and sit in the menu as "Nuovi arrivi", while the meta has
  // no other way in.
  { label: "Meta", href: "/meta" as AppHref, Icon: Trophy },
  { label: "Preferiti", href: "/preferiti" as AppHref, Icon: Heart },
  { label: "Account", href: "/account" as AppHref, Icon: User },
] as const;

export function BottomTabBar() {
  const pathname = usePathname();
  const cartHydrated = useCart((s) => s.hydrated);
  const cartCount = useCart(selectCartCount);
  const wishHydrated = useWishlist((s) => s.hydrated);
  const wishCount = useWishlist((s) => s.slugs.length);

  const badgeFor = (label: string) => {
    if (label === "Negozio" && cartHydrated && cartCount > 0) return cartCount;
    if (label === "Preferiti" && wishHydrated && wishCount > 0) return wishCount;
    return null;
  };

  return (
    <nav
      aria-label="Navigazione rapida"
      data-testid="bottom-tab-bar"
      className="gd-glass-compact fixed inset-x-0 bottom-0 z-40 border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="grid grid-cols-5">
        {TABS.map(({ label, href, Icon }) => {
          const active = pathname === href.split("?")[0];
          const badge = badgeFor(label);
          return (
            <li key={label}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center gap-1 py-2.5 transition-colors",
                  active ? "text-lime" : "text-grey-600",
                )}
              >
                <span className="relative">
                  <Icon className="size-5" strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
                  {badge !== null ? (
                    <span className="tabular absolute -right-2.5 -top-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-lime px-1 text-[0.5625rem] font-bold leading-4 text-void">
                      {badge}
                    </span>
                  ) : null}
                </span>
                <span className="gd-display text-[0.625rem] font-bold tracking-wider">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
