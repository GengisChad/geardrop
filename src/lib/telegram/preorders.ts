import type { Product } from "@/lib/commerce/types";
import { formatPrice } from "@/lib/format";
import { preorderDelivery } from "@/lib/labels";
import type { TelegramGateway } from "./api";
import { escapeTelegram, shopLink, type InlineKeyboard } from "./messages";
import {
  HOLD_HOURS,
  parseBuyerName,
  parseEmail,
  parsePhone,
  parsePostalCode,
  paypalMeUrl,
  piecesOffered,
  preorderOpen,
  preorderTotals,
} from "./preorder-rules";

/**
 * A pre-order taken in the bot's chat (owner, 2026-11-26).
 *
 * The channel post's button opens the bot with the product. The buyer picks how many, then how to
 * pay. "Sul sito" hands him the cart with the piece in it: the site's own checkout takes it from
 * there and nothing is reserved here. "PayPal.me" asks for the four things a Locker parcel needs,
 * takes the pieces off the product's allocation for 24 hours, gives him a PayPal.me address for
 * the exact amount and tells the owner, who marks it paid once he sees the money: PayPal.me sends
 * no word to anybody, so that tap is the only confirmation there is.
 *
 * The pieces are counted in one place, products.preorder_allocation, which the site's checkout
 * uses too: a piece reserved here cannot be sold there, and what is left when the goods arrive is
 * what the owner loads on the shelf.
 */

export type PreorderStatus = "collecting" | "awaiting_payment" | "paid" | "cancelled" | "expired";
export type PreorderStep = "quantity" | "payment" | "name" | "email" | "phone" | "cap" | "locker" | "confirm";
export type LockerChoice = { readonly id: string; readonly label: string };

export type Preorder = {
  readonly id: number;
  /** What the buyer writes in PayPal's note: "GDT-7K3Q9A". */
  readonly code: string;
  readonly chatId: string;
  readonly username: string | null;
  readonly slug: string;
  readonly productName: string;
  readonly quantity: number;
  readonly unitCents: number;
  readonly shippingCents: number;
  readonly totalCents: number;
  readonly buyerName: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly locker: LockerChoice | null;
  /** The Lockers last proposed to the buyer: a button only carries its place in this list. */
  readonly lockerOptions: readonly LockerChoice[];
  readonly status: PreorderStatus;
  readonly step: PreorderStep;
  readonly expiresAt: string | null;
};

export type PreorderPatch = Partial<
  Pick<Preorder, "quantity" | "unitCents" | "shippingCents" | "totalCents" | "buyerName" | "email" | "phone" | "locker" | "lockerOptions" | "step" | "expiresAt">
>;

export type PreorderStore = {
  /** Starts a pre-order for this chat, dropping any other it had left half-way. */
  open(input: { readonly code: string; readonly chatId: string; readonly username: string | null; readonly slug: string; readonly productName: string }): Promise<Preorder>;
  get(id: number): Promise<Preorder | null>;
  /** The pre-order this chat is filling in, if any. */
  collecting(chatId: string): Promise<Preorder | null>;
  update(id: number, patch: PreorderPatch): Promise<void>;
  /** Moves a pre-order from one status to another in one step; false when it was no longer there. */
  move(id: number, from: PreorderStatus, to: PreorderStatus, patch?: PreorderPatch): Promise<boolean>;
  /**
   * Takes pieces off the product's allocation, or gives them back with a negative number. Answers
   * the pieces left, or null when there are not enough or the product is no longer a pre-order.
   */
  hold(slug: string, quantity: number): Promise<number | null>;
  /** Reserved pieces whose 24 hours ran out without a payment. */
  overdue(now: Date): Promise<readonly Preorder[]>;
  list(statuses: readonly PreorderStatus[]): Promise<readonly Preorder[]>;
};

export type PreorderDeps = {
  readonly store: PreorderStore;
  /** The bot's own @name, which the channel post's button needs. */
  readonly botUsername: () => Promise<string | null>;
  /** The owner's PayPal.me name, or null: then only the site's checkout is offered. */
  readonly paypalHandle: string | null;
  readonly searchLockers: (postalCode: string) => Promise<readonly LockerChoice[]>;
  readonly newCode: () => string;
};

export type PreorderContext = {
  readonly telegram: TelegramGateway;
  readonly ownerChatId: string;
  readonly loadProducts: () => Promise<readonly Product[]>;
  readonly now: () => Date;
  readonly preorders: PreorderDeps;
};

const LOCKERS_SHOWN = 6;
const euro = (cents: number) => formatPrice({ amount: cents, currency: "EUR" });
const pieces = (count: number) => (count === 1 ? "1 pezzo" : `${count} pezzi`);
const action = (id: number, verb: string) => `gd:o:${id}:${verb}`;
const deadline = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });

/** `gd:o:12:q:2` → pre-order 12, verb "q", argument 2. */
export function parsePreorderAction(data: string | undefined): { readonly id: number; readonly verb: string; readonly argument: number | null } | null {
  const match = /^gd:o:(\d{1,12}):(q|pp|site|k|ok|no|paid|void)(?::(\d{1,2}))?$/.exec(data ?? "");
  if (!match) return null;
  return { id: Number(match[1]), verb: match[2]!, argument: match[3] === undefined ? null : Number(match[3]) };
}

const CLOSED = "Questo pre-ordine non è aperto: i pezzi sono finiti oppure è già in vendita sul sito.";

async function findOpen(context: PreorderContext, slug: string): Promise<Product | null> {
  const product = (await context.loadProducts()).find((candidate) => candidate.slug === slug);
  return preorderOpen(product) && piecesOffered(product) > 0 ? product : null;
}

/** "/start pre-<slug>": the product, what is left of it, and how many the buyer wants. */
export async function startPreorder(context: PreorderContext, chat: { readonly id: string; readonly username: string | null }, slug: string): Promise<string> {
  const product = await findOpen(context, slug);
  if (!product) {
    await context.telegram.sendText(chat.id, CLOSED);
    return "preorder-closed";
  }
  const { store, newCode } = context.preorders;
  const preorder = await store.open({ code: newCode(), chatId: chat.id, username: chat.username, slug, productName: product.name });
  const offered = piecesOffered(product);
  const lines = [
    "PRE-ORDINE // solo sul canale",
    `<b>${escapeTelegram(product.name)}</b>`,
    `<b>${euro(product.price.amount)}</b>${product.availableQuantity === undefined ? "" : ` · ${pieces(product.availableQuantity)} rimasti`}`,
    escapeTelegram(preorderDelivery(product.releasePreorder)),
    "",
    "Quanti ne vuoi?",
  ];
  const quantities = Array.from({ length: offered }, (_, index) => ({ text: String(index + 1), callback_data: action(preorder.id, `q:${index + 1}`) }));
  await context.telegram.sendText(chat.id, lines.join("\n"), [quantities, [{ text: "Annulla", callback_data: action(preorder.id, "no") }]]);
  return "preorder-start";
}

function summary(preorder: Preorder): string[] {
  const lines = [`${preorder.quantity} × ${escapeTelegram(preorder.productName)}: <b>${euro(preorder.unitCents * preorder.quantity)}</b>`];
  lines.push(`Spedizione InPost Locker: ${preorder.shippingCents === 0 ? "gratis" : euro(preorder.shippingCents)}`);
  lines.push(`Totale: <b>${euro(preorder.totalCents)}</b>`);
  return lines;
}

function ownerCard(preorder: Preorder, title: string): string {
  return [
    `${title} // ${preorder.code}`,
    ...summary(preorder),
    "",
    `${escapeTelegram(preorder.buyerName ?? "?")}${preorder.username ? ` · @${escapeTelegram(preorder.username)}` : ""}`,
    `${escapeTelegram(preorder.email ?? "?")} · ${escapeTelegram(preorder.phone ?? "?")}`,
    `Locker: ${escapeTelegram(preorder.locker?.label ?? "?")}`,
  ].join("\n");
}

/** A tap on one of the pre-order buttons: the answer to show over it, or null if it is not one. */
export async function preorderTap(context: PreorderContext, tap: { readonly from: string; readonly data: string | undefined; readonly messageId: number | null }): Promise<string | null> {
  const parsed = parsePreorderAction(tap.data);
  if (!parsed) return null;
  const { store, paypalHandle } = context.preorders;
  const { telegram } = context;
  const preorder = await store.get(parsed.id);
  if (!preorder) return "Pre-ordine non trovato.";

  // The owner's two answers to a reservation waiting for its payment.
  if (parsed.verb === "paid" || parsed.verb === "void") {
    if (tap.from !== context.ownerChatId) return "Solo il proprietario può farlo.";
    const clear = async () => {
      if (tap.messageId !== null) await telegram.setKeyboard(context.ownerChatId, tap.messageId, []);
    };
    if (parsed.verb === "paid") {
      if (preorder.status === "expired") {
        // Paid after the 24 hours: the pieces went back, so they are taken again if any are left.
        if ((await store.hold(preorder.slug, preorder.quantity)) === null) return "Scaduto, e i pezzi non ci sono più: rimborsalo o aggiungi pezzi.";
        if (!(await store.move(preorder.id, "expired", "paid"))) {
          await store.hold(preorder.slug, -preorder.quantity);
          return "Già gestito.";
        }
      } else if (!(await store.move(preorder.id, "awaiting_payment", "paid"))) {
        return "Già gestito.";
      }
      await clear();
      await telegram.sendText(preorder.chatId, `Pagamento ricevuto. ${preorder.quantity} × <b>${escapeTelegram(preorder.productName)}</b> è tuo: ti scrivo qui quando parte.\nCodice: ${preorder.code}`);
      return "Segnato come pagato.";
    }
    const from = preorder.status === "paid" ? "paid" : "awaiting_payment";
    if (!(await store.move(preorder.id, from, "cancelled"))) return "Già gestito.";
    await store.hold(preorder.slug, -preorder.quantity);
    await clear();
    await telegram.sendText(preorder.chatId, `Il pre-ordine ${preorder.code} è stato annullato dal negozio. Se avevi già pagato, ti rimborsiamo.`);
    return from === "paid" ? "Annullato: ricordati il rimborso su PayPal." : "Annullato, pezzi liberati.";
  }

  // Everything else is the buyer filling in his own pre-order.
  if (tap.from !== preorder.chatId) return "Questo pre-ordine non è tuo.";
  if (preorder.status !== "collecting") return "Questo pre-ordine è già chiuso: riparti dal post sul canale.";

  if (parsed.verb === "no") {
    await store.move(preorder.id, "collecting", "cancelled");
    await telegram.sendText(preorder.chatId, "Annullato. Niente è stato riservato.");
    return "Annullato.";
  }

  const product = await findOpen(context, preorder.slug);
  if (!product) {
    await store.move(preorder.id, "collecting", "cancelled");
    await telegram.sendText(preorder.chatId, CLOSED);
    return "Pre-ordine chiuso.";
  }

  if (parsed.verb === "q") {
    const quantity = parsed.argument ?? 0;
    if (quantity < 1 || quantity > piecesOffered(product)) return `Ne restano ${piecesOffered(product)}.`;
    const totals = preorderTotals(product, quantity);
    const next: Preorder = {
      ...preorder,
      quantity,
      unitCents: product.price.amount,
      shippingCents: totals?.shippingCents ?? 0,
      totalCents: totals?.totalCents ?? product.price.amount * quantity,
    };
    await store.update(preorder.id, { quantity, unitCents: next.unitCents, shippingCents: next.shippingCents, totalCents: next.totalCents, step: "payment" });
    const ways: InlineKeyboard = [
      ...(totals && paypalHandle ? [[{ text: "PayPal.me", callback_data: action(preorder.id, "pp") }]] : []),
      [{ text: "Carta, PayPal o Revolut sul sito", callback_data: action(preorder.id, "site") }],
      [{ text: "Annulla", callback_data: action(preorder.id, "no") }],
    ];
    const text = totals ? summary(next) : [`${quantity} × ${escapeTelegram(product.name)}: <b>${euro(next.totalCents)}</b>`, "Spedizione: la scegli al checkout."];
    await telegram.sendText(preorder.chatId, [...text, "", "Come vuoi pagare?"].join("\n"), ways);
    return "";
  }

  if (parsed.verb === "site") {
    // Nothing is reserved here: the site's checkout takes the piece when the payment goes through.
    await store.move(preorder.id, "collecting", "cancelled");
    await telegram.sendText(
      preorder.chatId,
      "Ti apro il carrello del sito con il pezzo dentro: scegli il Locker e paghi. Il pezzo è tuo quando il pagamento va a buon fine, non prima.",
      [[{ text: "Apri il checkout", url: shopLink(`/carrello?preordine=${preorder.slug}&q=${preorder.quantity}`) }]],
    );
    return "";
  }

  if (parsed.verb === "pp") {
    if (!paypalHandle || !preorderTotals(product, preorder.quantity)) return "PayPal.me non è disponibile per questo pezzo: usa il sito.";
    await store.update(preorder.id, { step: "name" });
    await telegram.sendText(
      preorder.chatId,
      "Per spedirti il pezzo mi servono quattro dati, usati solo per questo (informativa: geardropshop.it/legale/privacy).\n\n1/4 · Nome e cognome?",
    );
    return "";
  }

  if (parsed.verb === "k") {
    const locker = preorder.lockerOptions[parsed.argument ?? -1];
    if (!locker) return "Scegli uno dei Locker in elenco.";
    await store.update(preorder.id, { locker, step: "confirm" });
    await telegram.sendText(
      preorder.chatId,
      [...summary(preorder), `Ritiro: ${escapeTelegram(locker.label)}`, "", `Confermi? I pezzi restano tuoi per ${HOLD_HOURS} ore, in attesa del pagamento.`].join("\n"),
      [
        [
          { text: "Conferma", callback_data: action(preorder.id, "ok") },
          { text: "Annulla", callback_data: action(preorder.id, "no") },
        ],
      ],
    );
    return "";
  }

  // "ok": the pieces are taken and the payment asked for.
  if (preorder.step !== "confirm" || !preorder.buyerName || !preorder.email || !preorder.phone || !preorder.locker || !paypalHandle) {
    return "Mancano ancora dei dati: riparti dal post sul canale.";
  }
  const totals = preorderTotals(product, preorder.quantity);
  if (!totals) return "PayPal.me non è disponibile per questo pezzo: usa il sito.";
  const waiting = (await store.list(["awaiting_payment"])).some((other) => other.chatId === preorder.chatId);
  if (waiting) return "Hai già un pre-ordine in attesa di pagamento: paga quello, o aspetta che scada.";
  if ((await store.hold(preorder.slug, preorder.quantity)) === null) {
    await store.move(preorder.id, "collecting", "cancelled");
    await telegram.sendText(preorder.chatId, `Nel frattempo i pezzi sono finiti: non ne restano ${preorder.quantity}. Niente è stato riservato.`);
    return "Pezzi finiti.";
  }
  const expiresAt = new Date(context.now().getTime() + HOLD_HOURS * 3_600_000).toISOString();
  // The price of this moment is the price of the pre-order, whatever was shown a few messages ago.
  const final: Preorder = { ...preorder, ...totals, status: "awaiting_payment", expiresAt };
  if (!(await store.move(preorder.id, "collecting", "awaiting_payment", { unitCents: totals.unitCents, shippingCents: totals.shippingCents, totalCents: totals.totalCents, expiresAt }))) {
    await store.hold(preorder.slug, -preorder.quantity);
    return "Già gestito.";
  }
  await telegram.sendText(
    preorder.chatId,
    [
      `Riservato fino al ${deadline.format(new Date(expiresAt))}.`,
      ...summary(final),
      "",
      `Paga con il tasto qui sotto e scrivi <b>${final.code}</b> nella nota del pagamento. Appena lo vediamo ti confermo qui.`,
    ].join("\n"),
    [[{ text: `Paga ${euro(final.totalCents)} con PayPal`, url: paypalMeUrl(paypalHandle, final.totalCents) }]],
  );
  await telegram.sendText(context.ownerChatId, `${ownerCard(final, "PRE-ORDINE IN ATTESA")}\nScade: ${deadline.format(new Date(expiresAt))}`, [
    [
      { text: "Pagato", callback_data: action(preorder.id, "paid") },
      { text: "Annulla", callback_data: action(preorder.id, "void") },
    ],
  ]);
  return "Riservato.";
}

/** A message from someone who is filling in a pre-order. False when the chat has none open. */
export async function preorderText(context: PreorderContext, chatId: string, text: string): Promise<boolean> {
  const { store, searchLockers } = context.preorders;
  const preorder = await store.collecting(chatId);
  if (!preorder) return false;
  const say = (html: string, keyboard?: InlineKeyboard) => context.telegram.sendText(chatId, html, keyboard);
  /** The same question again, with what was wrong with the answer. */
  const again = async (html: string) => {
    await say(html);
    return true;
  };

  switch (preorder.step) {
    case "name": {
      const buyerName = parseBuyerName(text);
      if (!buyerName) return again("Scrivi nome e cognome, ad esempio: Mario Rossi.");
      await store.update(preorder.id, { buyerName, step: "email" });
      await say("2/4 · Email? (ti arriva lì l'avviso di ritiro)");
      return true;
    }
    case "email": {
      const email = parseEmail(text);
      if (!email) return again("Non sembra un'email: riscrivila, ad esempio nome@esempio.it.");
      await store.update(preorder.id, { email, step: "phone" });
      await say("3/4 · Cellulare? (InPost manda lì il codice di ritiro)");
      return true;
    }
    case "phone": {
      const phone = parsePhone(text);
      if (!phone) return again("Scrivi un cellulare italiano, ad esempio 333 1234567.");
      await store.update(preorder.id, { phone, step: "cap" });
      await say("4/4 · CAP della zona dove vuoi ritirare? Ti propongo i Locker InPost vicini.");
      return true;
    }
    case "cap":
    case "locker": {
      const postalCode = parsePostalCode(text);
      if (!postalCode) return again("Scrivi un CAP di 5 cifre, ad esempio 00185.");
      let lockers: readonly LockerChoice[];
      try {
        lockers = (await searchLockers(postalCode)).slice(0, LOCKERS_SHOWN);
      } catch (error) {
        console.error("[telegram-preorders] lockers:", error instanceof Error ? error.message : error);
        return again("La ricerca dei Locker non risponde: riprova tra poco.");
      }
      if (lockers.length === 0) return again("Nessun Locker per quel CAP: prova con un CAP vicino.");
      await store.update(preorder.id, { lockerOptions: lockers, step: "locker" });
      await say(
        "Scegli il Locker (o scrivi un altro CAP):",
        lockers.map((locker, index) => [{ text: locker.label.slice(0, 60), callback_data: action(preorder.id, `k:${index}`) }]),
      );
      return true;
    }
    default:
      await say("Usa i tasti qui sopra, oppure riparti dal post sul canale.");
      return true;
  }
}

/** Gives back the pieces of reservations nobody paid within the 24 hours, and says so to both sides. */
export async function expirePreorders(context: PreorderContext): Promise<number> {
  const { store } = context.preorders;
  let expired = 0;
  for (const preorder of await store.overdue(context.now())) {
    if (!(await store.move(preorder.id, "awaiting_payment", "expired"))) continue;
    await store.hold(preorder.slug, -preorder.quantity);
    expired += 1;
    await context.telegram.sendText(preorder.chatId, `Il pre-ordine ${preorder.code} è scaduto senza pagamento: i pezzi sono tornati disponibili. Se hai pagato, scrivici qui.`);
    await context.telegram.sendText(context.ownerChatId, ownerCard(preorder, "SCADUTO SENZA PAGAMENTO"), [
      [{ text: "È stato pagato", callback_data: action(preorder.id, "paid") }],
    ]);
  }
  return expired;
}

/** "/preordini": who reserved what, paid or still waiting, in messages short enough for Telegram. */
export async function preorderReport(context: PreorderContext): Promise<readonly string[]> {
  const rows = await context.preorders.store.list(["paid", "awaiting_payment"]);
  if (rows.length === 0) return ["Nessun pre-ordine Telegram aperto."];
  const bySlug = new Map<string, Preorder[]>();
  for (const row of rows) bySlug.set(row.slug, [...(bySlug.get(row.slug) ?? []), row]);

  const blocks: string[] = [];
  for (const group of bySlug.values()) {
    const paid = group.filter((row) => row.status === "paid");
    const waiting = group.filter((row) => row.status === "awaiting_payment");
    const count = (list: readonly Preorder[]) => list.reduce((sum, row) => sum + row.quantity, 0);
    blocks.push(`<b>${escapeTelegram(group[0]!.productName)}</b>\nPagati: ${pieces(count(paid))} · In attesa: ${pieces(count(waiting))}`);
    for (const row of [...paid, ...waiting]) {
      blocks.push(
        [
          `${row.status === "paid" ? "PAGATO" : "IN ATTESA"} · ${row.code} · ${row.quantity} × · ${euro(row.totalCents)}`,
          `${escapeTelegram(row.buyerName ?? "?")}${row.username ? ` · @${escapeTelegram(row.username)}` : ""}`,
          `${escapeTelegram(row.email ?? "?")} · ${escapeTelegram(row.phone ?? "?")}`,
          `Locker: ${escapeTelegram(row.locker?.label ?? "?")}`,
        ].join("\n"),
      );
    }
  }
  const messages: string[] = [];
  for (const block of blocks) {
    const last = messages[messages.length - 1];
    if (last !== undefined && last.length + block.length + 2 <= 3500) messages[messages.length - 1] = `${last}\n\n${block}`;
    else messages.push(block);
  }
  return messages;
}
