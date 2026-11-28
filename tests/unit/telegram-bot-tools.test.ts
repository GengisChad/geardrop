/**
 * The bot's new jobs (owner, 2026-11-28: "fai il resto"): stock and prices from the owner's chat,
 * assistance through the bot, «Com'è andata?» at delivery, the cart reminder and the shop as a
 * Mini App. Everything runs here against fakes of Telegram and of the shop's tables.
 */
import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/data/catalog";
import { LEGAL_PAGES } from "@/data/pages";
import { placeOrderSchema } from "@/lib/checkout-schema";
import type { Product } from "@/lib/commerce/types";
import { buildCheckoutSessionFields } from "@/lib/payments/stripe-checkout";
import type { TelegramGateway } from "@/lib/telegram/api";
import { handleUpdate, type NewsDeps, type NewsStore } from "@/lib/telegram/bot";
import {
  cartLinkFor,
  cartToken,
  cartTokenGateway,
  chatFromCartToken,
  remindAbandonedCarts,
  sessionLines,
  type CartSession,
} from "@/lib/telegram/cart-reminder";
import { deliveryCheckKeyboard } from "@/lib/telegram/delivery-check";
import type { InlineKeyboard } from "@/lib/telegram/messages";
import { MINI_APP_URL } from "@/lib/telegram/mini-app";
import { tellFollowers, type FollowStore } from "@/lib/telegram/order-follow";
import {
  isRomeMonday,
  matchProducts,
  parseLoad,
  slowStockReport,
  stockReport,
  type OwnerToolsStore,
  type SlowPiece,
  type StockRow,
} from "@/lib/telegram/owner-tools";
import { HOURLY_LIMIT, SUPPORT_KEEP_DAYS, type SupportStore } from "@/lib/telegram/support";
import { TELEGRAM_CART_TOKEN, telegramCartForCheckout } from "@/lib/telegram-cart";

const OWNER = "111222333";
const BUYER = "444555666";
const SECRET = "test-webhook-secret-0123456789";

type Sent = { chatId: string; text: string; keyboard?: InlineKeyboard | undefined };

const rows: readonly StockRow[] = [
  { id: 1, slug: "dran-sword-3-60f", name: "Dran Sword 3-60F", sku: "BX-01", stock: 3, preorderAllocation: 0, priceCents: 1990, published: true },
  { id: 2, slug: "dran-buster-1-60a", name: "Dran Buster 1-60A", sku: "UX-01", stock: 0, preorderAllocation: 8, priceCents: 2490, published: true },
  { id: 3, slug: "hells-scythe-4-60t", name: "Hells Scythe 4-60T", sku: "BX-02", stock: 5, preorderAllocation: 0, priceCents: 1990, published: false },
];

function world(options: { readonly slow?: readonly SlowPiece[] } = {}) {
  const state = { now: new Date("2026-11-30T08:00:00.000Z"), stock: new Map(rows.map((row) => [row.id, row.stock])) };
  const sent: Sent[] = [];
  const answers: string[] = [];
  const copies: { to: string; from: string; messageId: number }[] = [];
  const keyboards: { chatId: string; messageId: number; keyboard: InlineKeyboard }[] = [];
  const keys = new Set<string>();
  const applied: number[] = [];
  let afterChange = 0;
  let nextMessage = 100;

  const telegram: TelegramGateway = {
    sendPost: async () => 1,
    sendText: async (chatId, text, keyboard) => {
      sent.push({ chatId, text, keyboard });
      return (nextMessage += 1);
    },
    setKeyboard: async (chatId, messageId, keyboard) => {
      keyboards.push({ chatId, messageId, keyboard });
      return true;
    },
    deleteMessage: async () => true,
    answerInline: async () => true,
    sendPoll: async () => null,
    stopPoll: async () => null,
    answerCallback: async (_id, text) => {
      answers.push(text);
    },
    copyMessage: async (to, from, messageId) => {
      copies.push({ to, from, messageId });
      return (nextMessage += 1);
    },
  };

  const ownerStore: OwnerToolsStore = {
    products: async () => rows.map((row) => ({ ...row, stock: state.stock.get(row.id)! })),
    adjust: async (productId, delta, key) => {
      if (keys.has(key)) return null;
      const next = state.stock.get(productId)! + delta;
      if (next < 0) throw new Error("GD_INSUFFICIENT_STOCK");
      keys.add(key);
      state.stock.set(productId, next);
      return next;
    },
    slowPieces: async () => options.slow ?? [],
    applyProposal: async (proposalId, key) => {
      if (keys.has(key)) return null;
      keys.add(key);
      applied.push(proposalId);
      return 1790;
    },
  };

  const links: { chatId: string; ownerMessageId: number; orderId: number | null; at: number }[] = [];
  const supportStore: SupportStore = {
    record: async (chatId, ownerMessageId, orderId) => {
      links.push({ chatId, ownerMessageId, orderId, at: state.now.getTime() });
    },
    chatFor: async (id) => {
      const link = links.find((item) => item.ownerMessageId === id);
      return link ? { chatId: link.chatId, orderId: link.orderId } : null;
    },
    countSince: async (chatId, since) => links.filter((item) => item.chatId === chatId && item.at >= since.getTime()).length,
    orderFor: async (chatId, since) => links.filter((item) => item.chatId === chatId && item.orderId !== null && item.at >= since.getTime()).at(-1)?.orderId ?? null,
    purge: async (before) => {
      const old = links.filter((item) => item.at < before.getTime());
      for (const item of old) links.splice(links.indexOf(item), 1);
      return old.length;
    },
  };
  const notes: { orderId: number; text: string }[] = [];

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
    loadProducts: async () => [],
    loadMetaMonths: async () => [],
    loadMeta: async () => null,
    ownerTools: {
      telegram,
      ownerChatId: OWNER,
      store: ownerStore,
      afterChange: async () => {
        afterChange += 1;
      },
      now: () => state.now,
    },
    support: { telegram, ownerChatId: OWNER, store: supportStore, now: () => state.now, orderNumber: async (id) => (id === 41 ? "GD-ABC123" : null), shopEmail: "infogeardrop@gmail.com" },
    deliveryCheck: {
      telegram,
      ownerChatId: OWNER,
      secret: SECRET,
      support: supportStore,
      orders: {
        note: async (orderId, text) => {
          notes.push({ orderId, text });
        },
        orderNumber: async (id) => (id === 41 ? "GD-ABC123" : null),
      },
    },
  };
  let update = 0;
  const write = (text: string, from = OWNER, extra: Record<string, unknown> = {}) =>
    handleUpdate({ message: { message_id: (update += 1), chat: { id: Number(from), type: "private" }, from: { id: Number(from), first_name: "Mario", username: "mario_bey" }, text, ...extra } }, deps);
  const photo = (from = BUYER) => handleUpdate({ message: { message_id: (update += 1), chat: { id: Number(from), type: "private" }, from: { id: Number(from), first_name: "Mario" }, photo: [{}] } }, deps);
  const tap = (data: string, from = OWNER, messageId = 500) => handleUpdate({ callback_query: { id: "cb", from: { id: Number(from) }, data, message: { message_id: messageId } } }, deps);
  return { state, sent, answers, copies, keyboards, links, notes, applied, write, photo, tap, afterChange: () => afterChange };
}

describe("the owner's stock from his chat", () => {
  it("finds products by name, slug or SKU, an exact code first", () => {
    expect(matchProducts(rows, "dran").map((row) => row.id)).toEqual([2, 1]);
    expect(matchProducts(rows, "bx-01").map((row) => row.id)).toEqual([1]);
    expect(matchProducts(rows, "sword 3 60").map((row) => row.id)).toEqual([1]);
    expect(matchProducts(rows, "  ")).toEqual([]);
  });

  it("reads «/carico <words> <number>», a bare number being a load", () => {
    expect(parseLoad("/carico dran sword +3")).toEqual({ query: "dran sword", delta: 3 });
    expect(parseLoad("/carico BX-01 -1")).toEqual({ query: "BX-01", delta: -1 });
    expect(parseLoad("/carico dran 5")).toEqual({ query: "dran", delta: 5 });
    expect(parseLoad("/carico dran")).toBeNull();
    expect(parseLoad("/carico dran 0")).toBeNull();
  });

  it("says what the shelf holds and what is set aside for pre-orders", async () => {
    expect(stockReport(rows, "dran")).toContain("<b>Dran Buster 1-60A</b>\nUX-01 · magazzino <b>0</b> · pre-ordini 8 · €24,90");
    expect(stockReport(rows, "scythe")).toContain("non pubblicato");
    const { write, sent } = world();
    expect(await write("/stock sword")).toBe("stock");
    expect(sent.at(-1)!.text).toBe("<b>Dran Sword 3-60F</b>\nBX-01 · magazzino <b>3</b> · €19,90");
  });

  it("moves stock only after «Conferma», once however often it is tapped, then looks at the shop", async () => {
    const world_ = world();
    await world_.write("/carico sword +2");
    expect(world_.sent.at(-1)!.text).toContain("Magazzino 3 → <b>5</b> (+2)");
    expect(world_.sent.at(-1)!.keyboard).toEqual([[{ text: "Conferma +2", callback_data: "gd:k:y:1:2" }, { text: "Annulla", callback_data: "gd:k:n" }]]);
    expect(world_.state.stock.get(1)).toBe(3);

    await world_.tap("gd:k:y:1:2", OWNER, 777);
    expect(world_.state.stock.get(1)).toBe(5);
    expect(world_.answers.at(-1)).toBe("Registrato.");
    expect(world_.sent.at(-1)!.text).toBe("Fatto: <b>Dran Sword 3-60F</b> ora ha <b>5</b> pezzi in magazzino.");
    expect(world_.afterChange()).toBe(1);
    expect(world_.keyboards.at(-1)).toEqual({ chatId: OWNER, messageId: 777, keyboard: [] });

    await world_.tap("gd:k:y:1:2", OWNER, 777);
    expect(world_.state.stock.get(1)).toBe(5);
    expect(world_.answers.at(-1)).toBe("Già fatto.");
  });

  it("asks which one when several match, and never takes more than the shelf holds", async () => {
    const world_ = world();
    await world_.write("/carico dran -1");
    expect(world_.sent.at(-1)!.text).toBe("Quale? (-1)");
    expect(world_.sent.at(-1)!.keyboard!.flat()).toContainEqual({ text: "Dran Buster 1-60A (0)", callback_data: "gd:k:c:2:-1" });
    await world_.tap("gd:k:c:2:-1");
    expect(world_.sent.at(-1)!.text).toBe("<b>Dran Buster 1-60A</b> ne ha 0 in magazzino: non posso toglierne 1.");
  });

  it("is the owner's only: a customer's /carico is a message to the shop, his tap is refused", async () => {
    const world_ = world();
    await world_.write("/carico sword +50", BUYER);
    expect(world_.state.stock.get(1)).toBe(3);
    expect(await world_.tap("gd:k:y:1:50", BUYER)).toBe("refused");
    expect(world_.state.stock.get(1)).toBe(3);
  });
});

describe("the pieces that do not sell", () => {
  const slow = (id: number, stock: number, priceCents: number, proposal: SlowPiece["proposal"] = null): SlowPiece => ({
    ...rows[0]!,
    id,
    name: `Pezzo ${id}`,
    stock,
    priceCents,
    lastSaleAt: null,
    proposal,
  });

  it("lists the costliest to keep first, with the agent's proposal and a button to apply it", () => {
    const report = slowStockReport([slow(1, 1, 1990), slow(2, 4, 2490, { id: 9, priceCents: 2190, outOfPolicy: false }), slow(3, 2, 2990, { id: 10, priceCents: 1500, outOfPolicy: true })])!;
    expect(report.text.indexOf("Pezzo 2")).toBeLessThan(report.text.indexOf("Pezzo 3"));
    expect(report.text.indexOf("Pezzo 3")).toBeLessThan(report.text.indexOf("Pezzo 1"));
    // 1 × 19,90 + 4 × 24,90 + 2 × 29,90
    expect(report.text).toContain("€179,30 a prezzo pieno");
    expect(report.text).toContain("Proposta dell'agente prezzi: <b>€21,90</b>.");
    expect(report.text).toContain("fuori dalle tue regole: decidi nel pannello");
    expect(report.keyboard[0]).toEqual([{ text: "Applica €21,90 · Pezzo 2", callback_data: "gd:k:pp:9" }]);
    expect(report.keyboard.at(-1)![0]).toEqual({ text: "Chiedi le proposte all'agente prezzi", url: "https://geardropshop.it/admin/prezzi" });
    expect(slowStockReport([])).toBeNull();
  });

  it("applies a proposal on his tap, once, and looks at the shop for the price-drop draft", async () => {
    const world_ = world({ slow: [slow(2, 4, 2490, { id: 9, priceCents: 1790, outOfPolicy: false })] });
    await world_.write("/fermi");
    expect(world_.sent.at(-1)!.text).toContain("<b>PEZZI FERMI //</b>");
    await world_.tap("gd:k:pp:9");
    await world_.tap("gd:k:pp:9");
    expect(world_.applied).toEqual([9]);
    expect(world_.answers).toEqual(["Prezzo applicato.", "Già fatto."]);
    expect(world_.afterChange()).toBe(1);
  });

  it("says so on demand when nothing is slow", async () => {
    const { write, sent } = world();
    await write("/fermi");
    expect(sent.at(-1)!.text).toContain("Nessun pezzo fermo");
  });

  it("goes out on its own on Monday mornings, Rome time", () => {
    expect(isRomeMonday(new Date("2026-11-30T08:00:00.000Z"))).toBe(true);
    expect(isRomeMonday(new Date("2026-11-29T22:30:00.000Z"))).toBe(false);
    expect(isRomeMonday(new Date("2026-12-01T08:00:00.000Z"))).toBe(false);
  });
});

describe("assistance through the bot", () => {
  it("copies a customer's message to the owner under a header, and acknowledges it once", async () => {
    const world_ = world();
    expect(await world_.write("Ciao, il mio ordine non è arrivato", BUYER)).toBe("support");
    expect(world_.sent[0]).toEqual({ chatId: OWNER, text: "<b>ASSISTENZA //</b>\nScrive Mario (@mario_bey).\nRispondi (tieni premuto, «Rispondi») a questo messaggio o a quelli sotto e glielo giro.", keyboard: undefined });
    expect(world_.copies).toEqual([{ to: OWNER, from: BUYER, messageId: 1 }]);
    expect(world_.sent.at(-1)).toEqual({ chatId: BUYER, text: "Ricevuto: lo legge il negozio e ti risponde qui.", keyboard: undefined });

    await world_.photo();
    expect(world_.copies).toHaveLength(2);
    // Same conversation: no second header, no second acknowledgement.
    expect(world_.sent.filter((item) => item.text.startsWith("<b>ASSISTENZA"))).toHaveLength(1);
    expect(world_.sent.filter((item) => item.text.startsWith("Ricevuto"))).toHaveLength(1);
  });

  it("sends the owner's «Rispondi» back to that customer, and nothing else", async () => {
    const world_ = world();
    await world_.write("Avete il Cobalt Drake?", BUYER);
    const copied = world_.links.at(-1)!.ownerMessageId;
    expect(await world_.write("Sì, arriva lunedì", OWNER, { reply_to_message: { message_id: copied } })).toBe("support-reply");
    expect(world_.copies.at(-1)).toEqual({ to: BUYER, from: OWNER, messageId: 2 });
    expect(world_.sent.at(-1)!.text).toBe("Inviato.");
    // A reply to anything else is an ordinary message to the bot.
    expect(await world_.write("prova", OWNER, { reply_to_message: { message_id: 99999 } })).toBe("help");
  });

  it("stops copying a chat that writes too much in an hour, and says so once", async () => {
    const world_ = world();
    for (let index = 0; index < HOURLY_LIMIT + 3; index += 1) await world_.write(`messaggio ${index}`, BUYER);
    expect(world_.copies).toHaveLength(HOURLY_LIMIT - 1);
    expect(world_.sent.filter((item) => item.text.startsWith("Ci hai scritto molti messaggi"))).toHaveLength(1);
  });

  it("welcomes a customer who opens the bot with what it is for and the shop button", async () => {
    const { write, sent } = world();
    expect(await write("/start", BUYER)).toBe("welcome");
    expect(sent.at(-1)!.text).toContain("Hai una domanda su un pezzo o su un ordine? Scrivila qui");
    expect(sent.at(-1)!.keyboard).toEqual([[{ text: "Apri lo shop", web_app: { url: MINI_APP_URL } }]]);
  });

  it("is promised in the privacy notice with how long the links last", () => {
    const body = (heading: string) => LEGAL_PAGES.privacy.sections.find((section) => section.heading === heading)!.body.join(" ");
    expect(body("Quali dati trattiamo")).toContain("Assistenza su Telegram: se scrivi al nostro bot");
    expect(body("Per quanto tempo")).toContain(`Assistenza su Telegram: il collegamento tra la tua chat e i messaggi inoltrati si cancella dopo ${SUPPORT_KEEP_DAYS} giorni.`);
  });
});

describe("«Com'è andata?» at delivery", () => {
  it("asks once, with buttons signed for that order and that chat", async () => {
    const sent: Sent[] = [];
    const store: FollowStore = {
      loadOrder: async () => ({ id: 41, orderNumber: "GD-ABC123", status: "completed", carrier: "InPost", trackingCode: null, trackingUrl: null }),
      follow: async () => 1,
      unfollow: async () => true,
      followers: async () => [{ id: 1, chatId: BUYER, lastTold: "shipped" }],
      told: async () => {},
      forgetOrder: async () => {},
      purge: async () => 0,
    };
    const telegram = { sendText: async (chatId: string, text: string, keyboard?: InlineKeyboard) => (sent.push({ chatId, text, keyboard }), 1) } as unknown as TelegramGateway;
    await tellFollowers({ telegram, store, now: () => new Date(), secret: SECRET }, 41, { kind: "delivered" });
    expect(sent[0]!.text).toBe("<b>ORDINE GD-ABC123 //</b>\nConsegnato. Buone battaglie!\nCom'è andata?");
    expect(sent[0]!.keyboard).toEqual(deliveryCheckKeyboard(41, BUYER, SECRET));
    expect(deliveryCheckKeyboard(41, BUYER, SECRET)).not.toEqual(deliveryCheckKeyboard(41, "999888777", SECRET));
  });

  it("notes «Tutto ok» on the order and thanks", async () => {
    const world_ = world();
    const ok = deliveryCheckKeyboard(41, BUYER, SECRET)[0]![0]! as { callback_data: string };
    expect(await world_.tap(ok.callback_data, BUYER, 321)).toBe("delivery-check");
    expect(world_.notes).toEqual([{ orderId: 41, text: "Telegram: il cliente dice che è arrivato tutto bene." }]);
    expect(world_.keyboards.at(-1)).toEqual({ chatId: BUYER, messageId: 321, keyboard: [] });
    expect(world_.sent.at(-1)!.text).toBe("Grazie! Buone battaglie.");
  });

  it("turns «C'è un problema» into an alert, and the next message lands under that order", async () => {
    const world_ = world();
    const ko = deliveryCheckKeyboard(41, BUYER, SECRET)[0]![1]! as { callback_data: string };
    await world_.tap(ko.callback_data, BUYER);
    expect(world_.sent.find((item) => item.chatId === OWNER)!.text).toContain("Ordine GD-ABC123: dopo la consegna il cliente ha toccato «C'è un problema».");
    expect(world_.notes.at(-1)!.text).toContain("segnala un problema");
    await world_.photo();
    // The alert opened the conversation: the photo is copied under it, with no second header.
    expect(world_.copies.at(-1)).toEqual({ to: OWNER, from: BUYER, messageId: 1 });
    expect(world_.links.at(-1)!.orderId).toBe(41);
    expect(world_.sent.filter((item) => item.text.startsWith("<b>ASSISTENZA"))).toHaveLength(0);
  });

  it("ignores a tap whose signature is not the server's for that chat", async () => {
    const world_ = world();
    const forOther = deliveryCheckKeyboard(41, "999888777", SECRET)[0]![0]! as { callback_data: string };
    await world_.tap(forOther.callback_data, BUYER);
    expect(world_.notes).toEqual([]);
  });
});

describe("the cart reminder", () => {
  const glory = PRODUCTS.find((product) => product.slug === "glory-valkerion-lf")!;
  const onSale: Product = { ...glory, price: { amount: 3000, currency: "EUR" }, stock: "disponibile", availableQuantity: 4 };

  it("signs a private chat's cart links, and only those", async () => {
    const token = cartToken(BUYER, SECRET)!;
    expect(token).toMatch(TELEGRAM_CART_TOKEN);
    expect(chatFromCartToken(token, SECRET)).toBe(BUYER);
    expect(chatFromCartToken(token, "another-secret")).toBeNull();
    expect(chatFromCartToken(`999888777.${token.split(".")[1]}`, SECRET)).toBeNull();
    expect(cartToken("@geardropshop", SECRET)).toBeNull();

    const seen: Sent[] = [];
    const inner = { sendText: async (chatId: string, text: string, keyboard?: InlineKeyboard) => (seen.push({ chatId, text, keyboard }), 1) } as unknown as TelegramGateway;
    const gateway = cartTokenGateway(inner, SECRET, OWNER);
    const keyboard: InlineKeyboard = [[{ text: "Compra", url: "https://geardropshop.it/carrello?aggiungi=x&utm_source=telegram" }, { text: "Pagina", url: "https://geardropshop.it/prodotto/x" }]];
    await gateway.sendText(BUYER, "", keyboard);
    await gateway.sendText(OWNER, "", keyboard);
    expect((seen[0]!.keyboard![0]![0] as { url: string }).url).toContain(`tgc=${encodeURIComponent(token)}`);
    expect((seen[0]!.keyboard![0]![1] as { url: string }).url).toBe("https://geardropshop.it/prodotto/x");
    expect(seen[1]!.keyboard).toEqual(keyboard);
  });

  it("puts the checked chat on the Stripe session, and drops a malformed token", () => {
    expect(placeOrderSchema.shape.telegramCart.parse("not-a-token")).toBeUndefined();
    expect(placeOrderSchema.shape.telegramCart.parse(cartToken(BUYER, SECRET))).toBe(cartToken(BUYER, SECRET));
    const storage = { getItem: () => cartToken(BUYER, SECRET) } as unknown as Storage;
    expect(telegramCartForCheckout({ sessionStorage: storage })).toEqual({ telegramCart: cartToken(BUYER, SECRET) });
    const quote = {
      lines: [{ slug: "glory-valkerion-lf", name: "Glory Valkerion LF", quantity: 1, unitPrice: { amount: 3000, currency: "EUR" } }],
      totals: { shipping: { amount: 490, currency: "EUR" } },
      shippingCode: "inpost-locker",
    };
    const order = { idempotencyKey: "4c1f7a0e-1b2c-4d3e-9f00-112233445566", lines: [{ slug: "glory-valkerion-lf", quantity: 1 }] };
    const fields = buildCheckoutSessionFields({ quote, order, origin: "https://geardropshop.it", express: true, telegramChat: BUYER } as never, new Map([["glory-valkerion-lf", "price_1"]]));
    expect(fields["metadata[telegram_chat]"]).toBe(BUYER);
    const without = buildCheckoutSessionFields({ quote, order, origin: "https://geardropshop.it", express: true } as never, new Map([["glory-valkerion-lf", "price_1"]]));
    expect(without["metadata[telegram_chat]"]).toBeUndefined();
  });

  it("reads the lines back from the session and refills the cart", () => {
    expect(sessionLines({ lines: "glory-valkerion-lf x2, cobalt-drake-4-60f x1" })).toEqual([
      { slug: "glory-valkerion-lf", quantity: 2 },
      { slug: "cobalt-drake-4-60f", quantity: 1 },
    ]);
    expect(cartLinkFor([{ slug: "glory-valkerion-lf", quantity: 2 }])).toContain("/carrello?aggiungi=glory-valkerion-lf&q=2");
    expect(cartLinkFor([{ slug: "a", quantity: 1 }, { slug: "b", quantity: 3 }])).toContain("aggiungi=a%2Cb");
  });

  function reminders(sessions: readonly CartSession[], products: readonly Product[], memoryStart: Map<string, unknown> = new Map()) {
    const memory = new Map(memoryStart);
    const sent: Sent[] = [];
    const telegram = { sendText: async (chatId: string, text: string, keyboard?: InlineKeyboard) => (sent.push({ chatId, text, keyboard }), 1) } as unknown as TelegramGateway;
    const now = new Date("2026-11-28T08:00:00.000Z");
    const context = {
      telegram,
      loadProducts: async () => products,
      memory: { read: async () => memory, write: async (entries: ReadonlyMap<string, unknown>) => void entries.forEach((value, key) => memory.set(key, value)) },
      listSessions: async () => sessions,
      now: () => now,
    };
    return { run: () => remindAbandonedCarts(context), sent, memory };
  }
  const at = (hoursBefore: number) => Math.floor(new Date("2026-11-28T08:00:00.000Z").getTime() / 1000) - hoursBefore * 3600;
  const expired = (id: string, created: number, chat = BUYER): CartSession => ({ id, created, status: "expired", metadata: { telegram_chat: chat, lines: "glory-valkerion-lf x1" } });

  it("reminds once, with the pieces still on sale, and not again within a week", async () => {
    const world_ = reminders([expired("cs_1", at(20))], [onSale]);
    expect(await world_.run()).toBe(1);
    expect(world_.sent[0]!.chatId).toBe(BUYER);
    expect(world_.sent[0]!.text).toBe("<b>IL TUO CARRELLO //</b>\nIeri hai lasciato nel carrello:\n1 × <b>Glory Valkerion LF</b> · €30,00\n\nÈ ancora disponibile: lo riprendi da qui.");
    expect(world_.sent[0]!.keyboard!.at(-1)).toEqual([{ text: "Non ricordarmelo più", callback_data: "gd:c:x" }]);
    expect(await world_.run()).toBe(0);
  });

  it("stays quiet when the chat paid after, the piece sold out, or the chat said no more", async () => {
    const paid: CartSession = { id: "cs_2", created: at(19), status: "complete", metadata: { telegram_chat: BUYER } };
    expect(await reminders([expired("cs_1", at(20)), paid], [onSale]).run()).toBe(0);
    expect(await reminders([expired("cs_1", at(20))], [{ ...onSale, stock: "esaurito", availableQuantity: 0 }]).run()).toBe(0);
    expect(await reminders([expired("cs_1", at(20))], [onSale], new Map([[`cart-optout:${BUYER}`, { at: "2026-11-01T00:00:00.000Z" }]])).run()).toBe(0);
    expect(await reminders([{ ...expired("cs_1", at(20)), metadata: { lines: "glory-valkerion-lf x1" } }], [onSale]).run()).toBe(0);
  });

  it("stops for good on «Non ricordarmelo più»", async () => {
    const world_ = world();
    const memory = new Map<string, unknown>();
    const deps = { memory: { read: async () => memory, write: async (entries: ReadonlyMap<string, unknown>) => void entries.forEach((value, key) => memory.set(key, value)) }, now: () => world_.state.now };
    const { cartTap } = await import("@/lib/telegram/cart-reminder");
    expect(await cartTap(deps, { from: BUYER, data: "gd:c:x" })).toBe("Fatto: niente più promemoria del carrello.");
    expect(memory.has(`cart-optout:${BUYER}`)).toBe(true);
    expect(await cartTap(deps, { from: BUYER, data: "gd:x:1" })).toBeNull();
  });

  it("is in the privacy notice, with its legal basis", () => {
    const text = JSON.stringify(LEGAL_PAGES.privacy);
    expect(text).toContain("Promemoria del carrello: se apri il carrello da un link che il nostro bot Telegram ti ha mandato in chat privata");
    expect(text).toContain("sulla base del legittimo interesse (art. 6.1.f GDPR): puoi opporti in qualsiasi momento con «Non ricordarmelo più»");
  });
});

describe("the shop inside Telegram", () => {
  it("opens the site tagged as the bot's Mini App, for anyone who asks with /shop", async () => {
    expect(MINI_APP_URL).toBe("https://geardropshop.it/?utm_source=telegram&utm_medium=miniapp&utm_campaign=bot");
    const { write, sent } = world();
    expect(await write("/shop", BUYER)).toBe("shop");
    expect(sent.at(-1)!.keyboard).toEqual([[{ text: "Apri lo shop", web_app: { url: MINI_APP_URL } }]]);
  });
});
