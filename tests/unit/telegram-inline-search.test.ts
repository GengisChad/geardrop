/**
 * Inline search (owner, 2026-11-27): "@GearDropNewsBot dran" in any chat lists the shop's pieces,
 * and a tap sends one with its price, availability and the button to buy it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/data/catalog";
import type { Product } from "@/lib/commerce/types";
import type { TelegramGateway } from "@/lib/telegram/api";
import { handleUpdate, type NewsDeps, type NewsStore } from "@/lib/telegram/bot";
import { INLINE_RESULTS, searchInline, type InlineArticle } from "@/lib/telegram/inline-search";

const glory = PRODUCTS.find((product) => product.slug === "glory-valkerion-lf")!;
const available: Product = { ...glory, stock: "disponibile", availableQuantity: 4 };
const soldOut: Product = { ...glory, slug: "glory-valkerion-lf-bis", name: "Glory Valkerion Bis", stock: "esaurito", availableQuantity: 0 };
const hidden: Product = { ...glory, slug: "glory-telegram", name: "Glory Telegram", stock: "pre-ordine", availableQuantity: 3, channelOnly: true };
const arriving: Product = { ...glory, slug: "glory-arriving", name: "Glory Arriving", stock: "pre-ordine", availableQuantity: 8, channelOnly: "avvisami" };

describe("searching the shop from any chat", () => {
  it("finds a piece by any word of its name, accents and case aside, and offers the cart", () => {
    const [first] = searchInline("VALKERIÒN glory", [available]);
    expect(first).toEqual<InlineArticle>({
      type: "article",
      id: "glory-valkerion-lf",
      title: "Glory Valkerion LF",
      description: "€19,99 · Disponibile",
      thumbnail_url: expect.stringMatching(/^https:\/\/.+\.webp$/),
      input_message_content: {
        message_text: "<b>Glory Valkerion LF</b>\n<b>€19,99</b> · Disponibile",
        parse_mode: "HTML",
        link_preview_options: { url: expect.stringContaining("/prodotto/glory-valkerion-lf"), prefer_large_media: true, show_above_text: true },
      },
      reply_markup: { inline_keyboard: [[{ text: "Compra sul sito", url: expect.stringContaining("/carrello?aggiungi=glory-valkerion-lf") }]] },
    });
  });

  it("offers «Avvisami» on Telegram for a sold-out piece, and lists it after the ones on sale", () => {
    const results = searchInline("glory", [soldOut, available]);
    expect(results.map((result) => result.id)).toEqual(["glory-valkerion-lf", "glory-valkerion-lf-bis"]);
    expect(results[1]!.description).toBe("€19,99 · Esaurito");
    expect(results[1]!.reply_markup.inline_keyboard).toEqual([
      [{ text: "Avvisami su Telegram", url: "https://t.me/GearDropNewsBot?start=av-glory-valkerion-lf-bis" }],
      [{ text: "Vedi sul sito", url: expect.stringContaining("/prodotto/glory-valkerion-lf-bis") }],
    ]);
  });

  it("never lists a piece kept off the shop, and shows one on its way as the shop does", () => {
    const results = searchInline("glory", [hidden, arriving]);
    expect(results.map((result) => result.id)).toEqual(["glory-arriving"]);
    expect(results[0]!.description).toBe("€19,99 · In arrivo");
  });

  it("puts the pieces named first, before the ones that only mention the word", () => {
    const mentions: Product = { ...available, slug: "kit-x", name: "Kit X", description: "Con dentro un Glory Valkerion." };
    expect(searchInline("glory", [mentions, available]).map((result) => result.id)).toEqual(["glory-valkerion-lf", "kit-x"]);
  });

  it("lists what can be bought now for an empty query, a page at most", () => {
    const many = Array.from({ length: INLINE_RESULTS + 5 }, (_, index) => ({ ...available, slug: `piece-${index}`, name: `Piece ${String(index).padStart(2, "0")}` }));
    const results = searchInline("  ", [soldOut, ...many]);
    expect(results).toHaveLength(INLINE_RESULTS);
    expect(results.some((result) => result.id === soldOut.slug)).toBe(false);
    expect(searchInline("nessun pezzo così", [available])).toEqual([]);
  });

  it("finds every piece of the real catalogue that is on the shop by its own name", () => {
    for (const product of PRODUCTS.filter((item) => item.channelOnly !== true)) {
      expect(searchInline(product.name, PRODUCTS).map((result) => result.id)).toContain(product.slug);
    }
  });
});

describe("the bot answering an inline search", () => {
  it("answers anyone with what the shop serves, and keeps nothing", async () => {
    const answered: { id: string; results: readonly InlineArticle[] }[] = [];
    const telegram: TelegramGateway = {
      sendPost: async () => 1,
      sendText: async () => 1,
      setKeyboard: async () => true,
      deleteMessage: async () => true,
      answerCallback: async () => {},
      answerInline: async (id, results) => {
        answered.push({ id, results });
        return true;
      },
    };
    const writes: unknown[] = [];
    const store: NewsStore = {
      readMemory: async () => new Map(),
      writeMemory: async (entries) => {
        writes.push(entries);
      },
      addDrafts: async () => 0,
      unsentDrafts: async () => [],
      claimSending: async () => false,
      markSent: async () => {},
      forgetSent: async () => 0,
      claimDecision: async () => null,
      finish: async () => {},
    };
    const deps: NewsDeps = {
      store,
      telegram,
      ownerChatId: "111222333",
      channelId: "@geardropshop",
      now: () => new Date("2026-11-27T10:00:00.000Z"),
      loadProducts: async () => [available, hidden],
      loadMetaMonths: async () => [],
      loadMeta: async () => null,
    };
    expect(await handleUpdate({ inline_query: { id: "q1", from: { id: 444555666 }, query: "glory" } }, deps)).toBe("inline");
    expect(answered).toEqual([{ id: "q1", results: [expect.objectContaining({ id: "glory-valkerion-lf" })] }]);
    expect(writes).toEqual([]);
  });

  it("is among the updates the webhook asks Telegram for", () => {
    expect(readFileSync(join(process.cwd(), "scripts/telegram.ts"), "utf8")).toContain('const UPDATES = ["message", "callback_query", "inline_query"];');
  });
});
