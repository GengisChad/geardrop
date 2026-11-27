/**
 * «Segui su Telegram» (owner, 2026-11-27): a signed link in the order's emails opens the bot with
 * the order; the bot writes in that chat when the parcel leaves, at InPost's real steps and at
 * delivery, then forgets the chat.
 */
import { describe, expect, it } from "vitest";
import { LEGAL_PAGES } from "@/data/pages";
import { customerOrderEmail } from "@/lib/orders/order-email";
import { shippingNotificationEmail } from "@/lib/orders/shipping-email";
import type { PaidCheckout } from "@/lib/orders/stripe-order";
import type { TelegramGateway } from "@/lib/telegram/api";
import { handleUpdate, type NewsDeps, type NewsStore } from "@/lib/telegram/bot";
import type { InlineKeyboard } from "@/lib/telegram/messages";
import {
  FOLLOW_KEEP_DAYS,
  followTap,
  orderFollowPayload,
  orderFollowUrl,
  orderFromFollowStart,
  startFollow,
  tellFollowers,
  type FollowContext,
  type FollowedOrder,
  type Follower,
  type FollowStore,
} from "@/lib/telegram/order-follow";

const SECRET = "test-webhook-secret-0123456789";
const BUYER = "444555666";

function world(status = "confirmed") {
  const state = { now: new Date("2026-11-27T10:00:00.000Z") };
  const order: { current: FollowedOrder } = {
    current: { id: 41, orderNumber: "GD-ABC123", status, carrier: "InPost", trackingCode: "520000011395200025754311", trackingUrl: "https://inpost.it/trova-il-tuo-pacco?number=520000011395200025754311" },
  };
  const rows: (Follower & { orderId: number; createdAt: number })[] = [];
  const sent: { chatId: string; text: string; keyboard?: InlineKeyboard | undefined }[] = [];
  let nextId = 0;
  const store: FollowStore = {
    loadOrder: async (id) => (id === order.current.id ? order.current : null),
    follow: async (orderId, chatId, told) => {
      const existing = rows.find((row) => row.orderId === orderId && row.chatId === chatId);
      if (existing) return existing.id;
      rows.push({ id: (nextId += 1), orderId, chatId, lastTold: told, createdAt: state.now.getTime() });
      return nextId;
    },
    unfollow: async (id, chatId) => {
      const index = rows.findIndex((row) => row.id === id && row.chatId === chatId);
      if (index < 0) return false;
      rows.splice(index, 1);
      return true;
    },
    followers: async (orderId) => rows.filter((row) => row.orderId === orderId),
    told: async (id, what) => {
      const row = rows.find((item) => item.id === id);
      if (row) rows[rows.indexOf(row)] = { ...row, lastTold: what };
    },
    forgetOrder: async (orderId) => {
      for (const row of rows.filter((item) => item.orderId === orderId)) rows.splice(rows.indexOf(row), 1);
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
    sendPoll: async () => null,
    stopPoll: async () => null,
    answerCallback: async () => {},
  };
  const context: FollowContext = { telegram, store, now: () => state.now, secret: SECRET };
  const start = `/start ${orderFollowPayload(41, SECRET)}`;
  return { state, order, rows, sent, context, start };
}

describe("the order's link", () => {
  it("is signed, fits Telegram's start payload, and only the server's signature opens it", () => {
    const payload = orderFollowPayload(41, SECRET);
    expect(payload).toMatch(/^or-41-[A-Za-z0-9_-]{16}$/);
    expect(payload.length).toBeLessThanOrEqual(64);
    expect(orderFromFollowStart(`/start ${payload}`, SECRET)).toBe(41);
    expect(orderFromFollowStart(`/start ${payload.replace("or-41-", "or-42-")}`, SECRET)).toBeNull();
    expect(orderFromFollowStart(`/start ${payload}`, "another-secret")).toBeNull();
    expect(orderFromFollowStart(`/start ${payload}`, null)).toBeNull();
  });

  it("goes in the emails only when the bot is set up", () => {
    expect(orderFollowUrl(41, {})).toBeNull();
    expect(orderFollowUrl(41, { TELEGRAM_WEBHOOK_SECRET: SECRET, TELEGRAM_BOT_TOKEN: "123456:abc" })).toBe(`https://t.me/GearDropNewsBot?start=${orderFollowPayload(41, SECRET)}`);
  });
});

describe("following an order", () => {
  it("keeps the chat on the order and says where it stands, with a way out", async () => {
    const { context, rows, sent, start } = world();
    expect(await startFollow(context, BUYER, start)).toBe("follow");
    expect(rows).toEqual([expect.objectContaining({ orderId: 41, chatId: BUYER, lastTold: "confirmed" })]);
    expect(sent.at(-1)!.text).toBe("<b>ORDINE GD-ABC123 //</b>\nPagato: lo stiamo preparando. Ti scrivo qui quando parte.");
    expect(sent.at(-1)!.keyboard).toEqual([
      [{ text: "Traccia il pacco", url: expect.stringContaining("inpost.it") }],
      [{ text: "Non seguire più", callback_data: "gd:f:x:1" }],
    ]);
    await startFollow(context, BUYER, start);
    expect(rows).toHaveLength(1);
  });

  it("refuses a link that is not signed by the shop, and keeps nothing", async () => {
    const { context, rows, sent } = world();
    await startFollow(context, BUYER, "/start or-41-AAAAAAAAAAAAAAAA");
    expect(rows).toEqual([]);
    expect(sent.at(-1)!.text).toBe("Questo link non è valido. Apri quello nell'email dell'ordine.");
  });

  it("keeps nothing for an order already delivered", async () => {
    const { context, rows, sent, start } = world("completed");
    await startFollow(context, BUYER, start);
    expect(rows).toEqual([]);
    expect(sent.at(-1)!.text).toContain("Consegnato.");
  });

  it("lets only the chat that follows stop", async () => {
    const { context, rows, start } = world();
    await startFollow(context, BUYER, start);
    expect(await followTap(context, { from: "111222333", data: "gd:f:x:1" })).toBe("Già fatto.");
    expect(rows).toHaveLength(1);
    expect(await followTap(context, { from: BUYER, data: "gd:f:x:1" })).toBe("Non ti scrivo più per questo ordine.");
    expect(rows).toEqual([]);
    expect(await followTap(context, { from: BUYER, data: "gd:a:x:1" })).toBeNull();
  });
});

describe("telling the chat", () => {
  it("says it shipped once, then InPost's real steps once each, then delivery, and forgets the chat", async () => {
    const { context, order, rows, sent, start } = world();
    await startFollow(context, BUYER, start);
    order.current = { ...order.current, status: "shipped" };
    expect(await tellFollowers(context, 41, { kind: "shipped" })).toBe(1);
    expect(sent.at(-1)!.text).toContain("Spedito con InPost.\nTracking: 520000011395200025754311");
    expect(await tellFollowers(context, 41, { kind: "shipped" })).toBe(0);

    expect(await tellFollowers(context, 41, { kind: "inpost", code: "MMD.1002" })).toBe(0);
    expect(await tellFollowers(context, 41, { kind: "inpost", code: "LMD.1005" })).toBe(1);
    expect(sent.at(-1)!.text).toBe("<b>ORDINE GD-ABC123 //</b>\nPronta per il ritiro nel Locker.");
    expect(await tellFollowers(context, 41, { kind: "inpost", code: "LMD.1005" })).toBe(0);

    expect(await tellFollowers(context, 41, { kind: "delivered" })).toBe(1);
    expect(sent.at(-1)!.text).toContain("Consegnato. Buone battaglie!");
    expect(rows).toEqual([]);
  });

  it("forgets a chat after the days the privacy notice says", async () => {
    const { context, state, rows, start } = world();
    await startFollow(context, BUYER, start);
    state.now = new Date(state.now.getTime() + (FOLLOW_KEEP_DAYS + 1) * 86_400_000);
    expect(await tellFollowers(context, 41, { kind: "shipped" })).toBe(0);
    expect(rows).toEqual([]);
  });

  it("opens from the email's link through the bot", async () => {
    const { context, rows, start } = world();
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
      telegram: context.telegram,
      ownerChatId: "111222333",
      channelId: "@geardropshop",
      now: context.now,
      loadProducts: async () => [],
      loadMetaMonths: async () => [],
      loadMeta: async () => null,
      follows: context,
    };
    expect(await handleUpdate({ message: { chat: { id: Number(BUYER), type: "private" }, from: { id: Number(BUYER) }, text: start } }, deps)).toBe("follow");
    expect(rows).toHaveLength(1);
    expect(await handleUpdate({ callback_query: { id: "cb", from: { id: Number(BUYER) }, data: "gd:f:x:1" } }, deps)).toBe("follow");
    expect(rows).toEqual([]);
  });
});

describe("the emails and the privacy notice", () => {
  const url = "https://t.me/GearDropNewsBot?start=or-41-AAAAAAAAAAAAAAAA";

  it("puts «Segui su Telegram» in the confirmation and in the shipping email", () => {
    const checkout = {
      sessionId: "cs_test_abcdefghij", paymentIntentId: null, reference: "GD-ABC123", email: "buyer@example.com", phone: null,
      shipping: { name: "Mario Rossi", address: "Via Roma 1", postalCode: "00100", city: "Roma", province: "RM", country: "IT" },
      notes: null, lines: [{ slug: "glory-valkerion-lf", name: "Glory Valkerion LF", quantity: 1, unitPriceCents: 1999 }],
      shippingCents: 490, discountCents: 0, couponCode: null, totalCents: 2489, createdAt: "2026-11-27T10:00:00.000Z",
    } satisfies PaidCheckout;
    const confirmation = customerOrderEmail(checkout, { id: 41, orderNumber: "GD-ABC123", created: true }, url);
    expect(confirmation.html).toContain(`href="${url}"`);
    expect(confirmation.html).toContain("Segui su Telegram");
    expect(confirmation.text).toContain(`Segui l'ordine su Telegram: ${url}`);
    expect(customerOrderEmail(checkout, { id: 41, orderNumber: "GD-ABC123", created: true }).html).not.toContain("Segui su Telegram");

    const shipped = shippingNotificationEmail({ orderNumber: "GD-ABC123", email: "buyer@example.com", carrier: "InPost", trackingCode: "5200", trackingUrl: null, shippingAddress: {}, items: [], followUrl: url });
    expect(shipped.html).toContain(`href="${url}"`);
    expect(shipped.text).toContain(`Segui su Telegram: ${url}`);
  });

  it("says what is kept and for how long", () => {
    const body = (heading: string) => LEGAL_PAGES.privacy.sections.find((section) => section.heading === heading)!.body.join(" ");
    expect(body("Quali dati trattiamo")).toContain("Ordine seguito su Telegram: se tocchi «Segui su Telegram» in un'email del tuo ordine, il tuo identificativo Telegram collegato a quell'ordine");
    expect(body("Per quanto tempo")).toContain("si cancella alla consegna, quando tocchi «Non seguire più» o comunque dopo 90 giorni.");
    expect(FOLLOW_KEEP_DAYS).toBe(90);
  });
});
