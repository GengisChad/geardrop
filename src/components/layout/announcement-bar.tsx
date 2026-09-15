import { Fragment } from "react";

const ITEMS = [
  "Nuove uscite in pre-ordine",
  "Spedizione €4,90 · gratis da €59",
  "Pagamento sicuro con Stripe",
  "Reso gratuito entro 30 giorni",
] as const;

/**
 * Lime ticker above the header with the store's standing promises. Screen readers get the
 * list once; the scrolling copies are decorative.
 */
export function AnnouncementBar() {
  const loop = [...ITEMS, ...ITEMS];

  return (
    <div data-testid="ticker" className="relative flex h-9 items-center overflow-hidden bg-lime text-void">
      <p className="sr-only">{ITEMS.join(". ")}.</p>
      <div aria-hidden="true" className="flex w-max animate-[gd-marquee_42s_linear_infinite]">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0 items-center gap-7 pr-7">
            {loop.map((text, index) => (
              <Fragment key={`${copy}-${index}`}>
                <span className="gd-mono whitespace-nowrap text-[0.75rem] font-bold uppercase tracking-[0.14em]">{text}</span>
                <span className="size-1.5 shrink-0 rotate-45 bg-void" />
              </Fragment>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
