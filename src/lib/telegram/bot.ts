import type { Product } from "@/lib/commerce/types";
import { channelPostUrl, type TelegramGateway } from "./api";
import { asDraft, channelPreorderPost, draftKeyboard, metaPost, parseDraftAction, postKeyboard, productPost, videoPost, type MetaSummary, type PostResult } from "./messages";
import { isProductMemory, scanMeta, scanProducts, scanVideos, type ChannelVideo, type NewsEvent, type NewsPayload, type ProductMemory } from "./news";
import { slugFromStart } from "./preorder-rules";
import { expirePreorders, preorderReport, preorderTap, preorderText, startPreorder, type PreorderContext, type PreorderDeps } from "./preorders";

/**
 * The news bot's two jobs (owner, 2026-11-26: "bozza + tuo OK").
 *
 * 1. Look at the shop, find what is new, and show each piece of news to the owner in his private
 *    chat as a draft with two buttons.
 * 2. When he taps "Pubblica", write the post again from the shop's data as it is at that moment
 *    and send it to the channel. A draft that stopped being true is refused, never published.
 *
 * Nobody else can make it publish: a button counts only when Telegram says the owner's own account
 * pressed it. Everything the bot touches is passed in, so the whole flow runs in the unit tests.
 */

export type DraftStatus = "draft" | "publishing" | "published" | "discarded";

export type NewsDraft = {
  readonly id: number;
  readonly payload: NewsPayload;
  readonly status: DraftStatus;
  /** The draft's message in the owner's chat, once it has been shown to him. */
  readonly ownerMessageId: number | null;
};

export type NewsStore = {
  readMemory(): Promise<ReadonlyMap<string, unknown>>;
  writeMemory(entries: ReadonlyMap<string, unknown>): Promise<void>;
  /** Drafts the events that were not drafted before; answers how many were new. */
  addDrafts(events: readonly NewsEvent[]): Promise<number>;
  /** Drafts the owner has not been shown yet, oldest first. */
  unsentDrafts(limit: number): Promise<readonly NewsDraft[]>;
  /** Takes one draft for sending; false when another run already has it. */
  claimSending(id: number): Promise<boolean>;
  /** Records the draft's message, or with null gives the draft back for the next run. */
  markSent(id: number, ownerMessageId: number | null): Promise<void>;
  /** Makes the drafts still waiting for an answer count as never shown; answers how many. */
  forgetSent(): Promise<number>;
  /** draft → publishing in one step, so two taps publish once. Null when it was already decided. */
  claimDecision(id: number): Promise<NewsDraft | null>;
  finish(id: number, status: "published" | "discarded" | "draft", channelMessageId?: number): Promise<void>;
};

export type NewsDeps = {
  readonly store: NewsStore;
  readonly telegram: TelegramGateway;
  readonly ownerChatId: string;
  /** Null while there is no channel: "Pubblica" then posts in the owner's own chat, as a rehearsal. */
  readonly channelId: string | null;
  /** The loaders throw when the shop cannot be read: a look that failed finds nothing and forgets nothing. */
  readonly loadProducts: () => Promise<readonly Product[]>;
  readonly loadMetaMonths: () => Promise<readonly string[]>;
  /** Null when that month is not published (any more). */
  readonly loadMeta: (month: string) => Promise<MetaSummary | null>;
  readonly loadVideos: () => Promise<readonly ChannelVideo[]>;
  readonly now: () => Date;
  /** Pre-orders taken in the bot's chat (preorders.ts). Without it the bot only publishes news. */
  readonly preorders?: PreorderDeps;
};

function preorderContext(deps: NewsDeps): PreorderContext | null {
  return deps.preorders
    ? { telegram: deps.telegram, ownerChatId: deps.ownerChatId, loadProducts: deps.loadProducts, now: deps.now, preorders: deps.preorders }
    : null;
}

/** How many drafts one run shows the owner: a price list changed in one go must not bury his chat. */
export const DRAFTS_PER_RUN = 8;
const REMEMBERED_VIDEOS = 60;

const PRODUCTS_MARKER = "products";
const PRODUCT_PREFIX = "product:";
const META_KEY = "meta";
const VIDEOS_KEY = "videos";

function stringList(value: unknown, key: string): readonly string[] | null {
  const list = typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;
  return Array.isArray(list) && list.every((item) => typeof item === "string") ? (list as string[]) : null;
}

export type ScanReport = {
  /** The first run only remembers what is already on sale. */
  readonly firstLook: boolean;
  readonly found: number;
  readonly sent: number;
  /** Parts of the shop that could not be read this time. */
  readonly unread: readonly string[];
};

async function attempt<T>(name: string, unread: string[], load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    console.error(`[telegram-news] ${name}:`, error instanceof Error ? error.message : error);
    unread.push(name);
    return null;
  }
}

export async function scanNews(deps: NewsDeps, options: { readonly videos?: boolean } = {}): Promise<ScanReport> {
  const now = deps.now();
  const memory = await deps.store.readMemory();
  const writes = new Map<string, unknown>();
  const events: NewsEvent[] = [];
  const unread: string[] = [];
  let firstLook = false;

  // Pieces reserved on Telegram and never paid go back before the shop is looked at.
  const preorders = preorderContext(deps);
  if (preorders) await attempt("pre-ordini", unread, () => expirePreorders(preorders));

  const products = await attempt("catalogo", unread, deps.loadProducts);
  if (products) {
    const first = !memory.has(PRODUCTS_MARKER);
    const remembered = new Map<string, ProductMemory>();
    for (const [key, value] of memory) {
      if (key.startsWith(PRODUCT_PREFIX) && isProductMemory(value)) remembered.set(key.slice(PRODUCT_PREFIX.length), value);
    }
    const scan = scanProducts(remembered, products, now, first);
    events.push(...scan.events);
    for (const [slug, state] of scan.memory) writes.set(`${PRODUCT_PREFIX}${slug}`, state);
    if (first) {
      writes.set(PRODUCTS_MARKER, { since: now.toISOString() });
      firstLook = true;
    }
  }

  const months = await attempt("meta", unread, deps.loadMetaMonths);
  if (months) {
    const seen = stringList(memory.get(META_KEY), "months");
    const scan = scanMeta(new Set(seen ?? []), months, seen === null);
    events.push(...scan.events);
    if (seen === null || scan.seen.length > 0) writes.set(META_KEY, { months: [...(seen ?? []), ...scan.seen] });
  }

  if (options.videos !== false) {
    const videos = await attempt("video", unread, deps.loadVideos);
    if (videos) {
      const seen = stringList(memory.get(VIDEOS_KEY), "ids");
      const scan = scanVideos(new Set(seen ?? []), videos, seen === null);
      events.push(...scan.events);
      if (seen === null || scan.seen.length > 0) writes.set(VIDEOS_KEY, { ids: [...(seen ?? []), ...scan.seen].slice(-REMEMBERED_VIDEOS) });
    }
  }

  // Drafts first, memory second: if the second write fails the next look finds the same events
  // again, and their keys keep them from being drafted twice.
  const found = events.length > 0 ? await deps.store.addDrafts(events) : 0;
  if (writes.size > 0) await deps.store.writeMemory(writes);
  const sent = await showWaitingDrafts(deps);
  return { firstLook, found, sent, unread };
}

type Written = PostResult | { readonly ok: false; readonly reason: string; readonly retry: true };

/** The post for a draft, from the shop as it is now. */
async function writePost(payload: NewsPayload, deps: NewsDeps): Promise<Written> {
  try {
    switch (payload.kind) {
      case "new_product":
      case "back_in_stock":
      case "price_drop":
        return productPost(payload, await deps.loadProducts());
      case "channel_preorder": {
        const botUsername = await deps.preorders?.botUsername();
        if (!botUsername) return { ok: false, reason: "non riesco a leggere il nome del bot", retry: true };
        return channelPreorderPost(payload, await deps.loadProducts(), botUsername);
      }
      case "meta_update": {
        const meta = await deps.loadMeta(payload.month);
        return meta ? { ok: true, post: metaPost(meta) } : { ok: false, reason: "quella tier list non è più pubblicata" };
      }
      case "new_video":
        return { ok: true, post: videoPost(payload) };
    }
  } catch (error) {
    console.error("[telegram-news] write:", error instanceof Error ? error.message : error);
    return { ok: false, reason: "non riesco a leggere lo shop adesso", retry: true };
  }
}

/** Shows the owner the drafts he has not seen, a few at a time. */
export async function showWaitingDrafts(deps: NewsDeps): Promise<number> {
  const waiting = await deps.store.unsentDrafts(DRAFTS_PER_RUN + 1);
  const destination = deps.channelId ?? "questa chat (nessun canale configurato)";
  let sent = 0;
  for (const draft of waiting.slice(0, DRAFTS_PER_RUN)) {
    if (!(await deps.store.claimSending(draft.id))) continue;
    const written = await writePost(draft.payload, deps);
    if (!written.ok) {
      // Already untrue before he saw it (sold out again within the hour): nothing to show.
      if ("retry" in written) await deps.store.markSent(draft.id, null);
      else await deps.store.finish(draft.id, "discarded");
      continue;
    }
    const messageId = await deps.telegram.sendPost(deps.ownerChatId, asDraft(written.post, destination), draftKeyboard(draft.id, written.post));
    await deps.store.markSent(draft.id, messageId);
    if (messageId !== null) sent += 1;
  }
  if (waiting.length > DRAFTS_PER_RUN) await deps.telegram.sendText(deps.ownerChatId, "Ci sono altre bozze in attesa: scrivi /bozze per vederle.");
  return sent;
}

/** "Pubblica": the answer shown to the owner over the button. */
export async function publishDraft(draftId: number, deps: NewsDeps): Promise<string> {
  const draft = await deps.store.claimDecision(draftId);
  if (!draft) return "Già gestita.";

  const written = await writePost(draft.payload, deps);
  if (!written.ok) {
    if ("retry" in written) {
      await deps.store.finish(draft.id, "draft");
      return "Non riesco a leggere lo shop adesso: riprova tra poco.";
    }
    await deps.store.finish(draft.id, "discarded");
    if (draft.ownerMessageId) await deps.telegram.setKeyboard(deps.ownerChatId, draft.ownerMessageId, []);
    return `Non pubblicata: ${written.reason}.`;
  }

  const messageId = await deps.telegram.sendPost(deps.channelId ?? deps.ownerChatId, written.post, postKeyboard(written.post));
  if (messageId === null) {
    await deps.store.finish(draft.id, "draft");
    return "Telegram non ha accettato il post: riprova.";
  }
  await deps.store.finish(draft.id, "published", messageId);
  if (draft.ownerMessageId) {
    const address = channelPostUrl(deps.channelId, messageId);
    await deps.telegram.setKeyboard(deps.ownerChatId, draft.ownerMessageId, [
      [{ text: address ? "Pubblicato: apri il post" : "Pubblicato", url: address ?? written.post.link.url }],
    ]);
  }
  return deps.channelId ? "Pubblicato sul canale." : "Pubblicato qui: nessun canale configurato.";
}

/** "Scarta": the draft leaves the chat and is never proposed again. */
export async function discardDraft(draftId: number, deps: NewsDeps): Promise<string> {
  const draft = await deps.store.claimDecision(draftId);
  if (!draft) return "Già gestita.";
  await deps.store.finish(draft.id, "discarded");
  if (draft.ownerMessageId && !(await deps.telegram.deleteMessage(deps.ownerChatId, draft.ownerMessageId))) {
    await deps.telegram.setKeyboard(deps.ownerChatId, draft.ownerMessageId, []);
  }
  return "Scartata.";
}

const HELP = [
  "<b>GEAR//DROP news</b>",
  "Guardo lo shop e ti mando qui le novità come bozze: nuovi arrivi, pezzi tornati disponibili, prezzi ribassati, nuova tier list, nuovi video.",
  "Ogni bozza ha due tasti: <b>Pubblica</b> la manda sul canale con prezzo e disponibilità riletti in quel momento, <b>Scarta</b> la elimina.",
  "",
  "/controlla  guarda lo shop adesso",
  "/bozze  mostra di nuovo le bozze in attesa",
  "/preordini  chi ha pre-ordinato su Telegram, pagato o in attesa",
].join("\n");

export function scanSummary(report: ScanReport): string {
  const unread = report.unread.length > 0 ? ` Non sono riuscito a leggere: ${report.unread.join(", ")}.` : "";
  if (report.firstLook) return `Collegato. Da adesso osservo lo shop: le prossime novità arrivano qui come bozze.${unread}`;
  if (report.sent > 0) return `${report.sent === 1 ? "1 bozza" : `${report.sent} bozze`} qui sopra.${unread}`;
  return `Nessuna novità.${unread}`;
}

/** The parts of a Telegram update the bot reads. Everything else in it is ignored. */
type Update = {
  readonly callback_query?: {
    readonly id?: unknown;
    readonly from?: { readonly id?: unknown };
    readonly data?: unknown;
    readonly message?: { readonly message_id?: unknown };
  };
  readonly message?: {
    readonly chat?: { readonly id?: unknown; readonly type?: unknown };
    readonly from?: { readonly id?: unknown; readonly username?: unknown };
    readonly text?: unknown;
  };
};

/**
 * One update from Telegram: a tap on a draft's button, or a command in the owner's chat.
 * Answers a short label of what happened, for the log.
 */
export async function handleUpdate(input: unknown, deps: NewsDeps): Promise<string> {
  const update = (typeof input === "object" && input !== null ? input : {}) as Update;
  const account = (id: unknown) => (typeof id === "number" || typeof id === "string" ? String(id) : null);
  const isOwner = (id: unknown) => account(id) === deps.ownerChatId;
  const preorders = preorderContext(deps);

  const tap = update.callback_query;
  if (tap && typeof tap.id === "string") {
    // A pre-order's buttons belong to its buyer, or to the owner: preorderTap checks which.
    const from = account(tap.from?.id);
    if (preorders && from) {
      const messageId = typeof tap.message?.message_id === "number" ? tap.message.message_id : null;
      const answer = await preorderTap(preorders, { from, data: typeof tap.data === "string" ? tap.data : undefined, messageId });
      if (answer !== null) {
        await deps.telegram.answerCallback(tap.id, answer);
        return "preorder";
      }
    }
    if (!isOwner(tap.from?.id)) {
      await deps.telegram.answerCallback(tap.id, "Solo il proprietario può farlo.");
      return "refused";
    }
    const action = parseDraftAction(typeof tap.data === "string" ? tap.data : undefined);
    if (!action) {
      await deps.telegram.answerCallback(tap.id, "");
      return "ignored";
    }
    const answer = action.action === "publish" ? await publishDraft(action.draftId, deps) : await discardDraft(action.draftId, deps);
    await deps.telegram.answerCallback(tap.id, answer);
    return action.action;
  }

  const message = update.message;
  if (!message || message.chat?.type !== "private" || typeof message.text !== "string") return "ignored";
  const command = /^\/([a-z]+)(?:@\w+)?(?:\s|$)/i.exec(message.text.trim())?.[1]?.toLowerCase();
  // Anyone may pre-order, the owner included (it is how he tries the flow): the channel post's
  // button arrives here as "/start pre-<slug>", and what follows is the buyer answering the bot.
  const chatId = account(message.chat.id);
  if (preorders && chatId && chatId === account(message.from?.id)) {
    const slug = slugFromStart(message.text);
    if (slug) return startPreorder(preorders, { id: chatId, username: typeof message.from?.username === "string" ? message.from.username : null }, slug);
    if (!command && (await preorderText(preorders, chatId, message.text))) return "preorder";
  }
  if (!isOwner(message.from?.id)) {
    // A stranger gets the one thing he can use: where the news comes out.
    if (command === "start" && deps.channelId?.startsWith("@") && (typeof message.chat.id === "number" || typeof message.chat.id === "string")) {
      await deps.telegram.sendText(String(message.chat.id), `Le news di GEAR//DROP escono sul canale ${deps.channelId}.`);
    }
    return "stranger";
  }

  switch (command) {
    case "controlla": {
      await deps.telegram.sendText(deps.ownerChatId, scanSummary(await scanNews(deps)));
      return "scan";
    }
    case "bozze": {
      let sent = await showWaitingDrafts(deps);
      if (sent === 0 && (await deps.store.forgetSent()) > 0) sent = await showWaitingDrafts(deps);
      if (sent === 0) await deps.telegram.sendText(deps.ownerChatId, "Nessuna bozza in attesa.");
      return "drafts";
    }
    case "preordini": {
      if (!preorders) {
        await deps.telegram.sendText(deps.ownerChatId, "I pre-ordini su Telegram non sono attivi.");
        return "preorders";
      }
      await expirePreorders(preorders);
      for (const text of await preorderReport(preorders)) await deps.telegram.sendText(deps.ownerChatId, text);
      return "preorders";
    }
    default:
      await deps.telegram.sendText(deps.ownerChatId, HELP);
      return "help";
  }
}
