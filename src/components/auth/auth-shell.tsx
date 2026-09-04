import Link from "next/link";
import type { ReactNode } from "react";
import type { AppHref } from "@/lib/routes";

/**
 * Shared frame for the four auth screens: one narrow glass card, one heading, one form.
 * Nothing else — these pages exist to be got through, not browsed.
 */
export function AuthShell({
  title,
  intro,
  children,
  footer,
}: {
  title: string;
  intro: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-14 sm:px-6">
      <div className="gd-glass-card rounded-[--radius-glass] p-6 sm:p-8">
        <h1 className="gd-display-wide text-[1.5rem] font-extrabold text-graphite">{title}</h1>
        <p className="mt-2 text-small text-grey-600">{intro}</p>
        <div className="mt-6">{children}</div>
      </div>
      {footer ? <div className="mt-5 text-center text-small text-grey-600">{footer}</div> : null}
    </div>
  );
}

export function AuthLink({ href, children }: { href: AppHref; children: ReactNode }) {
  return (
    <Link href={href} className="font-bold text-violet hover:text-violet-ink">
      {children}
    </Link>
  );
}
