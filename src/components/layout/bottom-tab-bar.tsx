"use client";

import { useState } from "react";
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

  const activeIndex = TABS.findIndex(({ href }) => pathname === href.split("?")[0]);
  // True once the shopper has changed page: the tab they land on answers, the one a visit opens on stays still.
  const [travel, setTravel] = useState({ path: pathname, moved: false });
  if (travel.path !== pathname) setTravel({ path: pathname, moved: true });

  const badgeFor = (label: string) => {
    if (label === "Negozio" && cartHydrated && cartCount > 0) return cartCount;
    if (label === "Preferiti" && wishHydrated && wishCount > 0) return wishCount;
    return null;
  };

  return (
    <nav
      aria-label="Navigazione rapida"
      data-testid="bottom-tab-bar"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0f0e14] pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {/* One lime marker for the whole bar: it slides to the tab the shopper moves to. */}
      <span
        aria-hidden="true"
        data-testid="tab-marker"
        style={{ transform: `translateX(${Math.max(activeIndex, 0) * 100}%)` }}
        className={cn(
          "pointer-events-none absolute -top-px left-0 h-[3px] w-1/5 transition-[transform,opacity] duration-[340ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
          activeIndex < 0 && "opacity-0",
        )}
      >
        <span className="absolute inset-x-[24%] inset-y-0 -skew-x-[18deg] bg-lime" />
      </span>
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
                  active ? "text-lime" : "text-grey-700",
                )}
              >
                <span className="relative">
                  <Icon
                    className={cn("size-5", active && travel.moved && "motion-safe:animate-[gd-tab-in_0.34s_var(--ease-out-gear)]")}
                    strokeWidth={active ? 2.5 : 2}
                    aria-hidden="true"
                  />
                  {badge !== null ? (
                    <span className="tabular gd-chamfer absolute -right-3 -top-1.5 inline-flex min-w-5 items-center justify-center bg-lime px-1.5 text-[0.5625rem] font-extrabold leading-4 text-void">
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
