import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getStaffSession, hasAtLeast, type StaffRole } from "@/lib/auth/session";
import type { AppHref } from "@/lib/routes";

export const metadata: Metadata = {
  title: { default: "Back-office", template: "%s · Back-office" },
  robots: { index: false, follow: false },
};

/**
 * Never prerender any part of the back-office. Without this, a build that runs with no
 * Supabase keys resolves the guard to "no session" without ever touching cookies, and
 * Next bakes that outcome — a permanent 404 — into a static page for the whole section.
 * The answer here depends on who is asking, so it has to be computed per request.
 */
export const dynamic = "force-dynamic";

const NAV: readonly { href: AppHref; label: string; minimum: StaffRole }[] = [
  { href: "/admin", label: "Panoramica", minimum: "editor" },
  { href: "/admin/ordini", label: "Ordini", minimum: "admin" },
  { href: "/admin/catalogo", label: "Catalogo", minimum: "editor" },
  { href: "/admin/coupon", label: "Coupon", minimum: "admin" },
  { href: "/admin/spedizioni", label: "Spedizioni e vendite", minimum: "admin" },
  { href: "/admin/staff", label: "Permessi", minimum: "owner" },
];

/**
 * The back-office gate.
 *
 * A signed-out visitor never gets here — the proxy redirects /admin to the login page.
 * A signed-in customer gets a 404 rather than a 403: "forbidden" would confirm that the
 * section exists. Staff *capabilities* are still checked per page and per action, and the
 * database enforces them again through RLS.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getStaffSession("editor");
  if (!session) notFound();

  const items = NAV.filter((item) => hasAtLeast(session.role, item.minimum));

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="gd-display text-[0.625rem] font-bold uppercase tracking-[0.2em] text-violet">GEAR//DROP</p>
          <h1 className="gd-display-wide text-[1.75rem] font-extrabold text-graphite">Back-office</h1>
        </div>
        <p className="text-[0.6875rem] text-grey-600">
          {session.user.email} · ruolo <strong className="text-graphite">{session.role}</strong>
        </p>
      </header>

      <nav aria-label="Sezioni back-office" className="mt-6 border-b border-grey-200 pb-3">
        <ul className="flex flex-wrap gap-2">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="gd-display inline-flex h-9 items-center rounded-full border border-grey-300 px-4 text-[0.6875rem] font-bold uppercase tracking-wider text-graphite hover:border-violet hover:text-violet"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <main className="mt-8">{children}</main>
    </div>
  );
}
