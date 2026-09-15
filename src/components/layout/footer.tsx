import Link from "next/link";
import type { Route } from "next";
import { Lock, RotateCcw, Truck } from "lucide-react";
import { Wordmark } from "@/components/layout/logo";
import type { StorefrontChrome } from "@/lib/content/types";

/**
 * VAT number of the business that sells and collects payments on GEAR//DROP.
 * Published with the holder's name, as the law asks of an online seller; tax code and PEC stay off.
 */
const VAT_NUMBER = "18464231002";
const SELLER_NAME = "Alessia Brunetti";

/** Standing promises. Card wallets are not named here: Stripe decides which appear at checkout. */
const PROMISES = [
  { Icon: Lock, text: "Pagamento sicuro con Stripe" },
  { Icon: Truck, text: "Spedizione €4,90 · gratis da €59" },
  { Icon: RotateCcw, text: "Reso gratuito entro 30 giorni" },
] as const;

export function Footer({ content }: { readonly content: StorefrontChrome }) {
  return (
    <footer className="on-dark relative border-t border-white/[0.08] bg-void/70">
      <div className="mx-auto grid max-w-[1400px] gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.4fr_repeat(4,1fr)] lg:px-10">
        <div>
          <Wordmark spin={false} />
          <p className="mt-4 max-w-xs text-small leading-relaxed text-grey-600">
            Un progetto indipendente dedicato al catalogo Beyblade X e alle informazioni utili per scegliere.
          </p>
          <Link
            href="/chi-siamo"
            className="gd-display mt-4 inline-block text-small font-bold tracking-[0.08em] text-lime underline-offset-4 hover:underline"
          >
            Scopri il progetto
          </Link>
        </div>

        {content.footerColumns.map((column) => (
          <div key={column.title}>
            <h2 className="gd-mono text-[0.6875rem] font-normal not-italic tracking-[0.16em] text-grey-400">{column.title}</h2>
            <ul className="mt-4 flex flex-col gap-2.5">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link href={link.href as Route} className="text-small text-grey-600 transition-colors hover:text-lime">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {content.socialLinks.length ? (
        <div className="border-t border-white/[0.08] py-5">
          <ul className="mx-auto flex max-w-[1400px] flex-wrap justify-center gap-5 px-4">
            {content.socialLinks.map((link) => (
              <li key={link.label}>
                <a className="text-small text-grey-600 hover:text-lime" href={link.href} rel="noopener noreferrer">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="border-t border-white/[0.08]">
        <ul className="mx-auto flex max-w-[1400px] flex-col gap-3 px-4 py-5 sm:flex-row sm:flex-wrap sm:gap-8 sm:px-6 lg:px-10">
          {PROMISES.map(({ Icon, text }) => (
            <li key={text} className="flex items-center gap-2.5 text-small text-grey-600">
              <Icon className="size-4 text-lime" aria-hidden="true" />
              {text}
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-white/[0.08] py-5">
        <p className="gd-mono mx-auto max-w-[1400px] px-4 text-[0.6875rem] tracking-[0.04em] text-grey-400 sm:px-6 lg:px-10">
          © {new Date().getFullYear()} GEAR//DROP di {SELLER_NAME} · P.IVA {VAT_NUMBER} · Tutti i diritti riservati.
        </p>
      </div>
    </footer>
  );
}
