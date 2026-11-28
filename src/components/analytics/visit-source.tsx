"use client";

import { useEffect } from "react";
import { recordVisitSource } from "@/lib/attribution";
import { recordTelegramCart } from "@/lib/telegram-cart";

/**
 * Notes where this visit came from, once per page load, so the order can say which channel
 * sold it. Renders nothing. See src/lib/attribution.ts for what is kept and why.
 *
 * It also notes the bot chat of a cart link from the Telegram bot (src/lib/telegram-cart.ts), so an
 * unpaid cart opened from there can get one reminder in that chat.
 */
export function VisitSource() {
  useEffect(() => {
    recordVisitSource();
    recordTelegramCart();
  }, []);
  return null;
}
