import { hiddenFromShop } from "@/lib/commerce/channel-only";
import type { Product } from "@/lib/commerce/types";
import type { TelegramGateway } from "./api";
import { escapeTelegram, shopLink, type InlineKeyboard } from "./messages";

/**
 * Channel polls before buying (owner, 2026-11-27): "/sondaggio cx-21" in his chat makes a draft;
 * «Pubblica sul canale» sends it to the channel; the votes Telegram reports feed the forecast page
 * of the back office, next to the product. Nothing reaches the channel without his tap.
 *
 * A poll in a channel is anonymous: the bot only ever learns how many chose each answer.
 */

export const POLL_OPTIONS = ["Sì, lo prendo appena arriva", "Forse, dipende dal prezzo", "No, passo"] as const;

export type Poll = {
  readonly id: number;
  readonly productSlug: string | null;
  readonly subject: string;
  readonly question: string;
  readonly options: readonly string[];
  readonly counts: readonly number[];
  readonly totalVoters: number;
  readonly status: "draft" | "open" | "closed" | "discarded";
  readonly channelMessageId: number | null;
};

export type PollStore = {
  create(poll: Pick<Poll, "productSlug" | "subject" | "question" | "options">): Promise<number>;
  get(id: number): Promise<Poll | null>;
  /** Draft → open, once: false when another tap took it or it is no longer a draft. */
  claimPublish(id: number): Promise<boolean>;
  /** Back to draft when Telegram refused it, so he can try again. */
  releasePublish(id: number): Promise<void>;
  published(id: number, pollId: string, channelMessageId: number): Promise<void>;
  discard(id: number): Promise<boolean>;
  /** Telegram's report of a poll: the counts by its own poll id. */
  votes(pollId: string, counts: readonly number[], totalVoters: number, closed: boolean): Promise<boolean>;
  closed(id: number, counts: readonly number[], totalVoters: number): Promise<void>;
  recent(): Promise<readonly Poll[]>;
};

export type PollGateway = Pick<TelegramGateway, "sendText" | "answerCallback" | "sendPoll" | "stopPoll">;

export type PollContext = {
  readonly telegram: PollGateway;
  readonly store: PollStore;
  readonly ownerChatId: string;
  readonly channelId: string | null;
  readonly loadProducts: () => Promise<readonly Product[]>;
};

const normalise = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** The product "/sondaggio <words>" names: its slug, or every word in its name. */
export function productForPoll(words: string, catalogue: readonly Product[]): Product | null {
  const wanted = normalise(words).trim();
  if (!wanted) return null;
  const bySlug = catalogue.find((product) => product.slug === wanted);
  if (bySlug) return bySlug;
  const tokens = wanted.split(/[^a-z0-9]+/).filter(Boolean);
  const named = catalogue.filter((product) => tokens.every((token) => normalise(product.name).includes(token)));
  return named.length === 1 ? named[0]! : (named.sort((a, b) => a.name.length - b.name.length)[0] ?? null);
}

const ACTION = /^gd:v:(p|x|c):(\d{1,12})$/;

export function parsePollAction(data: string | undefined): { readonly verb: "publish" | "discard" | "close"; readonly id: number } | null {
  const match = ACTION.exec(data ?? "");
  if (!match) return null;
  return { verb: match[1] === "p" ? "publish" : match[1] === "x" ? "discard" : "close", id: Number(match[2]) };
}

/** "Sì, lo prendo appena arriva: 12 (60%)", one line per answer. */
export function pollResults(poll: Pick<Poll, "options" | "counts" | "totalVoters">): string {
  return poll.options
    .map((option, index) => {
      const count = poll.counts[index] ?? 0;
      const share = poll.totalVoters > 0 ? ` (${Math.round((count / poll.totalVoters) * 100)}%)` : "";
      return `${escapeTelegram(option)}: ${count}${share}`;
    })
    .join("\n");
}

/** "/sondaggio <pezzo>" from the owner: a draft with its two buttons. */
export async function draftPoll(context: PollContext, words: string): Promise<string> {
  const subjectWords = words.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!subjectWords) {
    await context.telegram.sendText(context.ownerChatId, "Scrivi /sondaggio e il pezzo, per esempio: /sondaggio cx-21");
    return "poll";
  }
  const product = productForPoll(subjectWords, await context.loadProducts());
  const subject = product?.name ?? subjectWords;
  const question = `${subject}: lo prendereste?`.slice(0, 300);
  const id = await context.store.create({ productSlug: product?.slug ?? null, subject, question, options: [...POLL_OPTIONS] });
  const text = [
    "<b>SONDAGGIO //</b> bozza",
    escapeTelegram(question),
    ...POLL_OPTIONS.map((option) => `• ${escapeTelegram(option)}`),
    product ? `Collegato a ${escapeTelegram(product.name)}: i voti vanno in Previsioni accanto al prodotto.` : "Nessun prodotto dello shop con questo nome: i voti vanno in Previsioni come sondaggio a parte.",
  ].join("\n");
  await context.telegram.sendText(context.ownerChatId, text, [
    [{ text: "Pubblica sul canale", callback_data: `gd:v:p:${id}` }, { text: "Scarta", callback_data: `gd:v:x:${id}` }],
  ]);
  return "poll";
}

/** One of the poll buttons, the owner's only. Null when the tap is not a poll's. */
export async function pollTap(context: PollContext, tap: { readonly from: string; readonly data: string | undefined }): Promise<string | null> {
  const action = parsePollAction(tap.data);
  if (!action) return null;
  if (tap.from !== context.ownerChatId) return "Solo il proprietario.";
  const poll = await context.store.get(action.id);
  if (!poll) return "Sondaggio non trovato.";

  if (action.verb === "discard") return (await context.store.discard(poll.id)) ? "Scartato." : "Non è più una bozza.";

  if (action.verb === "publish") {
    if (!context.channelId) return "Nessun canale configurato.";
    if (!(await context.store.claimPublish(poll.id))) return "Già pubblicato o scartato.";
    const catalogue = poll.productSlug ? await context.loadProducts() : [];
    const product = catalogue.find((item) => item.slug === poll.productSlug);
    const keyboard: InlineKeyboard = product && !hiddenFromShop(product) ? [[{ text: "Vedi sul sito", url: shopLink(`/prodotto/${product.slug}`) }]] : [];
    const sent = await context.telegram.sendPoll(context.channelId, poll.question, poll.options, keyboard);
    if (!sent) {
      await context.store.releasePublish(poll.id);
      return "Telegram non l'ha accettato: riprova.";
    }
    await context.store.published(poll.id, sent.pollId, sent.messageId);
    await context.telegram.sendText(context.ownerChatId, `Sondaggio pubblicato: ${escapeTelegram(poll.question)}\nI voti arrivano in Previsioni nel gestionale.`, [
      [{ text: "Chiudi sondaggio", callback_data: `gd:v:c:${poll.id}` }],
    ]);
    return "Pubblicato sul canale.";
  }

  if (poll.status !== "open" || !context.channelId || poll.channelMessageId === null) return "Non è aperto.";
  const final = await context.telegram.stopPoll(context.channelId, poll.channelMessageId);
  const counts = final?.counts ?? poll.counts;
  const total = final?.totalVoters ?? poll.totalVoters;
  await context.store.closed(poll.id, counts, total);
  await context.telegram.sendText(context.ownerChatId, `<b>SONDAGGIO CHIUSO //</b> ${escapeTelegram(poll.subject)}\n${pollResults({ options: poll.options, counts, totalVoters: total })}\nVoti: ${total}`);
  return "Chiuso.";
}

/** Telegram's "poll" update: the counts of a poll the bot sent. */
export async function pollUpdate(context: PollContext, poll: { readonly id?: unknown; readonly options?: unknown; readonly total_voter_count?: unknown; readonly is_closed?: unknown }): Promise<boolean> {
  if (typeof poll.id !== "string" || !Array.isArray(poll.options)) return false;
  const counts = poll.options.map((option) => (typeof option === "object" && option !== null && typeof (option as { voter_count?: unknown }).voter_count === "number" ? (option as { voter_count: number }).voter_count : 0));
  const total = typeof poll.total_voter_count === "number" ? poll.total_voter_count : counts.reduce((sum, count) => sum + count, 0);
  return context.store.votes(poll.id, counts, total, poll.is_closed === true);
}

/** "/sondaggi": the latest published polls with their votes. */
export async function pollReport(context: PollContext): Promise<string> {
  const polls = (await context.store.recent()).filter((poll) => poll.status === "open" || poll.status === "closed");
  if (polls.length === 0) return "Nessun sondaggio pubblicato. Scrivi /sondaggio e il pezzo per farne uno.";
  return polls
    .slice(0, 5)
    .map((poll) => `<b>${escapeTelegram(poll.subject)}</b> · ${poll.status === "open" ? "aperto" : "chiuso"} · ${poll.totalVoters} voti\n${pollResults(poll)}`)
    .join("\n\n");
}
