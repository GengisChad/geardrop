/**
 * Owner, 2026-11-27: "tutto quello che pubblichi su IG mandalo anche su telegram con collegamento al
 * pagamento del sito". A picture or clip published on Instagram becomes a draft for the channel, with
 * the shop's own lines and a button that puts the piece in the site's cart.
 */
import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/data/catalog";
import type { Product } from "@/lib/commerce/types";
import type { TelegramGateway } from "@/lib/telegram/api";
import { handleUpdate, publishSocialNow, showWaitingDrafts, type DraftStatus, type NewsDeps, type NewsStore } from "@/lib/telegram/bot";
import type { InlineKeyboard, TelegramPost } from "@/lib/telegram/messages";
import { isNewsPayload, type NewsPayload } from "@/lib/telegram/news";
import { preorderFromCartLink } from "@/lib/telegram/preorder-rules";
import { parseSocialRequest } from "@/lib/telegram/social";
import { SOCIAL_LIMITS, socialMediaType } from "@/lib/telegram/social-media";

const OWNER = "111222333";
const CHANNEL = "@geardropshop";
const PHOTO = { type: "photo" as const, fileId: "AgACAgQAAxkBAAIBc2Zt-test_photo", uniqueId: "AQADtest01" };
const VIDEO = { type: "video" as const, fileId: "BAACAgQAAxkBAAIBdGZt-test_video", uniqueId: "AgADtest02" };

const glory = PRODUCTS.find((product) => product.slug === "glory-valkerion-lf")!;
const onOffer: Product = { ...glory, stock: "disponibile", availableQuantity: 5, price: { amount: 1799, currency: "EUR" }, compareAtPrice: { amount: 1999, currency: "EUR" } };

type Row = { id: number; eventKey: string; payload: NewsPayload; status: DraftStatus; ownerMessageId: number | null };
type Sent = { chatId: string; text: string; photoUrl?: string | undefined; videoUrl?: string | undefined; keyboard: InlineKeyboard };

function world(products: readonly Product[], channelId: string | null = CHANNEL) {
  const rows: Row[] = [];
  const memory = new Map<string, unknown>();
  const sent: Sent[] = [];
  const answers: string[] = [];
  let nextId = 700;
  const store: NewsStore = {
    readMemory: async () => new Map(memory),
    writeMemory: async (entries) => {
      for (const [key, value] of entries) memory.set(key, value);
    },
    addDrafts: async (events) => {
      const fresh = events.filter((event) => !rows.some((row) => row.eventKey === event.eventKey));
      for (const event of fresh) rows.push({ id: rows.length + 1, eventKey: event.eventKey, payload: event.payload, status: "draft", ownerMessageId: null });
      return fresh.length;
    },
    unsentDrafts: async (limit) => rows.filter((row) => row.status === "draft" && row.ownerMessageId === null).slice(0, limit),
    claimSending: async () => true,
    markSent: async (id, ownerMessageId) => {
      rows.find((row) => row.id === id)!.ownerMessageId = ownerMessageId;
    },
    forgetSent: async () => 0,
    claimDecision: async (id) => {
      const row = rows.find((candidate) => candidate.id === id && candidate.status === "draft");
      if (!row) return null;
      row.status = "publishing";
      return row;
    },
    finish: async (id, status) => {
      rows.find((row) => row.id === id)!.status = status;
    },
  };
  const telegram: TelegramGateway = {
    sendPost: async (chatId: string, post: TelegramPost, keyboard: InlineKeyboard) => {
      sent.push({ chatId, text: post.text, photoUrl: post.photoUrl, videoUrl: post.videoUrl, keyboard });
      return (nextId += 1);
    },
    sendText: async (chatId, html) => {
      sent.push({ chatId, text: html, keyboard: [] });
      return (nextId += 1);
    },
    setKeyboard: async () => true,
    deleteMessage: async () => true,
    answerInline: async () => true,
    sendPoll: async () => null,
    stopPoll: async () => null,
    answerCallback: async (_id, text) => {
      answers.push(text);
    },
  };
  const deps: NewsDeps = {
    store,
    telegram,
    ownerChatId: OWNER,
    channelId,
    now: () => new Date("2026-11-27T10:00:00.000Z"),
    loadProducts: async () => products,
    loadMetaMonths: async () => [],
    loadMeta: async () => null,
  };
  /** What the route does with a request: store the draft and show it to the owner. */
  const submit = async (body: unknown) => {
    const parsed = parseSocialRequest(body);
    if (!parsed.ok) throw new Error(parsed.reason);
    await store.addDrafts([parsed.event]);
    return showWaitingDrafts(deps);
  };
  /** What the route does with a request that says publish: straight to the channel. */
  const publishNow = async (body: unknown) => {
    const parsed = parseSocialRequest({ ...(body as object), publish: true });
    if (!parsed.ok || !parsed.publish) throw new Error("not a publish request");
    return publishSocialNow(parsed.event, deps);
  };
  const publish = (id: number, from = Number(OWNER)) => handleUpdate({ callback_query: { id: "cb", from: { id: from }, data: `gd:p:${id}`, message: { message_id: 1 } } }, deps);
  return { rows, sent, answers, submit, publish, publishNow };
}

describe("a picture published on Instagram, as a draft for the channel", () => {
  it("shows the owner the same picture with the shop's lines and one Pubblica", async () => {
    const { submit, sent } = world([onOffer]);
    expect(await submit({ slug: glory.slug, note: "Offerta del weekend 🔥", media: PHOTO })).toBe(1);
    const draft = sent.at(-1)!;
    expect(draft.chatId).toBe(OWNER);
    expect(draft.photoUrl).toBe(PHOTO.fileId);
    expect(draft.text.split("\n")).toEqual([
      "<i>Bozza per @geardropshop: esce solo se tocchi Pubblica.</i>",
      "",
      "Offerta del weekend 🔥",
      "",
      "<b>Glory Valkerion LF</b>",
      "<b>€17,99</b> invece di <s>€19,99</s> (-10%) · Disponibile",
    ]);
    expect(draft.keyboard[0]).toEqual([
      { text: "Pubblica", callback_data: "gd:p:1" },
      { text: "Scarta", callback_data: "gd:x:1" },
    ]);
  });

  it("goes out on the owner's tap with the button that puts the piece in the site's cart", async () => {
    const { submit, publish, sent, rows } = world([onOffer]);
    await submit({ slug: glory.slug, media: VIDEO });
    // Only the owner's own account publishes.
    expect(await publish(1, 999)).toBe("refused");
    expect(rows[0]!.status).toBe("draft");
    await publish(1);
    expect(rows[0]!.status).toBe("published");
    const post = sent.at(-1)!;
    expect(post.chatId).toBe(CHANNEL);
    expect(post.videoUrl).toBe(VIDEO.fileId);
    expect(post.photoUrl).toBeUndefined();
    expect(post.keyboard).toEqual([
      [{ text: "Compra sul sito", url: `https://geardropshop.it/carrello?aggiungi=${glory.slug}&utm_source=telegram&utm_medium=social&utm_campaign=news` }],
    ]);
    // The cart reads that link like a pre-order's.
    expect(preorderFromCartLink(`?aggiungi=${glory.slug}&utm_source=telegram`)).toEqual({ slug: glory.slug, quantity: 1 });
  });

  it("reads the price again when it goes out, and refuses a piece that sold out meanwhile", async () => {
    const products = [onOffer];
    const { submit, publish, sent, rows, answers } = world(products);
    await submit({ slug: glory.slug, media: PHOTO });
    products[0] = { ...onOffer, stock: "esaurito", availableQuantity: 0 };
    await publish(1);
    expect(rows[0]!.status).toBe("discarded");
    expect(answers.at(-1)).toBe("Non pubblicata: Glory Valkerion LF è esaurito.");
    expect(sent.filter((message) => message.chatId === CHANNEL)).toHaveLength(0);
  });

  it("says pre-order on a piece the shop sells as one", async () => {
    const { submit, sent } = world([{ ...onOffer, stock: "pre-ordine", availableQuantity: 4, compareAtPrice: undefined as never }]);
    await submit({ slug: glory.slug, media: PHOTO });
    expect(sent.at(-1)!.text).toContain("Pre-ordine");
    expect(sent.at(-1)!.keyboard.at(-1)).toEqual([{ text: "Pre-ordina sul sito", url: expect.stringContaining("/carrello?aggiungi=glory-valkerion-lf") }]);
  });

  it("can be about the shop rather than one product, with a page to open", async () => {
    const { submit, sent } = world([]);
    await submit({ note: "Tutte le offerte della settimana", path: "/negozio?sort=novita", media: PHOTO });
    expect(sent.at(-1)!.text).toContain("Tutte le offerte della settimana");
    expect(sent.at(-1)!.keyboard.at(-1)).toEqual([{ text: "Vai allo shop", url: "https://geardropshop.it/negozio?sort=novita&utm_source=telegram&utm_medium=social&utm_campaign=news" }]);
  });

  it("is one draft however many times the same picture is sent for the same product", async () => {
    const { submit, rows } = world([onOffer]);
    await submit({ slug: glory.slug, media: PHOTO });
    await submit({ slug: glory.slug, media: PHOTO });
    expect(rows).toHaveLength(1);
  });
});

describe("a post that already went out on Instagram, straight to the channel", () => {
  it("goes out at once with the shop's lines and the pay button, and the owner is told where", async () => {
    const { publishNow, sent, rows } = world([onOffer]);
    const result = await publishNow({ slug: glory.slug, note: "Offerta del weekend", media: VIDEO });
    expect(result).toMatchObject({ ok: true, url: expect.stringMatching(/^https:\/\/t\.me\/geardropshop\/\d+$/) });
    expect(rows).toHaveLength(0);
    const post = sent.find((message) => message.chatId === CHANNEL)!;
    expect(post.videoUrl).toBe(VIDEO.fileId);
    expect(post.text).toBe("Offerta del weekend\n\n<b>Glory Valkerion LF</b>\n<b>€17,99</b> invece di <s>€19,99</s> (-10%) · Disponibile");
    expect(post.keyboard).toEqual([[{ text: "Compra sul sito", url: expect.stringContaining("/carrello?aggiungi=glory-valkerion-lf") }]]);
    expect(sent.at(-1)).toMatchObject({ chatId: OWNER, text: expect.stringMatching(/^Uscito anche sul canale: https:\/\/t\.me\/geardropshop\/\d+$/) });
  });

  it("is sent once, however often the publisher retries", async () => {
    const { publishNow, sent } = world([onOffer]);
    const first = await publishNow({ slug: glory.slug, media: PHOTO });
    const again = await publishNow({ slug: glory.slug, media: PHOTO });
    expect(again).toMatchObject({ ok: true, already: true });
    if (first.ok && again.ok) expect(again.messageId).toBe(first.messageId);
    expect(sent.filter((message) => message.chatId === CHANNEL)).toHaveLength(1);
  });

  it("does not go out for a piece that sold out, and tells the owner why", async () => {
    const { publishNow, sent } = world([{ ...onOffer, stock: "esaurito", availableQuantity: 0 }]);
    expect(await publishNow({ slug: glory.slug, media: PHOTO })).toEqual({ ok: false, reason: "Glory Valkerion LF è esaurito" });
    expect(sent.filter((message) => message.chatId === CHANNEL)).toHaveLength(0);
    expect(sent.at(-1)).toMatchObject({ chatId: OWNER, text: "Non uscito sul canale: Glory Valkerion LF è esaurito." });
  });

  it("refuses without a channel rather than posting in the owner's chat", async () => {
    const { publishNow, sent } = world([onOffer], null);
    expect(await publishNow({ slug: glory.slug, media: PHOTO })).toEqual({ ok: false, reason: "nessun canale configurato" });
    expect(sent).toHaveLength(0);
  });
});

describe("what the site accepts from the command", () => {
  it("needs a product or some words, and a picture or clip Telegram holds", () => {
    expect(parseSocialRequest({ media: PHOTO })).toEqual({ ok: false, reason: "senza prodotto serve un testo" });
    expect(parseSocialRequest({ slug: "x", media: { ...PHOTO, fileId: "short" } })).toEqual({ ok: false, reason: "richiesta non valida" });
    expect(parseSocialRequest({ slug: "x", media: { ...PHOTO, type: "gif" } })).toEqual({ ok: false, reason: "richiesta non valida" });
    expect(parseSocialRequest({ slug: "Not A Slug", media: PHOTO })).toEqual({ ok: false, reason: "richiesta non valida" });
    expect(parseSocialRequest({ note: "x", path: "https://evil.example", media: PHOTO })).toEqual({ ok: false, reason: "richiesta non valida" });
    expect(parseSocialRequest({ slug: "x", note: "a".repeat(401), media: PHOTO })).toEqual({ ok: false, reason: "il testo supera i 400 caratteri" });
    expect(parseSocialRequest(null)).toEqual({ ok: false, reason: "richiesta non valida" });
  });

  it("keeps the product's link over a page, and blank words as none", () => {
    const parsed = parseSocialRequest({ slug: glory.slug, path: "/negozio", note: "   ", media: PHOTO });
    expect(parsed).toEqual({
      ok: true,
      event: { eventKey: `social:${PHOTO.uniqueId}:${glory.slug}`, payload: { kind: "social_post", slug: glory.slug, path: null, note: null, media: PHOTO } },
      publish: false,
    });
    if (parsed.ok) expect(isNewsPayload(parsed.event.payload)).toBe(true);
    expect(isNewsPayload({ kind: "social_post", slug: null, path: null, note: "x", media: { type: "audio", fileId: "a", uniqueId: "b" } })).toBe(false);
  });

  it("knows a picture from a clip by the file's name, within Telegram's limits", () => {
    expect(socialMediaType("storia.jpg")).toBe("photo");
    expect(socialMediaType("post.PNG")).toBe("photo");
    expect(socialMediaType("reel.mp4")).toBe("video");
    expect(socialMediaType("reel.MOV")).toBe("video");
    expect(socialMediaType("animazione.gif")).toBeNull();
    expect(SOCIAL_LIMITS).toEqual({ photo: 10 * 1024 * 1024, video: 50 * 1024 * 1024 });
  });
});
