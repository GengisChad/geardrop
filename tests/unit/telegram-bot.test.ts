import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/data/catalog";
import type { Product } from "@/lib/commerce/types";
import type { TelegramGateway } from "@/lib/telegram/api";
import { DRAFTS_PER_RUN, handleUpdate, scanNews, type DraftStatus, type NewsDeps, type NewsStore } from "@/lib/telegram/bot";
import type { InlineKeyboard, TelegramPost } from "@/lib/telegram/messages";
import type { NewsPayload } from "@/lib/telegram/news";

const OWNER = "111222333";
const CHANNEL = "@geardropnews";

type Row = { id: number; eventKey: string; payload: NewsPayload; status: DraftStatus; ownerMessageId: number | null; sending: boolean; channelMessageId?: number };

/** The store's contract, kept in memory: what the two database tables do. */
function memoryStore() {
  const memory = new Map<string, unknown>();
  const rows: Row[] = [];
  const view = (row: Row) => ({ id: row.id, payload: row.payload, status: row.status, ownerMessageId: row.ownerMessageId });
  const store: NewsStore = {
    readMemory: async () => new Map(memory),
    writeMemory: async (entries) => {
      for (const [key, value] of entries) memory.set(key, value);
    },
    addDrafts: async (events) => {
      const fresh = events.filter((event) => !rows.some((row) => row.eventKey === event.eventKey));
      for (const event of fresh) rows.push({ id: rows.length + 1, eventKey: event.eventKey, payload: event.payload, status: "draft", ownerMessageId: null, sending: false });
      return fresh.length;
    },
    unsentDrafts: async (limit) => rows.filter((row) => row.status === "draft" && row.ownerMessageId === null && !row.sending).slice(0, limit).map(view),
    claimSending: async (id) => {
      const row = rows.find((candidate) => candidate.id === id && candidate.status === "draft" && candidate.ownerMessageId === null && !candidate.sending);
      if (row) row.sending = true;
      return Boolean(row);
    },
    markSent: async (id, ownerMessageId) => {
      const row = rows.find((candidate) => candidate.id === id)!;
      row.sending = false;
      row.ownerMessageId = ownerMessageId;
    },
    forgetSent: async () => {
      const shown = rows.filter((row) => row.status === "draft" && row.ownerMessageId !== null);
      for (const row of shown) row.ownerMessageId = null;
      return shown.length;
    },
    claimDecision: async (id) => {
      const row = rows.find((candidate) => candidate.id === id && candidate.status === "draft");
      if (!row) return null;
      row.status = "publishing";
      return view(row);
    },
    finish: async (id, status, channelMessageId) => {
      const row = rows.find((candidate) => candidate.id === id)!;
      row.status = status;
      if (channelMessageId !== undefined) row.channelMessageId = channelMessageId;
    },
  };
  return { store, rows, memory };
}

type Sent = { chatId: string; text: string; photoUrl?: string | undefined; keyboard?: InlineKeyboard };

function fakeTelegram(options: { readonly refuse?: (chatId: string) => boolean } = {}) {
  const sent: Sent[] = [];
  const answers: string[] = [];
  const keyboards: { messageId: number; keyboard: InlineKeyboard }[] = [];
  const deleted: number[] = [];
  let nextId = 500;
  const gateway: TelegramGateway = {
    sendPost: async (chatId: string, post: TelegramPost, keyboard: InlineKeyboard) => {
      if (options.refuse?.(chatId)) return null;
      sent.push({ chatId, text: post.text, photoUrl: post.photoUrl, keyboard });
      return (nextId += 1);
    },
    sendText: async (chatId, html) => {
      sent.push({ chatId, text: html });
      return (nextId += 1);
    },
    setKeyboard: async (_chatId, messageId, keyboard) => {
      keyboards.push({ messageId, keyboard });
      return true;
    },
    deleteMessage: async (_chatId, messageId) => {
      deleted.push(messageId);
      return true;
    },
    answerInline: async () => true,
    sendPoll: async () => null,
    stopPoll: async () => null,
    answerCallback: async (_id, text) => {
      answers.push(text);
    },
  };
  return { gateway, sent, answers, keyboards, deleted };
}

const base = PRODUCTS.find((product) => product.slug === "soar-phoenix-9-60gf-solo-trottola")!;
const phoenix = (stock: Product["stock"], amount = 1690): Product => ({ ...base, stock, price: { amount, currency: "EUR" } });

/** A shop whose catalogue and tier lists the test changes between looks. */
function shop(initial: { products: readonly Product[]; months?: readonly string[]; channelId?: string | null }) {
  const world = { products: initial.products, months: initial.months ?? ["2026-11"], down: false };
  const { store, rows, memory } = memoryStore();
  const telegram = fakeTelegram();
  const deps: NewsDeps = {
    store,
    telegram: telegram.gateway,
    ownerChatId: OWNER,
    channelId: initial.channelId === undefined ? CHANNEL : initial.channelId,
    now: () => new Date("2026-11-26T09:00:00.000Z"),
    loadProducts: async () => {
      if (world.down) throw new Error("database unreachable");
      return world.products;
    },
    loadMetaMonths: async () => world.months,
    loadMeta: async (month) => (world.months.includes(month) ? { month, title: "Il meta del mese", topBlades: ["Shark Scale", "Aero Pegasus", "Knight Shield V2"] } : null),
  };
  return { world, deps, rows, memory, ...telegram };
}

const tap = (data: string, from: number | string = Number(OWNER)) => ({ callback_query: { id: "cb-1", from: { id: from }, data } });
const write = (text: string, from: number | string = Number(OWNER)) => ({ message: { chat: { id: from, type: "private" }, from: { id: from }, text } });

describe("looking at the shop", () => {
  it("sends nothing on the first look", async () => {
    const { deps, sent, rows } = shop({ products: [phoenix("disponibile")] });
    const report = await scanNews(deps);
    expect(report).toEqual({ firstLook: true, found: 0, sent: 0, unread: [] });
    expect(rows).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("drafts a restock to the owner's chat, never to the channel", async () => {
    const { world, deps, sent } = shop({ products: [phoenix("esaurito")] });
    await scanNews(deps);
    world.products = [phoenix("disponibile")];
    const report = await scanNews(deps);
    expect(report).toMatchObject({ firstLook: false, found: 1, sent: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.chatId).toBe(OWNER);
    expect(sent[0]!.text).toBe(
      "<i>Bozza per @geardropnews: esce solo se tocchi Pubblica.</i>\n\nDI NUOVO DISPONIBILE //\n<b>Soar Phoenix 9-60GF solo trottola</b>\n<b>€16,90</b> · Disponibile",
    );
    expect(sent[0]!.keyboard?.[0]).toEqual([
      { text: "Pubblica", callback_data: "gd:p:1" },
      { text: "Scarta", callback_data: "gd:x:1" },
    ]);
  });

  it("drafts the same news once, however many times it looks", async () => {
    const { world, deps, sent, rows } = shop({ products: [phoenix("esaurito")] });
    await scanNews(deps);
    world.products = [phoenix("disponibile")];
    await scanNews(deps);
    await scanNews(deps);
    await scanNews(deps);
    expect(rows).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it("drafts a new tier list", async () => {
    const { world, deps, sent } = shop({ products: [phoenix("disponibile")] });
    await scanNews(deps);
    world.months = ["2026-11", "2026-12"];
    const report = await scanNews(deps);
    expect(report.found).toBe(1);
    expect(sent.map((message) => message.text.split("\n\n")[1]!.split("\n")[0])).toEqual(["META // dicembre 2026"]);
  });

  it("finds nothing and forgets nothing when the shop cannot be read", async () => {
    const { world, deps, sent, memory } = shop({ products: [phoenix("esaurito")] });
    await scanNews(deps);
    const before = JSON.stringify([...memory]);
    world.down = true;
    const report = await scanNews(deps);
    expect(report).toMatchObject({ found: 0, sent: 0, unread: ["catalogo"] });
    expect(JSON.stringify([...memory])).toBe(before);
    expect(sent).toEqual([]);
  });

  it("shows a few drafts at a time when a whole price list changes", async () => {
    const many = PRODUCTS.filter((product) => !product.channelOnly).slice(0, DRAFTS_PER_RUN + 3).map((product) => ({ ...product, stock: "esaurito" as const, variant: undefined }) as unknown as Product);
    const { world, deps, sent } = shop({ products: many });
    await scanNews(deps);
    world.products = many.map((product) => ({ ...product, stock: "disponibile" as const }));
    const report = await scanNews(deps);
    expect(report).toMatchObject({ found: DRAFTS_PER_RUN + 3, sent: DRAFTS_PER_RUN });
    expect(sent.at(-1)!.text).toBe("Ci sono altre bozze in attesa: scrivi /bozze per vederle.");
    await handleUpdate(write("/bozze"), deps);
    expect(sent.filter((message) => message.keyboard).length).toBe(DRAFTS_PER_RUN + 3);
  });
});

describe("Pubblica", () => {
  async function withDraft(channelId: string | null = CHANNEL) {
    const context = shop({ products: [phoenix("esaurito")], channelId });
    await scanNews(context.deps);
    context.world.products = [phoenix("disponibile")];
    await scanNews(context.deps);
    context.sent.length = 0;
    return context;
  }

  it("sends the post to the channel, with the shop's button and no draft line", async () => {
    const { deps, sent, answers, rows, keyboards } = await withDraft();
    expect(await handleUpdate(tap("gd:p:1"), deps)).toBe("publish");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.chatId).toBe(CHANNEL);
    expect(sent[0]!.text).toBe("DI NUOVO DISPONIBILE //\n<b>Soar Phoenix 9-60GF solo trottola</b>\n<b>€16,90</b> · Disponibile");
    expect(sent[0]!.keyboard).toEqual([[{ text: "Vedi nello shop", url: expect.stringContaining("/prodotto/soar-phoenix-9-60gf-solo-trottola?utm_source=telegram") }]]);
    expect(answers).toEqual(["Pubblicato sul canale."]);
    expect(rows[0]).toMatchObject({ status: "published", channelMessageId: expect.any(Number) });
    // The draft keeps one button: the published post.
    expect(keyboards[0]!.keyboard).toEqual([[{ text: "Pubblicato: apri il post", url: expect.stringMatching(/^https:\/\/t\.me\/geardropnews\/\d+$/) }]]);
  });

  it("publishes the price the shop has now, not the one in the draft", async () => {
    const { world, deps, sent } = await withDraft();
    world.products = [phoenix("disponibile", 1590)];
    await handleUpdate(tap("gd:p:1"), deps);
    expect(sent[0]!.text).toContain("<b>€15,90</b>");
  });

  it("refuses a draft that is no longer true", async () => {
    const { world, deps, sent, answers, rows } = await withDraft();
    world.products = [phoenix("esaurito")];
    await handleUpdate(tap("gd:p:1"), deps);
    expect(sent).toEqual([]);
    expect(answers).toEqual(["Non pubblicata: Soar Phoenix 9-60GF solo trottola è di nuovo esaurito."]);
    expect(rows[0]!.status).toBe("discarded");
  });

  it("publishes once when the button is tapped twice", async () => {
    const { deps, sent, answers } = await withDraft();
    await handleUpdate(tap("gd:p:1"), deps);
    await handleUpdate(tap("gd:p:1"), deps);
    expect(sent).toHaveLength(1);
    expect(answers).toEqual(["Pubblicato sul canale.", "Già gestita."]);
  });

  it("obeys nobody but the owner", async () => {
    const { deps, sent, answers, rows } = await withDraft();
    expect(await handleUpdate(tap("gd:p:1", 999888777), deps)).toBe("refused");
    expect(sent).toEqual([]);
    expect(answers).toEqual(["Solo il proprietario può farlo."]);
    expect(rows[0]!.status).toBe("draft");
  });

  it("keeps the draft when the shop cannot be read, so the tap can be repeated", async () => {
    const { world, deps, sent, answers, rows } = await withDraft();
    world.down = true;
    await handleUpdate(tap("gd:p:1"), deps);
    expect(sent).toEqual([]);
    expect(answers).toEqual(["Non riesco a leggere lo shop adesso: riprova tra poco."]);
    expect(rows[0]!.status).toBe("draft");
  });

  it("rehearses in the owner's chat while there is no channel", async () => {
    const { deps, sent, answers } = await withDraft(null);
    await handleUpdate(tap("gd:p:1"), deps);
    expect(sent[0]!.chatId).toBe(OWNER);
    expect(answers).toEqual(["Pubblicato qui: nessun canale configurato."]);
  });
});

describe("Scarta and the commands", () => {
  it("removes a discarded draft and never proposes it again", async () => {
    const { world, deps, sent, deleted, rows, answers } = shop({ products: [phoenix("esaurito")] });
    await scanNews(deps);
    world.products = [phoenix("disponibile")];
    await scanNews(deps);
    expect(await handleUpdate(tap("gd:x:1"), deps)).toBe("discard");
    expect(answers).toEqual(["Scartata."]);
    expect(rows[0]!.status).toBe("discarded");
    expect(deleted).toHaveLength(1);
    await scanNews(deps);
    expect(sent.filter((message) => message.keyboard)).toHaveLength(1);
  });

  it("looks at the shop on /controlla and says what it found", async () => {
    const { world, deps, sent } = shop({ products: [phoenix("esaurito")] });
    await handleUpdate(write("/controlla"), deps);
    expect(sent.at(-1)!.text).toBe("Collegato. Da adesso osservo lo shop: le prossime novità arrivano qui come bozze.");
    await handleUpdate(write("/controlla"), deps);
    expect(sent.at(-1)!.text).toBe("Nessuna novità.");
    world.products = [phoenix("disponibile")];
    await handleUpdate(write("/controlla@GearDropNewsBot"), deps);
    expect(sent.at(-1)!.text).toBe("1 bozza qui sopra.");
  });

  it("shows waiting drafts again on /bozze", async () => {
    const { world, deps, sent } = shop({ products: [phoenix("esaurito")] });
    await scanNews(deps);
    await handleUpdate(write("/bozze"), deps);
    expect(sent.at(-1)!.text).toBe("Nessuna bozza in attesa.");
    world.products = [phoenix("disponibile")];
    await scanNews(deps);
    await handleUpdate(write("/bozze"), deps);
    expect(sent.filter((message) => message.keyboard)).toHaveLength(2);
  });

  it("explains itself to the owner and tells a stranger only where the channel is", async () => {
    const { deps, sent } = shop({ products: [phoenix("disponibile")] });
    expect(await handleUpdate(write("ciao"), deps)).toBe("help");
    expect(sent.at(-1)!.text).toContain("/controlla");
    sent.length = 0;
    expect(await handleUpdate(write("/controlla", 999888777), deps)).toBe("stranger");
    expect(sent).toEqual([]);
    expect(await handleUpdate(write("/start", 999888777), deps)).toBe("stranger");
    expect(sent).toEqual([{ chatId: "999888777", text: "Le news di GEAR//DROP escono sul canale @geardropnews." }]);
  });

  it("ignores what is not a tap or a private message", async () => {
    const { deps, sent } = shop({ products: [phoenix("disponibile")] });
    expect(await handleUpdate(null, deps)).toBe("ignored");
    expect(await handleUpdate({ message: { chat: { id: -100, type: "supergroup" }, from: { id: Number(OWNER) }, text: "/controlla" } }, deps)).toBe("ignored");
    expect(await handleUpdate(tap("altro"), deps)).toBe("ignored");
    expect(sent).toEqual([]);
  });
});
