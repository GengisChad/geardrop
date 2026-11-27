/**
 * «Avvisami» on Telegram (owner, 2026-11-27): the product page's button opens the bot, the bot keeps
 * the chat in the shop's «Avvisami» list, and sends one private message with «Compra» as soon as the
 * piece can be bought on the site.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RestockForm } from "@/components/product/restock-form";
import { PRODUCTS } from "@/data/catalog";
import { LEGAL_PAGES } from "@/data/pages";
import type { Product } from "@/lib/commerce/types";
import type { TelegramGateway } from "@/lib/telegram/api";
import { handleUpdate, type NewsDeps, type NewsStore } from "@/lib/telegram/bot";
import type { InlineKeyboard } from "@/lib/telegram/messages";
import { RESTOCK_KEEP_DAYS, buyableOnShop, notifyRestocks, parseRestockAction, slugFromRestockStart, type RestockRequest, type RestockStore } from "@/lib/telegram/restock";
import { restockStartPayload, restockTelegramUrl } from "@/lib/telegram/restock-link";

const OWNER = "111222333";
const BUYER = "444555666";
const glory = PRODUCTS.find((product) => product.slug === "glory-valkerion-lf")!;
const soldOut: Product = { ...glory, stock: "esaurito", availableQuantity: 0 };
const back: Product = { ...glory, stock: "disponibile", availableQuantity: 4 };

type Sent = { chatId: string; text: string; keyboard?: InlineKeyboard | undefined };

function world(initial: readonly Product[]) {
  const state = { products: initial, now: new Date("2026-11-27T10:00:00.000Z") };
  const rows: (RestockRequest & { createdAt: number })[] = [];
  const sent: Sent[] = [];
  const answers: string[] = [];
  let nextId = 0;
  const restock: RestockStore = {
    add: async (chatId, slug) => {
      const existing = rows.find((row) => row.chatId === chatId && row.slug === slug);
      if (existing) return existing.id;
      rows.push({ id: (nextId += 1), chatId, slug, createdAt: state.now.getTime() });
      return nextId;
    },
    remove: async (id, chatId) => {
      const index = rows.findIndex((row) => row.id === id && row.chatId === chatId);
      if (index < 0) return false;
      rows.splice(index, 1);
      return true;
    },
    pending: async () => rows.map(({ id, chatId, slug }) => ({ id, chatId, slug })),
    done: async (ids) => {
      for (const id of ids) rows.splice(rows.findIndex((row) => row.id === id), 1);
    },
    purge: async (before) => {
      const old = rows.filter((row) => row.createdAt < before.getTime());
      for (const row of old) rows.splice(rows.indexOf(row), 1);
      return old.length;
    },
  };
  const telegram: TelegramGateway = {
    sendPost: async () => 1,
    sendText: async (chatId, text, keyboard) => {
      sent.push({ chatId, text, keyboard });
      return 1;
    },
    setKeyboard: async () => true,
    deleteMessage: async () => true,
    answerInline: async () => true,
    answerCallback: async (_id, text) => {
      answers.push(text);
    },
  };
  const store: NewsStore = {
    readMemory: async () => new Map(),
    writeMemory: async () => {},
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
    ownerChatId: OWNER,
    channelId: "@geardropshop",
    now: () => state.now,
    loadProducts: async () => state.products,
    loadMetaMonths: async () => [],
    loadMeta: async () => null,
    restock,
  };
  const write = (text: string, from = BUYER) => handleUpdate({ message: { chat: { id: Number(from), type: "private" }, from: { id: Number(from) }, text } }, deps);
  const tap = (data: string, from = BUYER) => handleUpdate({ callback_query: { id: "cb", from: { id: Number(from) }, data } }, deps);
  const notify = () => notifyRestocks({ telegram, loadProducts: deps.loadProducts, now: deps.now, store: restock, channelId: deps.channelId }, state.products);
  return { state, rows, sent, answers, write, tap, notify };
}

describe("asking the bot to be told", () => {
  it("keeps the chat for a piece that cannot be bought, once, with a way to drop it", async () => {
    const { write, rows, sent } = world([soldOut]);
    expect(await write(`/start av-${glory.slug}`)).toBe("restock");
    expect(rows).toEqual([expect.objectContaining({ chatId: BUYER, slug: glory.slug })]);
    expect(sent.at(-1)).toEqual({
      chatId: BUYER,
      text: "Fatto: ti scrivo qui appena <b>Glory Valkerion LF</b> si può ordinare sul sito.",
      keyboard: [[{ text: "Non avvisarmi più", callback_data: "gd:a:x:1" }]],
    });
    await write(`/start av-${glory.slug}`);
    expect(rows).toHaveLength(1);
  });

  it("does not keep it when the piece can already be bought, and offers the cart", async () => {
    const { write, rows, sent } = world([back]);
    await write(`/start av-${glory.slug}`);
    expect(rows).toEqual([]);
    expect(sent.at(-1)!.text).toBe("<b>Glory Valkerion LF</b> si può già ordinare sul sito.");
    expect(sent.at(-1)!.keyboard).toEqual([[{ text: "Compra", url: expect.stringContaining(`/carrello?aggiungi=${glory.slug}`) }]]);
  });

  it("points to the channel for a piece whose pre-order is taken there", async () => {
    const { write, sent } = world([{ ...glory, stock: "pre-ordine", availableQuantity: 8, channelOnly: "avvisami" }]);
    await write(`/start av-${glory.slug}`);
    expect(sent.at(-1)!.text).toContain("Intanto alcuni pezzi si pre-ordinano sul canale @geardropshop.");
  });

  it("lets only the chat that asked drop its request", async () => {
    const { write, tap, rows, answers } = world([soldOut]);
    await write(`/start av-${glory.slug}`);
    await tap("gd:a:x:1", OWNER);
    expect(answers.at(-1)).toBe("Avviso già tolto.");
    expect(rows).toHaveLength(1);
    await tap("gd:a:x:1");
    expect(answers.at(-1)).toBe("Avviso tolto.");
    expect(rows).toEqual([]);
  });

  it("says so for a product that left the catalogue", async () => {
    const { write, rows, sent } = world([]);
    await write("/start av-pezzo-sparito");
    expect(rows).toEqual([]);
    expect(sent.at(-1)!.text).toBe("Questo prodotto non è più nel catalogo.");
  });
});

describe("telling the chats when the piece is back", () => {
  it("sends one message with the shop's price and «Compra», then forgets the request", async () => {
    const { write, notify, state, rows, sent } = world([soldOut]);
    await write(`/start av-${glory.slug}`);
    expect(await notify()).toBe(0);
    state.products = [back];
    expect(await notify()).toBe(1);
    const message = sent.at(-1)!;
    expect(message.chatId).toBe(BUYER);
    expect(message.text.split("\n")).toEqual(["DI NUOVO DISPONIBILE //", "<b>Glory Valkerion LF</b>", "<b>€19,99</b> · Disponibile"]);
    expect(message.keyboard).toEqual([[{ text: "Compra", url: expect.stringContaining(`/carrello?aggiungi=${glory.slug}`) }]]);
    expect(rows).toEqual([]);
    expect(await notify()).toBe(0);
  });

  it("waits while the piece is a Telegram-only pre-order, which the site cannot sell", async () => {
    const { write, notify, state, rows } = world([soldOut]);
    await write(`/start av-${glory.slug}`);
    state.products = [{ ...glory, stock: "pre-ordine", availableQuantity: 8, channelOnly: true }];
    expect(await notify()).toBe(0);
    expect(rows).toHaveLength(1);
    expect(buyableOnShop(state.products[0]!)).toBe(false);
  });

  it("drops a request after six months, as the privacy notice says", async () => {
    const { write, notify, state, rows } = world([soldOut]);
    await write(`/start av-${glory.slug}`);
    state.now = new Date(state.now.getTime() + (RESTOCK_KEEP_DAYS + 1) * 86_400_000);
    await notify();
    expect(rows).toEqual([]);
  });
});

describe("the button on the product page", () => {
  it("opens the shop's bot with the product", () => {
    expect(restockStartPayload(glory.slug)).toBe("av-glory-valkerion-lf");
    expect(restockTelegramUrl(glory.slug)).toBe("https://t.me/GearDropNewsBot?start=av-glory-valkerion-lf");
    expect(slugFromRestockStart("/start av-glory-valkerion-lf")).toBe("glory-valkerion-lf");
    expect(slugFromRestockStart("/start pre-glory-valkerion-lf")).toBeNull();
    expect(parseRestockAction("gd:a:x:12")).toEqual({ id: 12 });
    expect(parseRestockAction("gd:o:12:paid")).toBeNull();
    expect(restockStartPayload("a".repeat(70))).toBeNull();
  });

  it("sits under the email form", () => {
    const html = renderToStaticMarkup(<RestockForm slug={glory.slug} name={glory.name} />);
    expect(html).toContain('data-testid="restock-telegram"');
    expect(html).toContain('href="https://t.me/GearDropNewsBot?start=av-glory-valkerion-lf"');
    expect(html).toContain("Oppure avvisami su Telegram");
  });
});

describe("what the privacy notice says about it", () => {
  const body = (heading: string) => LEGAL_PAGES.privacy.sections.find((section) => section.heading === heading)!.body.join(" ");

  it("names the data and keeps the email rule for it", () => {
    expect(body("Quali dati trattiamo")).toContain("Avvisi su Telegram: se chiedi al nostro bot Telegram di avvisarti");
    expect(body("A chi li comunichiamo")).toContain(
      "L'email o l'identificativo Telegram lasciati per ricevere una notifica di disponibilità sono usati esclusivamente per quella notifica e vengono eliminati dopo l'invio o entro sei mesi dalla registrazione.",
    );
  });
});
