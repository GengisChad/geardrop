import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { Lock, Package } from "lucide-react";
import { NewsletterForm } from "@/components/layout/newsletter-form";
import { brand, brandSize } from "@/data/assets";
import type { StorefrontChrome } from "@/lib/content/types";

/**
 * No payment gateway is integrated yet, so no card or wallet brand is advertised here.
 * Re-add the badges when the matching method is actually accepted at checkout.
 */
const PAYMENTS: readonly string[] = [];

export function Footer({ content }: { readonly content: StorefrontChrome }) {
  return (
    <footer className="on-dark bg-graphite text-white">
      {/* Newsletter + community band */}
      <div className="border-b border-white/10">
        <div className="mx-auto grid max-w-[1400px] gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:py-14">
          <div>
            <h2 className="text-h3 font-bold text-white">Iscriviti alla newsletter</h2>
            <p className="mt-2 max-w-md text-small text-grey-400">
              Ricevi promo esclusive, novità e contenuti da campione.
            </p>
            <NewsletterForm className="mt-5" />
          </div>

          <div className="lg:pl-10">
            <h2 className="text-h3 font-bold text-white">Entra nella community</h2>
            <p className="mt-2 max-w-md text-small text-grey-400">Condividi strategie, combo e passione.</p>
            <p className="mt-5 text-small text-grey-400">
              Oltre <span className="tabular font-bold text-lime">45.000</span> blader già nella community.
            </p>
            <Link
              href="/chi-siamo"
              className="gd-display mt-2 inline-block text-small font-bold tracking-wider text-lime underline-offset-4 hover:underline"
            >
              Unisciti a noi
            </Link>
          </div>
        </div>
      </div>

      {/* Link columns */}
      <div className="mx-auto grid max-w-[1400px] gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div>
          {/*
            The lockup is a light-background asset: its "GEAR" is graphite, invisible on
            this footer. The mockup's footer uses a dark-background variant of the logo
            that was never supplied. Recolouring the supplied file (e.g. invert) would be
            reinterpreting the logo, which the brief forbids — so it sits on a light plate
            instead, exactly as supplied. See docs/reference-audit.md §9.5.
          */}
          <span className="inline-flex rounded-xl bg-white px-4 py-3">
            <Image
              src={brand.lockup}
              alt="GEAR//DROP"
              width={brandSize.lockup.width}
              height={brandSize.lockup.height}
              sizes="220px"
              className="h-7 w-auto"
            />
          </span>
          <p className="mt-4 max-w-xs text-small leading-relaxed text-grey-400">
            Il punto di riferimento in Italia per Beyblade X e per tutti i blader. Qualità. Velocità. Passione.
          </p>
        </div>

        {content.footerColumns.map((column) => (
          <div key={column.title}>
            <h3 className="gd-display text-small font-bold tracking-wider text-white">{column.title}</h3>
            <ul className="mt-4 flex flex-col gap-2.5">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link href={link.href as Route} className="text-small text-grey-400 transition-colors hover:text-lime">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {content.socialLinks.length ? <div className="border-t border-white/10 py-5"><ul className="mx-auto flex max-w-[1400px] flex-wrap justify-center gap-5 px-4">{content.socialLinks.map((link) => <li key={link.label}><a className="text-small text-grey-400 hover:text-lime" href={link.href} rel="noopener noreferrer">{link.label}</a></li>)}</ul></div> : null}

      {/* Reassurance + payments */}
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:gap-8">
            <p className="flex items-center gap-2.5 text-small text-grey-400">
              <Package className="size-4 text-lime" aria-hidden="true" />
              Spedizione gratuita sopra 59€
            </p>
            <p className="flex items-center gap-2.5 text-small text-grey-400">
              <Lock className="size-4 text-lime" aria-hidden="true" />
              Connessione protetta con crittografia SSL
            </p>
          </div>
          <ul className="flex flex-wrap items-center gap-2">
            {PAYMENTS.map((name) => (
              <li
                key={name}
                className="gd-display rounded-md bg-white/10 px-3 py-1.5 text-[0.625rem] font-bold tracking-wider text-grey-300"
              >
                {name}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10 py-5 text-center">
        <p className="text-small text-grey-400">
          © {new Date().getFullYear()} GEAR//DROP. Tutti i diritti riservati.
        </p>
      </div>
    </footer>
  );
}
