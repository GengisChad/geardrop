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

/** Sticky bar: emblem and wordmark, uppercase navigation with a slanted lime underline, the stadium rail below. */
export function Header({ navigation, mobileNavigation }: {
  readonly navigation: readonly StorefrontNavItem[];
  readonly mobileNavigation: readonly StorefrontNavItem[];
}) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 bg-void/90 backdrop-blur-md after:absolute after:inset-x-0 after:top-full after:h-[5px] after:bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.16)_0_5px,transparent_5px_11px)] after:content-['']">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-2 px-3 sm:h-[4.5rem] sm:gap-3 sm:px-6 lg:gap-4 xl:gap-6 xl:px-10">
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
                      // Narrower cut between lg and xl, where eight links and the icons share 1024px; at 1280px
                      // the row is tight again, so the links only spread out from 2xl.
                      "gd-display relative block whitespace-nowrap px-1.5 py-3 text-[0.75rem] font-bold tracking-[0.02em] [font-stretch:96%] transition-colors xl:px-2 xl:text-[0.8125rem] xl:tracking-[0.04em] xl:[font-stretch:112%] 2xl:px-3 2xl:tracking-[0.06em]",
                      "after:absolute after:inset-x-1.5 after:bottom-1.5 after:h-[3px] after:origin-left after:-skew-x-[18deg] after:scale-x-0 after:bg-lime xl:after:inset-x-2 2xl:after:inset-x-3",
                      "after:transition-transform after:duration-300 hover:after:scale-x-100",
                      item.tone === "lime" && "text-lime",
                      item.tone === "violet" && "text-violet-soft",
                      !item.tone && "text-grey-700 hover:text-white",
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
            className="hidden size-11 items-center justify-center border border-white/10 text-graphite transition-colors duration-200 hover:border-lime hover:text-lime sm:inline-flex"
          >
            <User className="size-5" strokeWidth={1.8} aria-hidden="true" />
          </Link>
          <CartIndicator />
        </div>
      </div>
    </header>
  );
}
