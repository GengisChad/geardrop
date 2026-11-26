"use client";

import { usePathname } from "next/navigation";
import { Send } from "lucide-react";
import { TelegramJoin } from "@/components/home/telegram-join";

/**
 * Paying and signing in are task surfaces (PRODUCT.md): nothing stands above them but the header.
 * The strip is for the pages where a visitor is still looking around.
 */
const TASK_PAGES = /^\/(carrello|checkout|account|login|registrati|ordine|password-dimenticata|nuova-password|conferma-email|conferma-recupero)(\/|$)/;

/**
 * The way into the Telegram channel at the very top of the shop (owner, 2026-11-26: the home's
 * band alone was too far down, "serve che il banner telegram sia più visibile, anche in alto nel
 * sito"). One line, one link, violet because the channel is where the pre-orders open.
 *
 * It is part of the page, above the sticky header: it is there from the first paint, never slides
 * in, never moves, and scrolls away with the page.
 */
export function TelegramStrip() {
  const pathname = usePathname();
  if (TASK_PAGES.test(pathname)) return null;
  return (
    <aside aria-label="Canale Telegram" data-testid="telegram-strip" className="on-dark bg-violet text-white">
      <TelegramJoin
        placement="top"
        className="gd-display mx-auto flex min-h-11 max-w-[1400px] items-center justify-center gap-2 whitespace-nowrap px-3 py-2 text-center text-[0.75rem] font-extrabold tracking-[0.02em] sm:px-4 sm:text-small sm:tracking-[0.04em]"
      >
        <Send className="size-4 shrink-0" aria-hidden="true" />
        {/* One line on a phone: the wide display face has room for the short form only. */}
        <span>
          Pre-ordini<span className="hidden sm:inline"> e novità</span> su Telegram
        </span>
        <span aria-hidden="true" className="text-lime">
          {"//"}
        </span>
        <span className="underline decoration-2 underline-offset-4">
          Entra<span className="hidden sm:inline"> nel canale</span>
        </span>
      </TelegramJoin>
    </aside>
  );
}
