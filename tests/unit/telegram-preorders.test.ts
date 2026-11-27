import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/data/catalog";
import { applyLiveStock } from "@/lib/commerce/live-stock-overlay";
import { createMockProvider } from "@/lib/commerce/mock-provider";
import type { Product } from "@/lib/commerce/types";
import { PREORDER_DELIVERY } from "@/lib/labels";
import type { TelegramGateway } from "@/lib/telegram/api";
import { handleUpdate, scanNews, type DraftStatus, type NewsDeps, type NewsStore } from "@/lib/telegram/bot";
import { channelPreorderPost, draftKeyboard, parseDraftAction, productPost, type InlineKeyboard } from "@/lib/telegram/messages";
import { scanProducts } from "@/lib/telegram/news";
import {
  newPreorderCode,
  parseBuyerName,
  parseEmail,
  parsePhone,
  parsePostalCode,
  paypalMeUrl,
  preorderFromCartLink,
  preorderTotals,
  slugFromStart,
  startPayload,
  type PaymentMode,
} from "@/lib/telegram/preorder-rules";
import { parsePreorderAction, type Preorder, type PreorderStatus, type PreorderStore } from "@/lib/telegram/preorders";

const OWNER = "111222333";
const BUYER = "444555666";
const SLUG = "soar-phoenix-9-60gf-solo-trottola";
const base = PRODUCTS.find((product) => product.slug === SLUG)!;

/** A piece loaded in the catalogue for a Telegram pre-order: `left` pieces, not in the shop yet. */
function hidden(left: number, amount = 2000): Product {
  return { ...base, price: { amount, currency: "EUR" }, stock: left > 0 ? "pre-ordine" : "esaurito", availableQuantity: left, channelOnly: true };
}

describe("a product kept out of the shop until it arrives", () => {
  const catalogued: Product = { ...base, stock: "pre-ordine", channelOnly: true };
  const row = { slug: SLUG, stock_status: "pre-ordine" as const, stock_quantity: 0, preorder_allocation: 30, availability_override: "preorder", price_cents: 2000 };

  it("stays hidden while the back office holds it as a pre-order", () => {
    const [live] = applyLiveStock([catalogued], [row]);
    expect(live).toMatchObject({ channelOnly: true, stock: "pre-ordine", availableQuantity: 30 });
  });

  it("shows up by itself once its pieces are on the shelf", () => {
    const [live] = applyLiveStock([catalogued], [{ ...row, stock_status: "disponibile", stock_quantity: 20, preorder_allocation: 0, availability_override: null }]);
    expect(live!.channelOnly).toBeUndefined();
    expect(live).toMatchObject({ stock: "disponibile", availableQuantity: 20 });
  });

  it("stays hidden when the database does not know it yet", () => {
    expect(applyLiveStock([catalogued], [])[0]!.channelOnly).toBe(true);
  });

  it("is in no list, search or filter of the shop, but its own link and the cart still find it", async () => {
    const other = PRODUCTS.find((product) => product.slug !== SLUG && !product.variant)!;
    const provider = createMockProvider([hidden(30), other]);
    expect((await provider.listProducts({ perPage: 100 })).items.map((product) => product.slug)).toEqual([other.slug]);
    expect((await provider.listProducts({ search: "Soar Phoenix" })).total).toBe(0);
    expect((await provider.getFacets()).total).toBe(1);
    expect((await provider.getProduct(SLUG))?.channelOnly).toBe(true);
    const quote = await provider.quoteCart({ lines: [{ slug: base.slug, quantity: 1 }] });
    expect(quote.lines[0]).toMatchObject({ slug: SLUG, unitPrice: { amount: 2000 }, issue: null });
  });
});

describe("what the bot makes of a Telegram pre-order", () => {
  const NOW = new Date("2026-11-26T09:00:00.000Z");
  const other = PRODUCTS.find((product) => product.slug !== SLUG && !product.variant)!;
  const seen = new Map(scanProducts(new Map(), [other], NOW, true).memory);

  it("announces the pre-order on the channel, not a new product of the shop", () => {
    const scan = scanProducts(seen, [other, hidden(30)], NOW);
    expect(scan.events).toEqual([{ eventKey: `preorder:${SLUG}:2026-11-26`, payload: { kind: "channel_preorder", slugs: [SLUG] } }]);
    expect(scan.memory.get(SLUG)).toMatchObject({ stock: "pre-ordine", channelOnly: true });
  });

  it("announces the arrival when the pieces reach the shelf", () => {
    const withPreorder = new Map([...seen, ...scanProducts(seen, [other, hidden(30)], NOW).memory]);
    const landed: Product = { ...base, price: { amount: 2000, currency: "EUR" }, stock: "disponibile", availableQuantity: 20 };
    const scan = scanProducts(withPreorder, [other, landed], NOW);
    expect(scan.events).toEqual([{ eventKey: `new:${SLUG}`, payload: { kind: "new_product", slugs: [SLUG] } }]);
    expect(scan.memory.get(SLUG)?.channelOnly).toBeUndefined();
  });

  it("says nothing when the pre-order sells out, and announces it again if pieces are added", () => {
    const withPreorder = new Map([...seen, ...scanProducts(seen, [other, hidden(30)], NOW).memory]);
    const soldOut = scanProducts(withPreorder, [other, hidden(0)], NOW);
    expect(soldOut.events).toEqual([]);
    const reopened = scanProducts(new Map([...withPreorder, ...soldOut.memory]), [other, hidden(5)], NOW);
    expect(reopened.events.map((event) => event.payload.kind)).toEqual(["channel_preorder"]);
  });

  it("writes the post with the pieces left, the wait and one button that opens the bot", () => {
    const result = channelPreorderPost({ slugs: [SLUG] }, [hidden(30)], "GearDropNewsBot");
    if (!result.ok) throw new Error(result.reason);
    expect(result.post.text.split("\n")).toEqual([
      "PRE-ORDINE // solo sul canale",
      "<b>Soar Phoenix 9-60GF solo trottola</b>",
      "<b>€20,00</b> · 30 pezzi",
      PREORDER_DELIVERY,
      "Si prenota e si paga qui. Sul sito arriva quando è in magazzino.",
    ]);
    expect(result.post.link).toEqual({ label: "Pre-ordina", url: `https://t.me/GearDropNewsBot?start=pre-${SLUG}` });
  });

  it("refuses the post once the pieces are gone or the product is in the shop", () => {
    expect(channelPreorderPost({ slugs: [SLUG] }, [hidden(0)], "Bot")).toEqual({ ok: false, reason: "i pezzi di Soar Phoenix 9-60GF solo trottola sono finiti" });
    expect(channelPreorderPost({ slugs: [SLUG] }, [{ ...base, stock: "disponibile" }], "Bot")).toEqual({
      ok: false,
      reason: "Soar Phoenix 9-60GF solo trottola è già in vendita sul sito",
    });
    // And a post that would send the reader to the shop never names a piece that is not there.
    expect(productPost({ kind: "new_product", slugs: [SLUG] }, [hidden(30)])).toEqual({
      ok: false,
      reason: "Soar Phoenix 9-60GF solo trottola non è ancora in vendita sul sito",
    });
  });
});

describe("the rules of a pre-order", () => {
  it("adds the Locker to the pieces, and ships free from 100 euro", () => {
    expect(preorderTotals(hidden(30), 2)).toEqual({ unitCents: 2000, shippingCents: 490, totalCents: 4490, shippingLabel: "InPost · Locker" });
    expect(preorderTotals(hidden(30, 5000), 2)).toMatchObject({ shippingCents: 0, totalCents: 10000 });
  });

  it("leaves a piece that does not go to a Locker to the site's checkout", () => {
    const stadium = PRODUCTS.find((product) => product.category === "stadi");
    if (stadium) expect(preorderTotals({ ...stadium, channelOnly: true }, 1)).toBeNull();
  });

  it("asks PayPal for the exact amount", () => {
    expect(paypalMeUrl("geardrop", 4490)).toBe("https://paypal.me/geardrop/44.90EUR");
  });

  it("makes codes a buyer can copy without mistaking a letter", () => {
    expect(newPreorderCode(() => 0)).toBe("GDT-AAAAAA");
    expect(newPreorderCode()).toMatch(/^GDT-[A-HJKMNP-Z2-9]{6}$/);
  });

  it("carries the product in the button and reads it back", () => {
    expect(startPayload(SLUG)).toBe(`pre-${SLUG}`);
    expect(startPayload("x".repeat(70))).toBeNull();
    expect(slugFromStart(`/start pre-${SLUG}`)).toBe(SLUG);
    expect(slugFromStart("/start")).toBeNull();
    expect(slugFromStart("/start pre-../../etc")).toBeNull();
  });

  it("reads the cart link the bot hands out, and nothing that is not shaped like one", () => {
    expect(preorderFromCartLink(`?preordine=${SLUG}&q=2&utm_source=telegram`)).toEqual({ slug: SLUG, quantity: 2 });
    expect(preorderFromCartLink(`?preordine=${SLUG}`)).toEqual({ slug: SLUG, quantity: 1 });
    expect(preorderFromCartLink(`?preordine=${SLUG}&q=99`)).toEqual({ slug: SLUG, quantity: 3 });
    expect(preorderFromCartLink(`?preordine=${SLUG}&q=abc`)).toEqual({ slug: SLUG, quantity: 1 });
    expect(preorderFromCartLink("?preordine=<script>")).toBeNull();
    expect(preorderFromCartLink("?iscriviti=1")).toBeNull();
  });

  it("accepts what a Locker parcel needs and nothing shaped otherwise", () => {
    expect(parseBuyerName("  mario   rossi ")).toBe("mario rossi");
    expect(parseBuyerName("Mario")).toBeNull();
    expect(parseBuyerName("<b>Mario</b> Rossi")).toBeNull();
    expect(parseEmail(" Mario@Example.IT ")).toBe("mario@example.it");
    expect(parseEmail("mario@")).toBeNull();
    expect(parsePhone("333 123 4567")).toBe("+393331234567");
    expect(parsePhone("+39 333.1234567")).toBe("+393331234567");
    expect(parsePhone("06 1234567")).toBeNull();
    expect(parsePostalCode(" 00185 ")).toBe("00185");
    expect(parsePostalCode("185")).toBeNull();
  });

  it("reads back only its own buttons", () => {
    expect(parsePreorderAction("gd:o:12:q:2")).toEqual({ id: 12, verb: "q", argument: 2 });
    expect(parsePreorderAction("gd:o:12:paid")).toEqual({ id: 12, verb: "paid", argument: null });
    expect(parsePreorderAction("gd:p:12")).toBeNull();
    expect(parsePreorderAction("gd:o:12:refund")).toBeNull();
  });
});

// --- The conversation, against a shop and a Telegram kept in memory ------------------------------

type Sent = { chatId: string; text: string; keyboard?: InlineKeyboard | undefined };

function world(
  options: { left?: number; paypal?: string | null; mode?: PaymentMode; draft?: boolean; fixed?: PaymentMode; orders?: "work" | "fail" | "none" } = {},
) {
  const state = { left: options.left ?? 30, now: new Date("2026-11-26T09:00:00.000Z"), lockersDown: false };
  const rows: Preorder[] = [];
  const sent: Sent[] = [];
  const answers: string[] = [];
  const cleared: number[] = [];
  const keyboards: { messageId: number; keyboard: InlineKeyboard }[] = [];
  const recorded: number[] = [];
  const orderAttempts: number[] = [];
  // When each reservation was last written, as the table's updated_at.
  const touched = new Map<number, number>();
  const modes = new Map<string, PaymentMode>(options.mode ? [[SLUG, options.mode]] : []);
  let nextMessage = 900;

  const telegram: TelegramGateway = {
    sendPost: async (chatId, post, keyboard) => {
      sent.push({ chatId, text: post.text, keyboard });
      return (nextMessage += 1);
    },
    sendText: async (chatId, html, keyboard) => {
      sent.push({ chatId, text: html, keyboard });
      return (nextMessage += 1);
    },
    setKeyboard: async (_chatId, messageId, keyboard) => {
      keyboards.push({ messageId, keyboard });
      cleared.push(messageId);
      return true;
    },
    deleteMessage: async () => true,
    answerCallback: async (_id, text) => {
      answers.push(text);
    },
  };

  const patchRow = (id: number, patch: Partial<Preorder>) => {
    const index = rows.findIndex((row) => row.id === id);
    rows[index] = { ...rows[index]!, ...patch };
    touched.set(id, state.now.getTime());
  };
  const store: PreorderStore = {
    open: async (input) => {
      for (const row of rows) if (row.chatId === input.chatId && row.status === "collecting") patchRow(row.id, { status: "cancelled" });
      const row: Preorder = {
        id: rows.length + 1, code: input.code, chatId: input.chatId, username: input.username, slug: input.slug, productName: input.productName,
        quantity: 1, unitCents: 0, shippingCents: 0, totalCents: 0, buyerName: null, email: null, phone: null, locker: null, lockerOptions: [],
        status: "collecting", step: "quantity", expiresAt: null, orderId: null,
      };
      rows.push(row);
      touched.set(row.id, state.now.getTime());
      return row;
    },
    get: async (id) => rows.find((row) => row.id === id) ?? null,
    collecting: async (chatId) => rows.findLast((row) => row.chatId === chatId && row.status === "collecting") ?? null,
    update: async (id, patch) => patchRow(id, patch),
    move: async (id, from, to, patch = {}) => {
      if (rows.find((row) => row.id === id)?.status !== from) return false;
      patchRow(id, { ...patch, status: to });
      return true;
    },
    // What telegram_preorder_hold does: the one count of pieces, never below zero.
    hold: async (_slug, quantity) => {
      if (state.left - quantity < 0) return null;
      state.left -= quantity;
      return state.left;
    },
    overdue: async (now) => rows.filter((row) => row.status === "awaiting_payment" && row.expiresAt !== null && Date.parse(row.expiresAt) < now.getTime()),
    list: async (statuses) => rows.filter((row) => (statuses as readonly PreorderStatus[]).includes(row.status)),
    // What the table's forget does: unpaid reservations lose their buyer, a half-filled one is closed.
    forget: async (before) => {
      let stripped = 0;
      for (const row of [...rows]) {
        const unpaid = row.status === "collecting" || row.status === "cancelled" || row.status === "expired";
        if (!unpaid || row.chatId === "0" || (touched.get(row.id) ?? 0) >= before.getTime()) continue;
        patchRow(row.id, { chatId: "0", username: null, buyerName: null, email: null, phone: null, locker: null, lockerOptions: [], status: row.status === "collecting" ? "cancelled" : row.status });
        stripped += 1;
      }
      return stripped;
    },
    paymentMode: async (slug) => modes.get(slug) ?? null,
    setPaymentMode: async (slug, mode) => {
      modes.set(slug, mode);
    },
  };

  // With `draft`, the bot has one pre-order waiting to be shown to the owner and published.
  const draft = { id: 1, payload: { kind: "channel_preorder" as const, slugs: [SLUG] } };
  const drafted = { status: (options.draft ? "draft" : "discarded") as DraftStatus, ownerMessageId: null as number | null };
  const news: NewsStore = {
    readMemory: async () => new Map<string, unknown>([["products", {}], ["meta", { months: [] }]]),
    writeMemory: async () => {},
    addDrafts: async () => 0,
    unsentDrafts: async () => (drafted.status === "draft" && drafted.ownerMessageId === null ? [{ ...draft, ...drafted }] : []),
    claimSending: async () => drafted.status === "draft",
    markSent: async (_id, messageId) => {
      drafted.ownerMessageId = messageId;
    },
    forgetSent: async () => 0,
    claimDecision: async () => {
      if (drafted.status !== "draft") return null;
      drafted.status = "publishing";
      return { ...draft, ...drafted };
    },
    finish: async (_id, status) => {
      drafted.status = status;
    },
  };

  const deps: NewsDeps = {
    store: news,
    telegram,
    ownerChatId: OWNER,
    channelId: "@geardropnews",
    now: () => state.now,
    // `fixed`: the catalogue says how this pre-order is paid (Product.channelPayment).
    loadProducts: async () => [{ ...hidden(state.left), ...(options.fixed ? { channelPayment: options.fixed } : {}) }],
    loadMetaMonths: async () => [],
    loadMeta: async () => null,
    preorders: {
      store,
      botUsername: async () => "GearDropNewsBot",
      paypalHandle: options.paypal === undefined ? "geardrop" : options.paypal,
      // What record_telegram_preorder_order does: one order per paid reservation, the same one when asked again.
      ...(options.orders === "none"
        ? {}
        : {
            recordOrder: async (paid: Preorder) => {
              if (options.orders === "fail" && orderAttempts.push(paid.id) <= 1) throw new Error("database unreachable");
              const row = rows.find((candidate) => candidate.id === paid.id)!;
              if (row.status !== "paid") throw new Error("GD_TELEGRAM_ORDER_NOT_PAID");
              const created = row.orderId === null;
              if (created) patchRow(row.id, { orderId: 9000 + row.id });
              recorded.push(paid.id);
              return { orderNumber: `GD-T${row.code.slice(4)}`, created };
            },
          }),
      newCode: () => "GDT-7K3Q9A",
      searchLockers: async (postalCode) => {
        if (state.lockersDown) throw new Error("inpost down");
        return postalCode === "00185" ? [{ id: "IT-ROM-1", label: "ROM01 · Via Marsala 29, 00185 Roma" }, { id: "IT-ROM-2", label: "ROM02 · Via Giolitti 2, 00185 Roma" }] : [];
      },
    },
  };

  const write = (text: string, from = BUYER) => handleUpdate({ message: { chat: { id: Number(from), type: "private" }, from: { id: Number(from), username: "blader_mario" }, text } }, deps);
  const tap = (data: string, from = BUYER) => handleUpdate({ callback_query: { id: "cb", from: { id: Number(from) }, data, message: { message_id: 77 } } }, deps);
  const last = (chatId: string) => sent.findLast((message) => message.chatId === chatId)!;
  /** Walks a buyer from the channel's button to a reservation waiting for its PayPal.me payment. */
  const reserve = async (quantity = 2) => {
    await write(`/start pre-${SLUG}`);
    const id = rows.length;
    await tap(`gd:o:${id}:q:${quantity}`);
    await tap(`gd:o:${id}:pp`);
    await write("Mario Rossi");
    await write("mario@example.it");
    await write("333 1234567");
    await write("00185");
    await tap(`gd:o:${id}:k:0`);
    await tap(`gd:o:${id}:ok`);
    return id;
  };
  return { state, rows, sent, answers, cleared, keyboards, recorded, modes, drafted, deps, store, write, tap, last, reserve };
}

describe("pre-ordering in the bot's chat", () => {
  it("opens from the channel's button with the pieces left and how many one buyer may take", async () => {
    const { write, last, rows } = world({ left: 2 });
    expect(await write(`/start pre-${SLUG}`)).toBe("preorder-start");
    expect(last(BUYER).text).toContain("<b>€20,00</b> · 2 pezzi rimasti");
    expect(last(BUYER).keyboard?.[0]).toEqual([
      { text: "1", callback_data: "gd:o:1:q:1" },
      { text: "2", callback_data: "gd:o:1:q:2" },
    ]);
    expect(rows[0]).toMatchObject({ chatId: BUYER, username: "blader_mario", status: "collecting", step: "quantity" });
  });

  it("says so when the pre-order is closed", async () => {
    const { write, last, rows } = world({ left: 0 });
    expect(await write(`/start pre-${SLUG}`)).toBe("preorder-closed");
    expect(last(BUYER).text).toContain("non è aperto");
    expect(rows).toEqual([]);
  });

  it("offers PayPal.me and the site's checkout, with the shipping already in the total", async () => {
    const { write, tap, last } = world();
    await write(`/start pre-${SLUG}`);
    await tap("gd:o:1:q:2");
    expect(last(BUYER).text).toBe(
      "2 × Soar Phoenix 9-60GF solo trottola: <b>€40,00</b>\nSpedizione InPost Locker: €4,90\nTotale: <b>€44,90</b>\n\nCome vuoi pagare?",
    );
    expect(last(BUYER).keyboard?.map((row) => row[0]!.text)).toEqual(["PayPal.me", "Carta, PayPal o Revolut sul sito", "Annulla"]);
  });

  it("offers only the site's checkout while no PayPal.me name is set", async () => {
    const { write, tap, last } = world({ paypal: null });
    await write(`/start pre-${SLUG}`);
    await tap("gd:o:1:q:1");
    expect(last(BUYER).keyboard?.map((row) => row[0]!.text)).toEqual(["Carta, PayPal o Revolut sul sito", "Annulla"]);
  });

  it("hands the site's checkout the cart with the piece in it, and reserves nothing", async () => {
    const { write, tap, last, rows, state } = world();
    await write(`/start pre-${SLUG}`);
    await tap("gd:o:1:q:2");
    await tap("gd:o:1:site");
    expect(last(BUYER).keyboard).toEqual([
      [{ text: "Apri il checkout", url: `https://geardropshop.it/carrello?preordine=${SLUG}&q=2&utm_source=telegram&utm_medium=social&utm_campaign=news` }],
    ]);
    expect(rows[0]!.status).toBe("cancelled");
    expect(state.left).toBe(30);
  });

  it("asks again when an answer is not what a parcel needs", async () => {
    const { write, tap, last, rows } = world();
    await write(`/start pre-${SLUG}`);
    await tap("gd:o:1:q:1");
    await tap("gd:o:1:pp");
    expect(last(BUYER).text).toContain("1/4 · Nome e cognome?");
    await write("Mario");
    expect(last(BUYER).text).toBe("Scrivi nome e cognome, ad esempio: Mario Rossi.");
    await write("Mario Rossi");
    await write("non-una-email");
    expect(rows[0]).toMatchObject({ buyerName: "Mario Rossi", email: null, step: "email" });
    await write("mario@example.it");
    await write("333 1234567");
    await write("99999");
    expect(last(BUYER).text).toBe("Nessun Locker per quel CAP: prova con un CAP vicino.");
    await write("00185");
    expect(last(BUYER).keyboard).toEqual([
      [{ text: "ROM01 · Via Marsala 29, 00185 Roma", callback_data: "gd:o:1:k:0" }],
      [{ text: "ROM02 · Via Giolitti 2, 00185 Roma", callback_data: "gd:o:1:k:1" }],
    ]);
  });

  it("takes the pieces off the count, asks PayPal for the exact total and tells the owner", async () => {
    const { reserve, rows, state, last, sent } = world();
    await reserve(2);
    expect(state.left).toBe(28);
    expect(rows[0]).toMatchObject({ status: "awaiting_payment", totalCents: 4490, expiresAt: "2026-11-27T09:00:00.000Z", locker: { id: "IT-ROM-1" } });
    const buyer = last(BUYER);
    expect(buyer.text).toContain("scrivi <b>GDT-7K3Q9A</b> nella nota del pagamento");
    expect(buyer.keyboard).toEqual([[{ text: "Paga €44,90 con PayPal", url: "https://paypal.me/geardrop/44.90EUR" }]]);
    const owner = last(OWNER);
    expect(owner.text).toContain("PRE-ORDINE IN ATTESA // GDT-7K3Q9A");
    expect(owner.text).toContain("Mario Rossi · @blader_mario\nmario@example.it · +393331234567\nLocker: ROM01 · Via Marsala 29, 00185 Roma");
    expect(owner.keyboard).toEqual([
      [
        { text: "Pagato", callback_data: "gd:o:1:paid" },
        { text: "Annulla", callback_data: "gd:o:1:void" },
      ],
    ]);
    // Nothing about the buyer goes to the channel.
    expect(sent.every((message) => message.chatId === BUYER || message.chatId === OWNER)).toBe(true);
  });

  it("charges the price of the moment the buyer confirms", async () => {
    const context = world();
    await context.write(`/start pre-${SLUG}`);
    await context.tap("gd:o:1:q:1");
    await context.tap("gd:o:1:pp");
    for (const answer of ["Mario Rossi", "mario@example.it", "3331234567", "00185"]) await context.write(answer);
    await context.tap("gd:o:1:k:0");
    context.deps.loadProducts = async () => [hidden(30, 1800)];
    await context.tap("gd:o:1:ok");
    expect(context.rows[0]).toMatchObject({ unitCents: 1800, totalCents: 2290 });
  });

  it("reserves nothing when the last pieces went while he was typing", async () => {
    const { write, tap, state, rows, last } = world({ left: 2 });
    await write(`/start pre-${SLUG}`);
    await tap("gd:o:1:q:2");
    await tap("gd:o:1:pp");
    for (const answer of ["Mario Rossi", "mario@example.it", "3331234567", "00185"]) await write(answer);
    await tap("gd:o:1:k:0");
    state.left = 1;
    await tap("gd:o:1:ok");
    expect(last(BUYER).text).toContain("i pezzi sono finiti");
    expect(rows[0]!.status).toBe("cancelled");
    expect(state.left).toBe(1);
  });

  it("keeps one unpaid reservation per buyer", async () => {
    const { reserve, answers, state } = world();
    await reserve(1);
    await reserve(1);
    expect(answers.at(-1)).toBe("Hai già un pre-ordine in attesa di pagamento: paga quello, o aspetta che scada.");
    expect(state.left).toBe(29);
  });

  it("lets nobody press another buyer's buttons, or the owner's", async () => {
    const { reserve, tap, answers, rows, write } = world();
    await write(`/start pre-${SLUG}`);
    await tap("gd:o:1:q:1", "999000111");
    expect(answers.at(-1)).toBe("Questo pre-ordine non è tuo.");
    const id = await reserve(1);
    await tap(`gd:o:${id}:paid`);
    expect(answers.at(-1)).toBe("Solo il proprietario può farlo.");
    expect(rows[id - 1]!.status).toBe("awaiting_payment");
  });
});

describe("the owner decides how each pre-order is paid", () => {
  const CHANNEL = "@geardropnews";

  it("offers one Pubblica per way of paying, and only Stripe while no PayPal.me name is set", async () => {
    const withPaypal = world({ draft: true });
    await scanNews(withPaypal.deps);
    expect(withPaypal.last(OWNER).keyboard?.slice(0, 4)).toEqual([
      [{ text: "Pubblica · solo Stripe", callback_data: "gd:p:1:s" }],
      [{ text: "Pubblica · solo PayPal.me", callback_data: "gd:p:1:p" }],
      [{ text: "Pubblica · Stripe e PayPal.me", callback_data: "gd:p:1:b" }],
      [{ text: "Scarta", callback_data: "gd:x:1" }],
    ]);
    const without = world({ draft: true, paypal: null });
    await scanNews(without.deps);
    expect(without.last(OWNER).keyboard?.slice(0, 2)).toEqual([
      [{ text: "Pubblica · solo Stripe", callback_data: "gd:p:1:s" }],
      [{ text: "Scarta", callback_data: "gd:x:1" }],
    ]);
  });

  it("on Stripe only, the channel's button is the cart with the piece in it", async () => {
    const { deps, tap, last, modes, drafted, answers } = world({ draft: true });
    await scanNews(deps);
    await tap("gd:p:1:s", OWNER);
    expect(answers.at(-1)).toBe("Pubblicato sul canale.");
    expect(drafted.status).toBe("published");
    expect(modes.get(SLUG)).toBe("stripe");
    const post = last(CHANNEL);
    expect(post.text).toContain("Si paga sul sito, con carta, PayPal o Revolut.");
    expect(post.keyboard).toEqual([
      [{ text: "Pre-ordina", url: `https://geardropshop.it/carrello?preordine=${SLUG}&utm_source=telegram&utm_medium=social&utm_campaign=news` }],
    ]);
  });

  it("on PayPal.me only, the button opens the bot and the bot offers nothing else", async () => {
    const { deps, tap, write, last, modes, answers, rows } = world({ draft: true });
    await scanNews(deps);
    await tap("gd:p:1:p", OWNER);
    expect(modes.get(SLUG)).toBe("paypal");
    expect(last(CHANNEL).keyboard).toEqual([[{ text: "Pre-ordina", url: `https://t.me/GearDropNewsBot?start=pre-${SLUG}` }]]);
    await write(`/start pre-${SLUG}`);
    await tap("gd:o:1:q:1");
    expect(last(BUYER).keyboard?.map((row) => row[0]!.text)).toEqual(["PayPal.me", "Annulla"]);
    await tap("gd:o:1:site");
    expect(answers.at(-1)).toBe("Questo pre-ordine si paga solo con PayPal.me.");
    expect(rows[0]!.status).toBe("collecting");
  });

  it("on both, the buyer chooses in the bot", async () => {
    const { deps, tap, write, last, modes } = world({ draft: true });
    await scanNews(deps);
    await tap("gd:p:1:b", OWNER);
    expect(modes.get(SLUG)).toBe("both");
    await write(`/start pre-${SLUG}`);
    await tap("gd:o:1:q:1");
    expect(last(BUYER).keyboard?.map((row) => row[0]!.text)).toEqual(["PayPal.me", "Carta, PayPal o Revolut sul sito", "Annulla"]);
  });

  it("a pre-order paid on Stripe only offers no PayPal.me, even to someone who opens the bot by hand", async () => {
    const { write, tap, last, answers } = world({ mode: "stripe" });
    await write(`/start pre-${SLUG}`);
    await tap("gd:o:1:q:1");
    expect(last(BUYER).keyboard?.map((row) => row[0]!.text)).toEqual(["Carta, PayPal o Revolut sul sito", "Annulla"]);
    await tap("gd:o:1:pp");
    expect(answers.at(-1)).toBe("PayPal.me non è disponibile per questo pezzo: usa il sito.");
  });

  it("falls back to the site when PayPal.me was chosen but cannot take the piece", async () => {
    const { write, tap, last } = world({ mode: "paypal", paypal: null });
    await write(`/start pre-${SLUG}`);
    await tap("gd:o:1:q:1");
    expect(last(BUYER).keyboard?.map((row) => row[0]!.text)).toEqual(["Carta, PayPal o Revolut sul sito", "Annulla"]);
  });

  it("only the owner's tap publishes, whatever way of paying it names", async () => {
    const { deps, tap, drafted, answers } = world({ draft: true });
    await scanNews(deps);
    await tap("gd:p:1:s");
    expect(answers.at(-1)).toBe("Solo il proprietario può farlo.");
    expect(drafted.status).toBe("draft");
  });

  it("offers only the way of paying the owner asked for with the post", async () => {
    const { deps, last } = world({ draft: true, fixed: "paypal" });
    await scanNews(deps);
    expect(last(OWNER).keyboard?.slice(0, 2)).toEqual([
      [{ text: "Pubblica · solo PayPal.me", callback_data: "gd:p:1:p" }],
      [{ text: "Scarta", callback_data: "gd:x:1" }],
    ]);
    expect(last(OWNER).text).toContain("Si prenota e si paga qui.");
  });

  it("keeps to it even when an older draft's button says otherwise", async () => {
    const { deps, tap, modes, drafted } = world({ draft: true, fixed: "stripe" });
    await scanNews(deps);
    await tap("gd:p:1:b", OWNER);
    expect(drafted.status).toBe("published");
    expect(modes.get(SLUG)).toBe("stripe");
  });

  it("falls back to the site when PayPal.me was asked for but has no name set", async () => {
    const { deps, last } = world({ draft: true, fixed: "paypal", paypal: null });
    await scanNews(deps);
    expect(last(OWNER).keyboard?.slice(0, 2)).toEqual([
      [{ text: "Pubblica · solo Stripe", callback_data: "gd:p:1:s" }],
      [{ text: "Scarta", callback_data: "gd:x:1" }],
    ]);
  });

  it("reads the way of paying off the button, and ignores one on Scarta", () => {
    expect(parseDraftAction("gd:p:7:s")).toEqual({ action: "publish", draftId: 7, mode: "stripe" });
    expect(parseDraftAction("gd:p:7:p")).toEqual({ action: "publish", draftId: 7, mode: "paypal" });
    expect(parseDraftAction("gd:p:7:b")).toEqual({ action: "publish", draftId: 7, mode: "both" });
    expect(parseDraftAction("gd:x:7:s")).toEqual({ action: "discard", draftId: 7 });
    expect(parseDraftAction("gd:p:7:z")).toBeNull();
    const post = { text: "x", link: { label: "Pre-ordina", url: "https://t.me/Bot?start=pre-x" } };
    expect(draftKeyboard(7, post)[0]).toEqual([
      { text: "Pubblica", callback_data: "gd:p:7" },
      { text: "Scarta", callback_data: "gd:x:7" },
    ]);
  });
});

describe("the owner and a reservation", () => {
  it("makes a paid reservation an order of the shop, once", async () => {
    const { reserve, tap, rows, recorded } = world();
    const id = await reserve(1);
    expect(recorded).toEqual([]);
    await tap(`gd:o:${id}:paid`, OWNER);
    expect(recorded).toEqual([id]);
    expect(rows[id - 1]!.orderId).toBe(9000 + id);
    // A second «Pagato» changes nothing and makes no second order.
    await tap(`gd:o:${id}:paid`, OWNER);
    expect(recorded).toEqual([id]);
  });

  it("keeps it paid when the order cannot be recorded, and lets the owner retry", async () => {
    const { reserve, tap, rows, answers, keyboards, last } = world({ orders: "fail" });
    const id = await reserve(1);
    await tap(`gd:o:${id}:paid`, OWNER);
    expect(rows[id - 1]!.status).toBe("paid");
    expect(answers.at(-1)).toBe("Segnato come pagato, ma l'ordine non è stato creato: tocca «Crea l'ordine».");
    expect(keyboards.at(-1)).toEqual({ messageId: 77, keyboard: [[{ text: "Crea l'ordine nel gestionale", callback_data: `gd:o:${id}:order` }]] });
    // The buyer is told it is paid; the order number comes with the shipping news.
    expect(last(BUYER).text).not.toContain("Numero d'ordine");
    await tap(`gd:o:${id}:order`);
    expect(answers.at(-1)).toBe("Solo il proprietario può farlo.");
    await tap(`gd:o:${id}:order`, OWNER);
    expect(answers.at(-1)).toBe("Ordine GD-T7K3Q9A nel gestionale.");
    expect(rows[id - 1]!.orderId).toBe(9000 + id);
  });

  it("sends an order cancelled from the back office there, so its pieces come back once", async () => {
    const { reserve, tap, rows, answers, state } = world();
    const id = await reserve(2);
    await tap(`gd:o:${id}:paid`, OWNER);
    await tap(`gd:o:${id}:void`, OWNER);
    expect(answers.at(-1)).toBe("È già un ordine del gestionale: annullalo da lì, che rimette i pezzi.");
    expect(rows[id - 1]!.status).toBe("paid");
    expect(state.left).toBe(28);
  });

  it("says on /preordini which paid ones are in the back office", async () => {
    const { reserve, tap, write, last } = world();
    const id = await reserve(1);
    await tap(`gd:o:${id}:paid`, OWNER);
    await write("/preordini", OWNER);
    expect(last(OWNER).text).toContain("Nel gestionale: spedisci dalla stazione di magazzino.");
  });

  it("marks it paid and tells the buyer the piece is his", async () => {
    const { reserve, tap, rows, last, answers, cleared, state } = world();
    const id = await reserve(2);
    await tap(`gd:o:${id}:paid`, OWNER);
    expect(rows[id - 1]!.status).toBe("paid");
    expect(answers.at(-1)).toBe("Segnato come pagato: ordine GD-T7K3Q9A nel gestionale.");
    expect(last(BUYER).text).toContain("Pagamento ricevuto. 2 × <b>Soar Phoenix 9-60GF solo trottola</b> è tuo");
    expect(last(BUYER).text).toContain("Numero d'ordine: GD-T7K3Q9A");
    expect(cleared).toEqual([77]);
    expect(state.left).toBe(28);
    await tap(`gd:o:${id}:paid`, OWNER);
    expect(answers.at(-1)).toBe("Già gestito.");
  });

  it("cancels it and gives the pieces back", async () => {
    const { reserve, tap, rows, state, last } = world();
    const id = await reserve(2);
    await tap(`gd:o:${id}:void`, OWNER);
    expect(rows[id - 1]!.status).toBe("cancelled");
    expect(state.left).toBe(30);
    expect(last(BUYER).text).toContain("è stato annullato dal negozio");
  });

  it("gives the pieces back after 24 hours without a payment, and tells both", async () => {
    const { reserve, state, rows, deps, last } = world();
    const id = await reserve(2);
    state.now = new Date("2026-11-27T08:59:00.000Z");
    await scanNews(deps);
    expect(rows[id - 1]!.status).toBe("awaiting_payment");
    state.now = new Date("2026-11-27T09:01:00.000Z");
    await scanNews(deps);
    expect(rows[id - 1]!.status).toBe("expired");
    expect(state.left).toBe(30);
    expect(last(BUYER).text).toContain("è scaduto senza pagamento");
    expect(last(OWNER).text).toContain("SCADUTO SENZA PAGAMENTO // GDT-7K3Q9A");
  });

  it("forgets who made a reservation that was never paid, thirty days on", async () => {
    const { reserve, state, rows, deps, tap, answers } = world();
    const id = await reserve(1);
    // Thirty days after it expired its buyer is still there...
    state.now = new Date("2026-11-27T10:00:00.000Z");
    await scanNews(deps);
    expect(rows[id - 1]).toMatchObject({ status: "expired", buyerName: "Mario Rossi", chatId: BUYER });
    state.now = new Date("2026-12-26T10:00:00.000Z");
    await scanNews(deps);
    expect(rows[id - 1]!.buyerName).toBe("Mario Rossi");
    // ...and a day later it is not: the product, the quantity and the outcome stay, nothing else.
    state.now = new Date("2026-12-28T10:00:00.000Z");
    await scanNews(deps);
    expect(rows[id - 1]).toMatchObject({
      status: "expired", slug: SLUG, quantity: 1, chatId: "0", username: null, buyerName: null, email: null, phone: null, locker: null, lockerOptions: [],
    });
    // Nobody is left to ship to, so a late "paid" is refused.
    await tap(`gd:o:${id}:paid`, OWNER);
    expect(answers.at(-1)).toBe("Scaduto da più di 30 giorni: i dati di chi aveva prenotato sono stati cancellati.");
    expect(rows[id - 1]!.status).toBe("expired");
  });

  it("keeps a paid pre-order whole: it is an order, and its parcel needs the buyer", async () => {
    const { reserve, state, rows, deps, tap } = world();
    const id = await reserve(1);
    await tap(`gd:o:${id}:paid`, OWNER);
    state.now = new Date("2027-03-01T10:00:00.000Z");
    await scanNews(deps);
    expect(rows[id - 1]).toMatchObject({ status: "paid", buyerName: "Mario Rossi", email: "mario@example.it", chatId: BUYER });
  });

  it("closes and forgets a reservation left half-way", async () => {
    const { write, tap, state, rows, deps } = world();
    await write(`/start pre-${SLUG}`);
    await tap("gd:o:1:q:1");
    await tap("gd:o:1:pp");
    await write("Mario Rossi");
    expect(rows[0]).toMatchObject({ status: "collecting", buyerName: "Mario Rossi" });
    state.now = new Date("2026-12-27T09:00:00.000Z");
    await scanNews(deps);
    expect(rows[0]).toMatchObject({ status: "cancelled", buyerName: null, chatId: "0", username: null });
  });

  it("can still mark a late payment paid while pieces are left, and says so when they are not", async () => {
    const { reserve, state, rows, deps, tap, answers } = world({ left: 2 });
    const id = await reserve(2);
    state.now = new Date("2026-11-28T09:00:00.000Z");
    await scanNews(deps);
    state.left = 0;
    await tap(`gd:o:${id}:paid`, OWNER);
    expect(answers.at(-1)).toBe("Scaduto, e i pezzi non ci sono più: rimborsalo o aggiungi pezzi.");
    state.left = 2;
    await tap(`gd:o:${id}:paid`, OWNER);
    expect(rows[id - 1]!.status).toBe("paid");
    expect(state.left).toBe(0);
  });

  it("lists who pre-ordered on /preordini, with what each parcel needs", async () => {
    const { reserve, tap, write, last } = world();
    await write("/preordini", OWNER);
    expect(last(OWNER).text).toBe("Nessun pre-ordine Telegram aperto.");
    const id = await reserve(2);
    await tap(`gd:o:${id}:paid`, OWNER);
    await write("/preordini", OWNER);
    expect(last(OWNER).text).toBe(
      [
        "<b>Soar Phoenix 9-60GF solo trottola</b>\nPagati: 2 pezzi · In attesa: 0 pezzi",
        "PAGATO · GDT-7K3Q9A · 2 × · €44,90\nMario Rossi · @blader_mario\nmario@example.it · +393331234567\nLocker: ROM01 · Via Marsala 29, 00185 Roma\nNel gestionale: spedisci dalla stazione di magazzino.",
      ].join("\n\n"),
    );
  });
});
