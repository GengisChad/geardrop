import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TelegramStrip } from "@/components/layout/telegram-strip";
import { TELEGRAM_CHANNEL_URL } from "@/lib/navigation";

/**
 * The Telegram channel at the very top of the shop (owner, 2026-11-26: "serve che il banner
 * telegram sia più visibile, anche in alto nel sito").
 */

const pathname = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

function stripOn(path: string): string {
  pathname.current = path;
  return renderToStaticMarkup(<TelegramStrip />);
}

afterEach(() => {
  pathname.current = "/";
});

describe("the Telegram strip above the header", () => {
  it("is one link to the channel, on the pages where a visitor is looking around", () => {
    for (const path of ["/", "/negozio", "/negozio/beyblade-x", "/prodotto/glory-valkerion-lf", "/meta", "/ricerca", "/chi-siamo", "/preferiti"]) {
      const html = stripOn(path);
      expect(html.match(/<a /g), path).toHaveLength(1);
      expect(html, path).toContain(`href="${TELEGRAM_CHANNEL_URL}"`);
      expect(html, path).toContain('rel="noopener noreferrer"');
      expect(html, path).toContain("su Telegram");
    }
  });

  it("stays off the pages where the visitor pays or signs in", () => {
    for (const path of ["/carrello", "/checkout", "/checkout/esito", "/account", "/account/ordini", "/login", "/registrati", "/ordine", "/password-dimenticata", "/nuova-password", "/conferma-email", "/conferma-recupero"]) {
      expect(stripOn(path), path).toBe("");
    }
  });

  it("promises nothing: no price, no count, no claim to be first", () => {
    expect(stripOn("/")).not.toMatch(/€|\d+ pezz|sconto|esclusiv|per primi|prima di tutti/i);
  });
});
