import { formatPrice } from "@/lib/format";
import { PRODUCTION_ORIGIN } from "@/lib/site-url";
import type { TelegramGateway } from "./api";
import { escapeTelegram, type InlineKeyboard } from "./messages";

/**
 * The owner's shop, from his chat with the bot (owner, 2026-11-28: "fai il resto").
 *
 * /stock <parole>         what is on the shelf and set aside for pre-orders
 * /carico <parole> +3     a manual stock adjustment, after a «Conferma» tap
 * /fermi                  the pieces that do not sell, with the pricing agent's proposal; also
 *                         every Monday morning on its own
 *
 * Only the owner's own account can use them: bot.ts routes these commands and buttons only for him.
 * Stock and price move through two server-only database functions that take a request key, so a
 * double tap moves them once. After a move the bot looks at the shop, as after a save in the back
 * office: a piece back on the shelf becomes a draft for the channel and the «Avvisami» messages go.
 */

export type StockRow = {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly sku: string;
  readonly stock: number;
  /** Pieces set aside for pre-orders (products.preorder_allocation). */
  readonly preorderAllocation: number;
  readonly priceCents: number;
  readonly published: boolean;
};

export type PriceProposal = { readonly id: number; readonly priceCents: number; readonly outOfPolicy: boolean };

/** A piece on the shelf for a month without a sale (see SLOW_DAYS). */
export type SlowPiece = StockRow & { readonly lastSaleAt: string | null; readonly proposal: PriceProposal | null };

export type OwnerToolsStore = {
  products(): Promise<readonly StockRow[]>;
  /** The new stock, or null when this request was already carried out. Throws GD_… codes. */
  adjust(productId: number, delta: number, requestKey: string): Promise<number | null>;
  /** Published pieces with stock, on the shelf and unsold for SLOW_DAYS, with any pending proposal. */
  slowPieces(now: Date): Promise<readonly SlowPiece[]>;
  /** The price applied, or null when this request was already carried out. Throws GD_… codes. */
  applyProposal(proposalId: number, requestKey: string): Promise<number | null>;
};

export type OwnerToolsContext = {
  readonly telegram: TelegramGateway;
  readonly ownerChatId: string;
  readonly store: OwnerToolsStore;
  /** The bot's look at the shop, as after a save in the back office (runtime.ts). */
  readonly afterChange: () => Promise<void>;
  readonly now: () => Date;
};

/** A month on the shelf without a sale. */
export const SLOW_DAYS = 30;
/** How many slow pieces one message lists: the costliest to keep, first. */
export const SLOW_LISTED = 5;
const LISTED = 8;
/** The biggest move one /carico can make: the database refuses more anyway. */
export const MAX_DELTA = 1000;

const euro = (cents: number) => formatPrice({ amount: cents, currency: "EUR" });
const PRICES_URL = `${PRODUCTION_ORIGIN}/admin/prezzi`;

/** Lower case, letters and digits only, so "Dran Sword 3-60F" finds "dran-sword-3-60f". */
function normal(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The products whose name, slug or SKU hold every word typed; an exact SKU or slug comes first. */
export function matchProducts(rows: readonly StockRow[], query: string): readonly StockRow[] {
  const words = normal(query).split(" ").filter(Boolean);
  if (words.length === 0) return [];
  const exact = normal(query).replace(/ /g, "");
  const found = rows.filter((row) => {
    const haystack = ` ${normal(`${row.name} ${row.slug} ${row.sku}`)} `;
    const squashed = haystack.replace(/ /g, "");
    return words.every((word) => haystack.includes(word) || squashed.includes(word));
  });
  const rank = (row: StockRow) => (normal(row.sku).replace(/ /g, "") === exact || normal(row.slug).replace(/ /g, "") === exact ? 0 : 1);
  return [...found].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "it"));
}

function stockLine(row: StockRow): string {
  const reserved = row.preorderAllocation > 0 ? ` · pre-ordini ${row.preorderAllocation}` : "";
  const hidden = row.published ? "" : " · non pubblicato";
  return `<b>${escapeTelegram(row.name)}</b>\n${escapeTelegram(row.sku)} · magazzino <b>${row.stock}</b>${reserved} · ${euro(row.priceCents)}${hidden}`;
}

/** "/stock dran": what the shelf holds of the products that match. */
export function stockReport(rows: readonly StockRow[], query: string): string {
  if (!normal(query)) return "Scrivi cosa cerchi: <code>/stock dran</code>.";
  const found = matchProducts(rows, query);
  if (found.length === 0) return `Nessun prodotto per «${escapeTelegram(query.trim())}».`;
  const more = found.length > LISTED ? `\n\nE altri ${found.length - LISTED}: aggiungi una parola.` : "";
  return `${found.slice(0, LISTED).map(stockLine).join("\n\n")}${more}`;
}

/** "/carico dran sword +3" → the words and the move; "5" alone means +5. Null when no number ends it. */
export function parseLoad(text: string): { readonly query: string; readonly delta: number } | null {
  const body = text.trim().replace(/^\/carico(?:@\w+)?/i, "").trim();
  const match = /^(.*\S)\s+([+-]?)(\d{1,5})$/.exec(body);
  if (!match) return null;
  const delta = Number(match[3]) * (match[2] === "-" ? -1 : 1);
  return delta === 0 ? null : { query: match[1]!, delta };
}

const signed = (delta: number) => (delta > 0 ? `+${delta}` : String(delta));

const ACTION = /^gd:k:(c|y|n|pp)(?::(\d{1,12}))?(?::(-?\d{1,5}))?$/;

export type OwnerToolsAction =
  | { readonly kind: "choose" | "confirm"; readonly productId: number; readonly delta: number }
  | { readonly kind: "cancel" }
  | { readonly kind: "price"; readonly proposalId: number };

export function parseOwnerToolsAction(data: string | undefined): OwnerToolsAction | null {
  const match = ACTION.exec(data ?? "");
  if (!match) return null;
  const id = match[2] === undefined ? null : Number(match[2]);
  const delta = match[3] === undefined ? null : Number(match[3]);
  switch (match[1]) {
    case "n":
      return { kind: "cancel" };
    case "pp":
      return id === null ? null : { kind: "price", proposalId: id };
    default:
      return id === null || delta === null || delta === 0 || Math.abs(delta) > MAX_DELTA ? null : { kind: match[1] === "c" ? "choose" : "confirm", productId: id, delta };
  }
}

async function askConfirmation(context: OwnerToolsContext, row: StockRow, delta: number): Promise<void> {
  const after = row.stock + delta;
  if (after < 0) {
    await context.telegram.sendText(context.ownerChatId, `<b>${escapeTelegram(row.name)}</b> ne ha ${row.stock} in magazzino: non posso toglierne ${-delta}.`);
    return;
  }
  await context.telegram.sendText(
    context.ownerChatId,
    `<b>${escapeTelegram(row.name)}</b>\nMagazzino ${row.stock} → <b>${after}</b> (${signed(delta)})\nRettifica manuale, come nella pagina Inventario. Confermi?`,
    [[{ text: `Conferma ${signed(delta)}`, callback_data: `gd:k:y:${row.id}:${delta}` }, { text: "Annulla", callback_data: "gd:k:n" }]],
  );
}

/** "/carico <parole> <numero>": one product asks for a confirmation, several ask which one. */
export async function startLoad(context: OwnerToolsContext, text: string): Promise<string> {
  const parsed = parseLoad(text);
  if (!parsed || Math.abs(parsed.delta) > MAX_DELTA) {
    await context.telegram.sendText(context.ownerChatId, "Scrivi il prodotto e quanti pezzi: <code>/carico dran sword +3</code> oppure <code>/carico BX-01 -1</code>.");
    return "load";
  }
  const found = matchProducts(await context.store.products(), parsed.query);
  if (found.length === 0) {
    await context.telegram.sendText(context.ownerChatId, `Nessun prodotto per «${escapeTelegram(parsed.query)}».`);
    return "load";
  }
  if (found.length === 1) {
    await askConfirmation(context, found[0]!, parsed.delta);
    return "load";
  }
  const choices: InlineKeyboard = found.slice(0, 6).map((row) => [{ text: `${row.name} (${row.stock})`.slice(0, 60), callback_data: `gd:k:c:${row.id}:${parsed.delta}` }]);
  const more = found.length > 6 ? `\nNe trovo ${found.length}: se non c'è, aggiungi una parola.` : "";
  await context.telegram.sendText(context.ownerChatId, `Quale? (${signed(parsed.delta)})${more}`, [...choices, [{ text: "Annulla", callback_data: "gd:k:n" }]]);
  return "load";
}

function stockFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("GD_INSUFFICIENT_STOCK")) return "Non ci sono abbastanza pezzi per togliere quel numero.";
  if (message.includes("GD_PRODUCT_NOT_FOUND")) return "Prodotto non trovato.";
  if (message.includes("GD_INVALID_STOCK_DELTA")) return "Numero di pezzi non valido.";
  return "Non sono riuscito a registrare il movimento: riprova, o usa la pagina Inventario.";
}

function priceFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("GD_PROPOSAL_ALREADY_DECIDED")) return "Questa proposta è già stata decisa nel pannello.";
  if (message.includes("GD_PROPOSAL_OUT_OF_POLICY")) return "Questa proposta è fuori dalle tue regole di prezzo: decidila nel pannello.";
  if (message.includes("GD_PROPOSAL_NOT_FOUND")) return "Proposta non trovata.";
  return "Non sono riuscito a cambiare il prezzo: riprova, o usa la pagina Prezzi.";
}

/** A tap on one of these buttons, already known to be the owner's. Answers the toast he sees. */
export async function ownerToolsTap(context: OwnerToolsContext, action: OwnerToolsAction, messageId: number | null): Promise<string> {
  const clear = async () => {
    if (messageId !== null) await context.telegram.setKeyboard(context.ownerChatId, messageId, []);
  };
  switch (action.kind) {
    case "cancel":
      await clear();
      return "Annullato.";
    case "choose": {
      const row = (await context.store.products()).find((candidate) => candidate.id === action.productId);
      await clear();
      if (!row) return "Prodotto non trovato.";
      await askConfirmation(context, row, action.delta);
      return "";
    }
    case "confirm": {
      // The confirmation's own message names the request: the same button, tapped twice, moves once.
      const key = `stock:${messageId ?? "x"}:${action.productId}:${action.delta}`;
      let stock: number | null;
      try {
        stock = await context.store.adjust(action.productId, action.delta, key);
      } catch (error) {
        return stockFailure(error);
      }
      await clear();
      if (stock === null) return "Già fatto.";
      const row = (await context.store.products()).find((candidate) => candidate.id === action.productId);
      await context.telegram.sendText(context.ownerChatId, `Fatto: <b>${escapeTelegram(row?.name ?? "il prodotto")}</b> ora ha <b>${stock}</b> pezzi in magazzino.`);
      await context.afterChange();
      return "Registrato.";
    }
    case "price": {
      let price: number | null;
      try {
        price = await context.store.applyProposal(action.proposalId, `price:${action.proposalId}`);
      } catch (error) {
        return priceFailure(error);
      }
      if (price === null) return "Già fatto.";
      await context.telegram.sendText(
        context.ownerChatId,
        `Prezzo cambiato: ora <b>${euro(price)}</b>. Se è un ribasso, la bozza per il canale arriva qui: la pubblichi tu quando vuoi.`,
      );
      await context.afterChange();
      return "Prezzo applicato.";
    }
  }
}

const dayFormatter = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", timeZone: "Europe/Rome" });

/** The Monday list: the pieces that cost the most to keep on the shelf, with what to do about them. */
export function slowStockReport(pieces: readonly SlowPiece[]): { readonly text: string; readonly keyboard: InlineKeyboard } | null {
  if (pieces.length === 0) return null;
  const value = (piece: SlowPiece) => piece.stock * piece.priceCents;
  const sorted = [...pieces].sort((a, b) => value(b) - value(a) || a.name.localeCompare(b.name, "it"));
  const listed = sorted.slice(0, SLOW_LISTED);
  const total = sorted.reduce((sum, piece) => sum + value(piece), 0);
  const lines = listed.map((piece) => {
    const sold = piece.lastSaleAt ? `ultima vendita ${dayFormatter.format(new Date(piece.lastSaleAt))}` : "mai venduto";
    const proposal = piece.proposal
      ? piece.proposal.outOfPolicy
        ? `\nProposta dell'agente: ${euro(piece.proposal.priceCents)}, fuori dalle tue regole: decidi nel pannello.`
        : `\nProposta dell'agente prezzi: <b>${euro(piece.proposal.priceCents)}</b>.`
      : "";
    return `<b>${escapeTelegram(piece.name)}</b>\n${piece.stock} ${piece.stock === 1 ? "pezzo" : "pezzi"} a ${euro(piece.priceCents)} · ${sold}${proposal}`;
  });
  const more = sorted.length > listed.length ? `\n\nE altri ${sorted.length - listed.length} pezzi fermi.` : "";
  const text = [
    "<b>PEZZI FERMI //</b>",
    `In magazzino da più di ${SLOW_DAYS} giorni e senza vendite da ${SLOW_DAYS}: ${euro(total)} a prezzo pieno.`,
    "",
    lines.join("\n\n"),
  ].join("\n") + more;
  const apply = listed.flatMap((piece) =>
    piece.proposal && !piece.proposal.outOfPolicy
      ? [[{ text: `Applica ${euro(piece.proposal.priceCents)} · ${piece.name}`.slice(0, 64), callback_data: `gd:k:pp:${piece.proposal.id}` }]]
      : [],
  );
  const missing = listed.some((piece) => !piece.proposal);
  const keyboard: InlineKeyboard = [...apply, [{ text: missing ? "Chiedi le proposte all'agente prezzi" : "Apri le proposte nel pannello", url: PRICES_URL }]];
  return { text, keyboard };
}

/** /fermi, and the Monday morning message. Answers whether there was anything to say. */
export async function sendSlowStock(context: OwnerToolsContext, onDemand: boolean): Promise<boolean> {
  const report = slowStockReport(await context.store.slowPieces(context.now()));
  if (!report) {
    if (onDemand) await context.telegram.sendText(context.ownerChatId, `Nessun pezzo fermo: tutto quello che è in magazzino ha venduto negli ultimi ${SLOW_DAYS} giorni, o è arrivato da poco.`);
    return false;
  }
  await context.telegram.sendText(context.ownerChatId, report.text, report.keyboard);
  return true;
}

/** Monday in Rome: the day the slow-stock list goes out on its own, with the 09:00 look at the shop. */
export function isRomeMonday(now: Date): boolean {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Europe/Rome" }).format(now) === "Mon";
}
