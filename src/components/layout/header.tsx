"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { User } from "lucide-react";
import { CartIndicator } from "@/components/layout/cart-indicator";
import { Logo } from "@/components/layout/logo";
import { MobileMenu } from "@/components/layout/mobile-menu";
import { SearchBox } from "@/components/layout/search-box";
import { cn } from "@/lib/cn";
import type { StorefrontNavItem } from "@/lib/content/types";

export function Header({ navigation, mobileNavigation }: {
  readonly navigation: readonly StorefrontNavItem[];
  readonly mobileNavigation: readonly StorefrontNavItem[];
}) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50">
      {/* Fades content scrolling under the floating bar so nothing peeks above the pill. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-grey-100 via-grey-100/70 to-transparent"
      />

      <div className="relative mx-auto max-w-[1400px] px-3 pt-3 sm:px-6 sm:pt-4">
        {/* One floating glass pill — no top bar above it. */}
        <div className="gd-glass-compact flex items-center gap-3 rounded-full px-3 py-2 sm:px-5 sm:py-2.5">
          <MobileMenu navigation={mobileNavigation} />
          <Logo priority className="shrink-0" />

          <nav aria-label="Navigazione principale" className="hidden flex-1 justify-center lg:flex">
            <ul className="flex items-center gap-3 xl:gap-7">
              {navigation.map((item) => {
                const active = pathname === item.href.split("?")[0];
                return (
                  <li key={item.label}>
                    <Link
                      href={item.href as Route}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "gd-display relative py-2 text-small font-bold tracking-wider transition-colors",
                        "after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:origin-left after:scale-x-0",
                        "after:bg-lime after:transition-transform after:duration-300 hover:after:scale-x-100",
                        item.tone === "lime" && "text-lime-ink hover:text-graphite",
                        item.tone === "violet" && "text-violet hover:text-violet-ink",
                        !item.tone && "text-graphite hover:text-violet",
                        active && "after:scale-x-100",
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-0.5 lg:ml-0">
            <SearchBox />
            {/*
              Always /account. Resolving the session here would mean reading cookies in the
              storefront layout, which turns every static and prerendered page dynamic for
              the sake of one icon; a client-side lookup would flash the wrong target on
              first paint. /account itself redirects anonymous visitors to /login, so the
              destination is right either way and costs nothing.
            */}
            <Link
              href="/account"
              aria-label="Account"
              data-testid="account-link"
              className="hidden size-10 items-center justify-center rounded-full transition-colors hover:bg-white/60 sm:inline-flex"
            >
              <User className="size-5 text-graphite" strokeWidth={2} aria-hidden="true" />
            </Link>
            <CartIndicator />
          </div>
        </div>
      </div>
    </header>
  );
}
