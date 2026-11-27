/**
 * The owner's private alerts (owner, 2026-11-27): each paid order, the pieces it left low, a
 * payment Stripe took that the shop did not record, and the evening summary. Only his chat, and no
 * buyer data in them.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { processPaidCheckout, type LowStockProduct, type OrderStore } from "@/lib/orders/process-paid-checkout";
import type { PaidCheckout } from "@/lib/orders/stripe-order";
import type { TelegramGateway } from "@/lib/telegram/api";
import { handleUpdate, type NewsDeps, type NewsStore } from "@/lib/telegram/bot";
import {
  LOW_STOCK_LISTED,
  WEBHOOK_GRACE_MINUTES,
  eveningSummary,
  paidOrderAlert,
  paidWithoutOrderAlarm,
  startOfRomeDay,
  unrecordedSessions,
  type DaySummary,
} from "@/lib/telegram/owner-alerts";

const checkout: PaidCheckout = {
  sessionId: "cs_test_abcdefghij",
  paymentIntentId: "pi_1",
  reference: "GD-ABC123",
  email: "buyer@example.com",
  phone: "+39 333 0000000",
  shipping: {
    name: "Mario Rossi",
    address: "Via Roma 1",
    postalCode: "00100",
    city: "Roma",
    province: "RM",
    country: "IT",
    method: "inpost-locker",
    methodLabel: "InPost · Locker",
    pickupPoint: "ROM44128M",
  },
  notes: "citofono rotto",
  lines: [
    { slug: "glory-valkerion-lf", name: "Glory Valkerion LF", quantity: 2, unitPriceCents: 1999 },
    { slug: "deck-case", name: "Deck Case <Nero>", quantity: 1, unitPriceCents: 1800 },
  ],
  shippingCents: 490,
  discountCents: 0,
  couponCode: "BENVENUTO5",
  totalCents: 6288,
  createdAt: "2026-11-27T10:00:00.000Z",
  attribution: { source: "telegram", medium: "social" },
};

const low: LowStockProduct = { name: "Glory Valkerion LF", slug: "glory-valkerion-lf", stockQuantity: 1, stockStatus: "disponibile" };

describe("the alert for a paid order", () => {
  it("says what was bought and for how much, and what it left low", () => {
    const { text, keyboard } = paidOrderAlert(checkout, { id: 41, orderNumber: "GD-ABC123" }, [low, { ...low, name: "Deck Case", stockQuantity: 0 }]);
    expect(text.split("\n")).toEqual([
      "<b>ORDINE PAGATO //</b> GD-ABC123",
      "<b>€62,88</b> · 3 pezzi",
      "2× Glory Valkerion LF",
      "1× Deck Case &lt;Nero&gt;",
      "InPost · Locker · codice BENVENUTO5 · da telegram",
      "",
      "<b>Scorte basse</b>",
      "Glory Valkerion LF: ne restano 1",
      "Deck Case: esaurito",
    ]);
    expect(keyboard).toEqual([[{ text: "Apri l'ordine", url: expect.stringMatching(/\/admin\/ordini\/41$/) }]]);
  });

  it("carries no buyer data: Telegram never receives them", () => {
    const { text } = paidOrderAlert(checkout, { id: 41, orderNumber: "GD-ABC123" }, []);
    for (const personal of ["buyer@example.com", "Mario", "Rossi", "Via Roma", "00100", "Roma", "333", "citofono", "ROM44128M"]) expect(text).not.toContain(personal);
  });

  it("goes once, when the payment creates the order, and never fails it", async () => {
    const created = new Set<string>();
    const store: OrderStore = {
      record: async (value) => {
        const fresh = !created.has(value.sessionId);
        created.add(value.sessionId);
        return { id: 41, orderNumber: value.reference, created: fresh };
      },
      ownerNotified: async () => false,
      markOwnerNotified: async () => {},
      lowStock: async () => [low],
    };
    const alertOwner = vi.fn();
    const deps = { loadCheckout: async () => checkout, store, sendEmail: async () => ({ ok: true as const, id: "e" }), env: {}, alertOwner };
    await processPaidCheckout(checkout.sessionId, deps);
    await processPaidCheckout(checkout.sessionId, deps);
    expect(alertOwner).toHaveBeenCalledTimes(1);
    expect(alertOwner).toHaveBeenCalledWith(checkout, expect.objectContaining({ id: 41, created: true }), [low]);

    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failing = { ...deps, store: { ...store, record: async () => ({ id: 42, orderNumber: "GD-X", created: true }) }, alertOwner: async () => { throw new Error("Telegram down"); } };
    expect(await processPaidCheckout(checkout.sessionId, failing)).toMatchObject({ status: "recorded", ownerEmail: "sent" });
    expect(errors).toHaveBeenCalledWith("[orders] owner alert not sent:", "Telegram down");
    errors.mockRestore();
  });

  it("raises the alarm with the Stripe session to look up", () => {
    const text = paidWithoutOrderAlarm(["cs_live_abcdefghijkl"]);
    expect(text).toContain("<b>ALLARME //</b> Stripe ha incassato ma l'ordine non è nel gestionale.");
    expect(text).toContain("Sessione cs_live_abcdefghijkl");
  });
});

const day = (overrides: Partial<DaySummary> = {}): DaySummary => ({
  day: new Date("2026-11-27T20:00:00.000Z"),
  orders: { count: 0, totalCents: 0, pieces: 0 },
  toShip: 0,
  lowStock: [],
  preordersAwaitingPayment: 0,
  restockWaiting: 0,
  unrecorded: [],
  ...overrides,
});

describe("the evening summary", () => {
  it("is short on a quiet day", () => {
    expect(eveningSummary(day()).text.split("\n")).toEqual(["<b>RIEPILOGO //</b> venerdì 27 novembre", "Nessun ordine oggi.", "Stripe: ogni pagamento ha il suo ordine."]);
  });

  it("lists the day, what waits and the low pieces, a few by name", () => {
    const many = Array.from({ length: LOW_STOCK_LISTED + 2 }, (_, index) => ({ ...low, name: `Pezzo ${index + 1}` }));
    const lines = eveningSummary(day({ orders: { count: 3, totalCents: 12_480, pieces: 5 }, toShip: 4, preordersAwaitingPayment: 2, restockWaiting: 17, lowStock: many })).text.split("\n");
    expect(lines.slice(0, 5)).toEqual([
      "<b>RIEPILOGO //</b> venerdì 27 novembre",
      "3 ordini · <b>€124,80</b> · 5 pezzi",
      "Ordini pagati non spediti: 4",
      "Pre-ordini Telegram da pagare: 2",
      "Avvisami in attesa: 17",
    ]);
    expect(lines).toContain(`Pezzo ${LOW_STOCK_LISTED}: ne restano 1`);
    expect(lines).not.toContain(`Pezzo ${LOW_STOCK_LISTED + 1}: ne restano 1`);
    expect(lines).toContain("e altri 2");
  });

  it("names every paid checkout without an order, and says when the check could not run", () => {
    expect(eveningSummary(day({ unrecorded: ["cs_live_1", "cs_live_2"] })).text).toContain("<b>Pagati su Stripe senza ordine: 2</b>\ncs_live_1\ncs_live_2");
    expect(eveningSummary(day({ unrecorded: null })).text).toContain("Controllo Stripe non riuscito stasera: guardalo domattina.");
  });

  it("counts the day from midnight in Rome, winter and summer", () => {
    expect(startOfRomeDay(new Date("2026-11-27T20:00:00.000Z")).toISOString()).toBe("2026-11-26T23:00:00.000Z");
    expect(startOfRomeDay(new Date("2026-11-27T23:30:00.000Z")).toISOString()).toBe("2026-11-27T23:00:00.000Z");
    expect(startOfRomeDay(new Date("2026-07-10T20:00:00.000Z")).toISOString()).toBe("2026-07-09T22:00:00.000Z");
  });

  it("finds the shop's paid checkouts that have no order once the webhook had its time", () => {
    const now = new Date("2026-11-27T20:00:00.000Z");
    const at = (minutesAgo: number) => Math.floor(now.getTime() / 1000) - minutesAgo * 60;
    const shop = { status: "complete", payment_status: "paid", metadata: { order_ref: "GD-1" } };
    const sessions = [
      { id: "cs_missing", created: at(60), ...shop },
      { id: "cs_recorded", created: at(60), ...shop },
      { id: "cs_just_paid", created: at(WEBHOOK_GRACE_MINUTES - 1), ...shop },
      { id: "cs_unpaid", created: at(60), ...shop, payment_status: "unpaid" },
      { id: "cs_not_the_shop", created: at(60), status: "complete", payment_status: "paid", metadata: {} },
    ];
    expect(unrecordedSessions(sessions, new Set(["cs_recorded"]), now)).toEqual(["cs_missing"]);
  });

  it("runs at 20:00 UTC every day", () => {
    const config = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as { crons: { path: string; schedule: string }[] };
    expect(config.crons).toContainEqual({ path: "/api/cron/telegram-summary", schedule: "0 20 * * *" });
  });
});

describe("/riepilogo in the bot", () => {
  const OWNER = "111222333";
  function world() {
    const sent: { chatId: string; text: string }[] = [];
    const telegram: TelegramGateway = {
      sendPost: async () => 1,
      sendText: async (chatId, text) => {
        sent.push({ chatId, text });
        return 1;
      },
      setKeyboard: async () => true,
      deleteMessage: async () => true,
      answerInline: async () => true,
      sendPoll: async () => null,
      stopPoll: async () => null,
      answerCallback: async () => {},
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
    const summary = vi.fn(async () => eveningSummary(day()));
    const deps: NewsDeps = {
      store,
      telegram,
      ownerChatId: OWNER,
      channelId: "@geardropshop",
      now: () => new Date("2026-11-27T20:00:00.000Z"),
      loadProducts: async () => [],
      loadMetaMonths: async () => [],
      loadMeta: async () => null,
      summary,
    };
    const write = (text: string, from: string) => handleUpdate({ message: { chat: { id: Number(from), type: "private" }, from: { id: Number(from) }, text } }, deps);
    return { sent, summary, write };
  }

  it("sends the owner the summary on demand", async () => {
    const { sent, write } = world();
    expect(await write("/riepilogo", OWNER)).toBe("summary");
    expect(sent.at(-1)).toEqual({ chatId: OWNER, text: expect.stringContaining("<b>RIEPILOGO //</b>") });
  });

  it("never shows it to anyone else", async () => {
    const { sent, summary, write } = world();
    expect(await write("/riepilogo", "444555666")).toBe("stranger");
    expect(summary).not.toHaveBeenCalled();
    expect(sent.every((message) => !message.text.includes("RIEPILOGO"))).toBe(true);
  });
});
