import type { Metadata } from "next";
import Link from "next/link";
import { Crown, Heart, Package, ShoppingCart } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import type { AppHref } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Account",
  description: "Il tuo account GEAR//DROP.",
  robots: { index: false, follow: false },
};

const SHORTCUTS: readonly { label: string; hint: string; href: AppHref; Icon: typeof Heart }[] = [
  { label: "Preferiti", hint: "I prodotti che hai salvato", href: "/preferiti", Icon: Heart },
  { label: "Carrello", hint: "Riprendi da dove hai lasciato", href: "/carrello", Icon: ShoppingCart },
  { label: "Spedizioni", hint: "Tempi, costi e tracciamento", href: "/assistenza/spedizioni", Icon: Package },
];

export default function AccountPage() {
  return (
    <>
      <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Account" }]} className="mb-6" />
        <h1 className="gd-display-wide text-[2rem] font-extrabold text-graphite sm:text-[2.5rem]">Account</h1>

        {/* No auth backend exists yet: say so rather than render a login that cannot work. */}
        <div className="gd-glass-panel mt-6 flex items-start gap-3 rounded-[--radius-glass] border-violet/30 p-5">
          <Crown className="mt-0.5 size-5 shrink-0 text-violet" aria-hidden="true" />
          <div>
            <h2 className="gd-display text-small font-bold tracking-wider text-graphite">Accesso in arrivo</h2>
            <p className="mt-1 max-w-xl text-small text-grey-600">
              L&apos;area account con ordini e punti fedeltà arriva col prossimo drop. Nel frattempo preferiti e carrello
              restano salvati su questo dispositivo.
            </p>
          </div>
        </div>

        <ul className="mt-6 grid gap-4 sm:grid-cols-3">
          {SHORTCUTS.map(({ label, hint, href, Icon }) => (
            <li key={label}>
              <Link
                href={href}
                className="gd-glass-card gd-glass-interactive group flex h-full items-start gap-3 rounded-[--radius-glass] p-5"
              >
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-violet-tint">
                  <Icon className="size-4.5 text-violet" strokeWidth={2} aria-hidden="true" />
                </span>
                <span>
                  <span className="gd-display block text-small font-bold tracking-wider text-graphite">{label}</span>
                  <span className="block text-[0.6875rem] text-grey-600">{hint}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
