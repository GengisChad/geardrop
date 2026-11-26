import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TelegramBand } from "@/components/home/telegram-band";
import { buttonClass } from "@/components/ui/button";
import { SOCIAL_LINKS, TELEGRAM_CHANNEL_URL } from "@/lib/navigation";

describe("the way into the Telegram channel", () => {
  it("is one link to the shop's channel, opened outside the shop", () => {
    const html = renderToStaticMarkup(<TelegramBand />);
    expect(TELEGRAM_CHANNEL_URL).toBe("https://t.me/geardropshop");
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain(`href="${TELEGRAM_CHANNEL_URL}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Entra nel canale");
  });

  it("says what the channel carries and promises nothing else", () => {
    const html = renderToStaticMarkup(<TelegramBand />);
    expect(html).toContain("Pre-ordini riservati al canale, nuovi arrivi, pezzi tornati disponibili e prezzi ribassati");
    // No price, no discount and no "first" or "exclusive" claim the shop would have to keep.
    expect(html).not.toMatch(/€|sconto|esclusiv|per primi|prima di tutti/i);
  });

  it("stands in the footer beside the shop's other accounts", () => {
    // Last on purpose: its place in the list is its unique sort_order in the generated seed.
    expect(SOCIAL_LINKS.map((link) => link.label)).toEqual(["Instagram", "YouTube", "Telegram"]);
    expect(SOCIAL_LINKS.find((link) => link.key === "telegram")?.href).toBe(TELEGRAM_CHANNEL_URL);
  });

  it("dresses a link that leaves the shop like the shop's own buttons", () => {
    expect(buttonClass()).toContain("bg-lime");
    expect(buttonClass({ variant: "secondary", fullWidth: true })).toContain("bg-violet");
    expect(buttonClass({ variant: "secondary", fullWidth: true })).toContain("w-full");
  });
});
