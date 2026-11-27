/**
 * Channel polls before buying (owner, 2026-11-27): /sondaggio makes a draft in his chat, only his
 * tap publishes it on the channel, and the anonymous counts feed the forecast page.
 */
import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/data/catalog";
import { pollSignal } from "@/lib/admin/forecast-repository";
import type { TelegramGateway } from "@/lib/telegram/api";
import { handleUpdate, type NewsDeps, type NewsStore } from "@/lib/telegram/bot";
import type { InlineKeyboard } from "@/lib/telegram/messages";
import { POLL_OPTIONS, draftPoll, pollReport, pollResults, pollTap, pollUpdate, productForPoll, type Poll, type PollContext, type PollStore } from "@/lib/telegram/polls";

const OWNER = "111222333";
const glory = PRODUCTS.find((product) => product.slug === "glory-valkerion-lf")!;

function world(options: { channel?: string | null; telegramAccepts?: boolean } = {}) {
  const polls: Poll[] = [];
  const sent: { chatId: string; text: string; keyboard?: InlineKeyboard | undefined }[] = [];
  const posted: { chatId: string; question: string; options: readonly string[]; keyboard: InlineKeyboard }[] = [];
  const store: PollStore = {
    create: async (poll) => {
      polls.push({ ...poll, id: polls.length + 1, counts: [], totalVoters: 0, status: "draft", channelMessageId: null });
      return polls.length;
    },
    get: async (id) => polls.find((poll) => poll.id === id) ?? null,
    claimPublish: async (id) => {
      const poll = polls.find((item) => item.id === id);
      if (!poll || poll.status !== "draft") return false;
      polls[polls.indexOf(poll)] = { ...poll, status: "open" };
      return true;
    },
    releasePublish: async (id) => {
      const poll = polls.find((item) => item.id === id)!;
      polls[polls.indexOf(poll)] = { ...poll, status: "draft" };
    },
    published: async (id, _pollId, channelMessageId) => {
      const poll = polls.find((item) => item.id === id)!;
      polls[polls.indexOf(poll)] = { ...poll, channelMessageId };
    },
    discard: async (id) => {
      const poll = polls.find((item) => item.id === id);
      if (!poll || poll.status !== "draft") return false;
      polls[polls.indexOf(poll)] = { ...poll, status: "discarded" };
      return true;
    },
    votes: async (pollId, counts, totalVoters) => {
      if (pollId !== "tg-poll-1" || !polls[0]) return false;
      polls[0] = { ...polls[0], counts, totalVoters };
      return true;
    },
    closed: async (id, counts, totalVoters) => {
      const poll = polls.find((item) => item.id === id)!;
      polls[polls.indexOf(poll)] = { ...poll, counts, totalVoters, status: "closed" };
    },
    recent: async () => [...polls].reverse(),
  };
  const telegram: TelegramGateway = {
    sendPost: async () => 1,
    sendText: async (chatId, text, keyboard) => {
      sent.push({ chatId, text, keyboard });
      return 1;
    },
    setKeyboard: async () => true,
    deleteMessage: async () => true,
    answerCallback: async () => {},
    answerInline: async () => true,
    sendPoll: async (chatId, question, pollOptions, keyboard) => {
      if (options.telegramAccepts === false) return null;
      posted.push({ chatId, question, options: pollOptions, keyboard });
      return { messageId: 77, pollId: "tg-poll-1" };
    },
    stopPoll: async () => ({ counts: [12, 5, 3], totalVoters: 20 }),
  };
  const context: PollContext = { telegram, store, ownerChatId: OWNER, channelId: options.channel === undefined ? "@geardropshop" : options.channel, loadProducts: async () => [glory] };
  return { polls, sent, posted, context, telegram, store };
}

describe("drafting a poll", () => {
  it("names the shop's product by slug or by its name, and makes only a draft in his chat", async () => {
    expect(productForPoll("glory-valkerion-lf", [glory])?.slug).toBe("glory-valkerion-lf");
    expect(productForPoll("valkerion GLORY", [glory])?.slug).toBe("glory-valkerion-lf");
    expect(productForPoll("cx-99 dragone", [glory])).toBeNull();

    const { context, polls, sent, posted } = world();
    await draftPoll(context, "glory valkerion");
    expect(polls).toEqual([expect.objectContaining({ productSlug: "glory-valkerion-lf", subject: "Glory Valkerion LF", question: "Glory Valkerion LF: lo prendereste?", status: "draft", options: [...POLL_OPTIONS] })]);
    expect(sent.at(-1)!.chatId).toBe(OWNER);
    expect(sent.at(-1)!.keyboard).toEqual([[{ text: "Pubblica sul canale", callback_data: "gd:v:p:1" }, { text: "Scarta", callback_data: "gd:v:x:1" }]]);
    expect(posted).toEqual([]);
  });

  it("takes a piece the shop does not have yet as a subject of its own", async () => {
    const { context, polls, sent } = world();
    await draftPoll(context, "CX-21 Customize Set D");
    expect(polls[0]).toMatchObject({ productSlug: null, subject: "CX-21 Customize Set D" });
    expect(sent.at(-1)!.text).toContain("i voti vanno in Previsioni come sondaggio a parte");
  });
});

describe("publishing and closing it", () => {
  it("goes to the channel only on the owner's tap, once", async () => {
    const { context, polls, posted } = world();
    await draftPoll(context, "glory-valkerion-lf");
    expect(await pollTap(context, { from: "444555666", data: "gd:v:p:1" })).toBe("Solo il proprietario.");
    expect(posted).toEqual([]);
    expect(await pollTap(context, { from: OWNER, data: "gd:v:p:1" })).toBe("Pubblicato sul canale.");
    expect(posted).toEqual([{ chatId: "@geardropshop", question: "Glory Valkerion LF: lo prendereste?", options: [...POLL_OPTIONS], keyboard: [[{ text: "Vedi sul sito", url: expect.stringContaining("/prodotto/glory-valkerion-lf") }]] }]);
    expect(polls[0]).toMatchObject({ status: "open", channelMessageId: 77 });
    expect(await pollTap(context, { from: OWNER, data: "gd:v:p:1" })).toBe("Già pubblicato o scartato.");
    expect(posted).toHaveLength(1);
  });

  it("stays a draft when Telegram refuses it, and refuses without a channel", async () => {
    const refused = world({ telegramAccepts: false });
    await draftPoll(refused.context, "glory-valkerion-lf");
    expect(await pollTap(refused.context, { from: OWNER, data: "gd:v:p:1" })).toBe("Telegram non l'ha accettato: riprova.");
    expect(refused.polls[0]!.status).toBe("draft");

    const none = world({ channel: null });
    await draftPoll(none.context, "glory-valkerion-lf");
    expect(await pollTap(none.context, { from: OWNER, data: "gd:v:p:1" })).toBe("Nessun canale configurato.");
  });

  it("can be thrown away while it is a draft", async () => {
    const { context, polls } = world();
    await draftPoll(context, "glory-valkerion-lf");
    expect(await pollTap(context, { from: OWNER, data: "gd:v:x:1" })).toBe("Scartato.");
    expect(polls[0]!.status).toBe("discarded");
    expect(await pollTap(context, { from: OWNER, data: "gd:v:p:1" })).toBe("Già pubblicato o scartato.");
  });

  it("counts the votes Telegram reports, and closes with the final ones", async () => {
    const { context, polls, sent } = world();
    await draftPoll(context, "glory-valkerion-lf");
    await pollTap(context, { from: OWNER, data: "gd:v:p:1" });
    expect(await pollUpdate(context, { id: "tg-poll-1", options: [{ text: "a", voter_count: 4 }, { text: "b", voter_count: 1 }, { text: "c", voter_count: 0 }], total_voter_count: 5 })).toBe(true);
    expect(polls[0]).toMatchObject({ counts: [4, 1, 0], totalVoters: 5 });
    expect(await pollTap(context, { from: OWNER, data: "gd:v:c:1" })).toBe("Chiuso.");
    expect(polls[0]).toMatchObject({ status: "closed", counts: [12, 5, 3], totalVoters: 20 });
    expect(sent.at(-1)!.text).toContain("Sì, lo prendo appena arriva: 12 (60%)");
    expect(await pollReport(context)).toContain("<b>Glory Valkerion LF</b> · chiuso · 20 voti");
  });

  it("reads as the forecast page shows it", () => {
    expect(pollResults({ options: ["Sì", "No"], counts: [3, 1], totalVoters: 4 })).toBe("Sì: 3 (75%)\nNo: 1 (25%)");
    expect(pollSignal({ counts: [12, 5, 3], totalVoters: 20 })).toBe("12 sì su 20");
  });
});

describe("in the bot", () => {
  function bot() {
    const w = world();
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
      telegram: w.telegram,
      ownerChatId: OWNER,
      channelId: "@geardropshop",
      now: () => new Date("2026-11-27T10:00:00.000Z"),
      loadProducts: async () => [glory],
      loadMetaMonths: async () => [],
      loadMeta: async () => null,
      polls: w.context,
    };
    const write = (text: string, from = OWNER) => handleUpdate({ message: { chat: { id: Number(from), type: "private" }, from: { id: Number(from) }, text } }, deps);
    return { ...w, deps, write };
  }

  it("drafts a poll from the owner's /sondaggio, and from nobody else", async () => {
    const { write, polls } = bot();
    expect(await write("/sondaggio glory valkerion")).toBe("poll");
    expect(polls).toHaveLength(1);
    expect(await write("/sondaggio glory valkerion", "444555666")).toBe("stranger");
    expect(polls).toHaveLength(1);
  });

  it("takes Telegram's poll updates", async () => {
    const { write, deps, polls } = bot();
    await write("/sondaggio glory-valkerion-lf");
    await handleUpdate({ callback_query: { id: "cb", from: { id: Number(OWNER) }, data: "gd:v:p:1" } }, deps);
    expect(await handleUpdate({ poll: { id: "tg-poll-1", options: [{ voter_count: 2 }, { voter_count: 0 }, { voter_count: 1 }], total_voter_count: 3, is_closed: false } }, deps)).toBe("poll votes");
    expect(polls[0]).toMatchObject({ counts: [2, 0, 1], totalVoters: 3 });
  });
});
