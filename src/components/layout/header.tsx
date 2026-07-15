"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { User } from "lucide-react";
import { AnnouncementBar } from "@/components/layout/announcement-bar";
import { CartIndicator } from "@/components/layout/cart-indicator";
import { Logo } from "@/components/layout/logo";
import { MobileMenu } from "@/components/layout/mobile-menu";
import { SearchBox } from "@/components/layout/search-box";
import { MAIN_NAV } from "@/lib/navigation";
import { cn } from "@/lib/cn";

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-grey-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <AnnouncementBar />

      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 sm:px-6 lg:h-20 lg:gap-6">
        <MobileMenu />
        <Logo priority className="shrink-0" />

        <span aria-hidden="true" className="mx-2 hidden h-7 w-px -skew-x-12 bg-grey-300 lg:block" />

        <nav aria-label="Navigazione principale" className="hidden flex-1 lg:block">
          <ul className="flex items-center gap-5 xl:gap-7">
            {MAIN_NAV.map((item) => {
              const active = pathname === item.href.split("?")[0];
              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
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

        <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
          <SearchBox />
          <Link
            href="/account"
            aria-label="Account"
            className="hidden size-10 items-center justify-center rounded-full transition-colors hover:bg-grey-100 sm:inline-flex"
          >
            <User className="size-5 text-graphite" strokeWidth={2} aria-hidden="true" />
          </Link>
          <CartIndicator />
        </div>
      </div>
    </header>
  );
}
