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

/** Sticky HUD bar: emblem and wordmark, uppercase navigation with a glowing lime underline. */
export function Header({ navigation, mobileNavigation }: {
  readonly navigation: readonly StorefrontNavItem[];
  readonly mobileNavigation: readonly StorefrontNavItem[];
}) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-void/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-2 px-3 sm:h-[4.5rem] sm:gap-3 sm:px-6 lg:gap-6 lg:px-10">
        <MobileMenu navigation={mobileNavigation} />
        <Logo priority className="shrink-0" />

        <nav aria-label="Navigazione principale" className="hidden flex-1 lg:flex">
          <ul className="flex items-center gap-0.5 xl:gap-1.5">
            {navigation.map((item) => {
              const active = pathname === item.href.split("?")[0];
              return (
                <li key={item.label}>
                  <Link
                    href={item.href as Route}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "gd-display relative block px-3 py-3 text-small font-semibold tracking-[0.06em] transition-colors xl:px-3.5 xl:text-[0.875rem]",
                      "after:absolute after:inset-x-3 after:bottom-1.5 after:h-0.5 after:origin-left after:scale-x-0 after:bg-lime",
                      "after:shadow-[0_0_12px_#c6ff00] after:transition-transform after:duration-300 hover:after:scale-x-100",
                      item.tone === "lime" && "text-lime",
                      item.tone === "violet" && "text-violet-soft",
                      !item.tone && "text-grey-600 hover:text-white",
                      active && "text-white after:scale-x-100",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <SearchBox />
          {/*
            Always /account. Resolving the session here would mean reading cookies in the
            storefront layout, which turns every static and prerendered page dynamic for
            the sake of one icon. /account itself redirects anonymous visitors to /login.
          */}
          <Link
            href="/account"
            aria-label="Account"
            data-testid="account-link"
            className="gd-chamfer hidden size-11 items-center justify-center bg-white/[0.07] text-graphite transition-colors duration-200 hover:bg-lime hover:text-void sm:inline-flex"
          >
            <User className="size-5" strokeWidth={1.8} aria-hidden="true" />
          </Link>
          <CartIndicator />
        </div>
      </div>
    </header>
  );
}
