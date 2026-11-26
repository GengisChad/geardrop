import { Send } from "lucide-react";
import { TelegramJoin } from "@/components/home/telegram-join";
import { buttonClass } from "@/components/ui/button";

/**
 * The way into the shop's Telegram channel (owner, 2026-11-26: "un bel pulsante su geardropshop
 * per entrare nella community telegram per pre-orders, news ecc").
 *
 * Violet, because violet is "on its way" across the shop and the channel is where the pre-orders
 * open. It stands high on the home, right after the first shelf (he asked for it to be seen sooner
 * than where it first stood, after the pre-orders), as a card with the sticker's keyline so it does
 * not read as one more shelf. It is still: nothing here moves but
 * the slab's one cut of light, and it says only what the channel really carries.
 */
export function TelegramBand() {
  return (
    <section data-testid="telegram-band" aria-labelledby="telegram-band-title" className="mx-auto mb-12 max-w-[1400px] px-4 sm:px-6 lg:mb-20 lg:px-10">
      <div className="on-dark relative overflow-hidden bg-violet text-white shadow-[0_0_0_2px_#fff,5px_6px_0_2px_rgba(0,0,0,0.55)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(-72deg,rgba(255,255,255,0.07)_0_2px,transparent_2px_22px)]"
        />
        <div aria-hidden="true" className="gd-rail absolute inset-x-0 top-0 opacity-90 [background-image:repeating-linear-gradient(90deg,rgba(255,255,255,0.4)_0_5px,transparent_5px_11px)]" />
        <div className="relative flex flex-col gap-6 px-5 pb-6 pt-8 lg:flex-row lg:items-center lg:justify-between lg:gap-10 lg:px-10 lg:py-9">
          <div className="min-w-0">
            <p className="gd-sticker bg-void px-2 py-0.5 text-[0.6875rem] text-white">Canale Telegram</p>
            <h2 id="telegram-band-title" className="gd-display-wide mt-4 text-[1.6rem] font-extrabold leading-[0.95] sm:text-[2.25rem]">
              Pre-ordini e novità{" "}
              <span className="whitespace-nowrap">
                <span className="gd-slab">su Telegram</span>
              </span>
            </h2>
            <p className="mt-3 max-w-[40rem] text-small leading-relaxed text-[#f4efff]">
              Pre-ordini riservati al canale, nuovi arrivi, pezzi tornati disponibili e prezzi ribassati: ti arriva un messaggio quando escono.
            </p>
          </div>
          <TelegramJoin placement="home" className={buttonClass({ size: "lg", className: "shrink-0 self-start lg:self-center" })}>
            <Send className="size-5" aria-hidden="true" />
            Entra nel canale
          </TelegramJoin>
        </div>
      </div>
    </section>
  );
}
