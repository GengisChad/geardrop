import { hiddenFromShop, shopView } from "@/lib/commerce/channel-only";
import type { BladeType, Product } from "@/lib/commerce/types";
import { formatPrice } from "@/lib/format";
import { monthLabel } from "@/lib/meta/types";
import { escapeTelegram, shopLink, type InlineKeyboard } from "./messages";

/**
 * «Che bey compro?» (owner, 2026-11-27): three questions in the bot's chat (how you play, how much
 * you spend, whether you have a launcher) and one build to buy now, backed by the month's tier list
 * of the shop (/meta): the best-placed blade the shop sells that fits the answers, the piece that
 * completes the combo the podiums use, a launcher if needed, and one button with all of it in the
 * cart.
 *
 * The answers travel in the buttons themselves (gd:b:<answers>), so the bot keeps nothing about
 * whoever asks. The text never names where the podium data comes from: it says "sui podi".
 */

export const ADVISOR_ACTION = "gd:b:";

export type AdvisorRanking = {
  readonly tierType: string;
  readonly rank: number;
  readonly pieceName: string;
  /** The shop's product that holds this piece, when the tier list links one. */
  readonly productSlug: string | null;
  /** For a blade, the combo it wins with ("1-60 Hexa"). */
  readonly archetype: string;
};

export type AdvisorMeta = { readonly month: string; readonly rankings: readonly AdvisorRanking[] };

const STYLES = { a: "attacco", d: "difesa", s: "stamina", x: null } as const satisfies Record<string, BladeType | null>;
const BUDGETS = { "1": 2500, "2": 5000, "3": null } as const;
type Style = keyof typeof STYLES;
type Budget = keyof typeof BUDGETS;
type Answers = { readonly style?: Style; readonly budget?: Budget; readonly needsLauncher?: boolean };

/** A tap on one of the advisor's buttons: the answers so far. */
export function parseAdvisorAction(data: string | undefined): Answers | null {
  const match = /^gd:b:(?:([adsx])(?:([123])([yn])?)?)?$/.exec(data ?? "");
  if (!match) return null;
  const [, style, budget, launcher] = match;
  return { ...(style ? { style: style as Style } : {}), ...(budget ? { budget: budget as Budget } : {}), ...(launcher ? { needsLauncher: launcher === "n" } : {}) };
}

const code = (answers: Answers) => `${ADVISOR_ACTION}${answers.style ?? ""}${answers.budget ?? ""}`;

export type AdvisorMessage = { readonly text: string; readonly keyboard: InlineKeyboard };

/** The next question, or null once the three answers are in. */
export function advisorQuestion(answers: Answers): AdvisorMessage | null {
  if (!answers.style) {
    return {
      text: "<b>CHE BEY COMPRO? //</b> 1 di 3\nCome vuoi giocare?",
      keyboard: [
        [{ text: "Attacco", callback_data: `${ADVISOR_ACTION}a` }, { text: "Difesa", callback_data: `${ADVISOR_ACTION}d` }],
        [{ text: "Stamina", callback_data: `${ADVISOR_ACTION}s` }, { text: "Non so, il più forte", callback_data: `${ADVISOR_ACTION}x` }],
      ],
    };
  }
  if (!answers.budget) {
    return {
      text: "<b>CHE BEY COMPRO? //</b> 2 di 3\nQuanto vuoi spendere in tutto?",
      keyboard: [[
        { text: "Fino a 25 €", callback_data: `${code(answers)}1` },
        { text: "Fino a 50 €", callback_data: `${code(answers)}2` },
        { text: "Di più", callback_data: `${code(answers)}3` },
      ]],
    };
  }
  if (answers.needsLauncher === undefined) {
    return {
      text: "<b>CHE BEY COMPRO? //</b> 3 di 3\nHai già un lanciatore?",
      keyboard: [[{ text: "Sì, ce l'ho", callback_data: `${code(answers)}y` }, { text: "No, mi serve", callback_data: `${code(answers)}n` }]],
    };
  }
  return null;
}

/** Codes the shop's names end with ("…1-60R"): the bit each tier-list name stands for. */
const BIT_CODES: Readonly<Record<string, string>> = {
  accel: "a", ball: "b", cyclone: "c", "disk ball": "db", elevate: "e", "free ball": "fb", "gear ball": "gb", "gear flat": "gf", "gear point": "gp",
  glide: "g", hexa: "h", kick: "k", level: "l", "low flat": "lf", "low orb": "lo", "low rush": "lr", "low point": "lp", narrow: "n", needle: "n",
  orb: "o", point: "p", quake: "q", rush: "r", spike: "s", taper: "t", unite: "u", wedge: "w", "flat": "f", "rubber accel": "ra", merge: "m", vortex: "v",
};

/** "wand-wizard-1-60r" → { ratchet: "1-60", bit: "r" }: what the product already has. */
function partsOf(slug: string): { readonly ratchet: string; readonly bit: string } | null {
  const match = /(\d)-(\d{2})([a-z]+)$/.exec(slug);
  return match ? { ratchet: `${match[1]}-${match[2]}`, bit: match[3]! } : null;
}

/** "1-60 Hexa" → { ratchet: "1-60", bit: "Hexa" }. */
function comboOf(archetype: string): { readonly ratchet: string | null; readonly bit: string | null } {
  const ratchet = /\b\d-\d{2}\b/.exec(archetype)?.[0] ?? null;
  const bit = archetype.replace(/\b\d-\d{2}\b/, "").replace(/\s+/g, " ").trim();
  return { ratchet, bit: bit && /^[\p{L} ]{2,30}$/u.test(bit) ? bit : null };
}

export type AdvisorBuild = {
  readonly blade: AdvisorRanking;
  readonly main: Product;
  /** The products that bring the combo's ratchet or bit, with which one each brings. */
  readonly parts: readonly { readonly product: Product; readonly piece: string }[];
  readonly launcher: Product | null;
  readonly totalCents: number;
};

const sellable = (product: Product) => product.stock !== "esaurito";

/** The build for three answers, or null when nothing on the shelf fits them today. */
export function pickBuild(answers: Required<Answers>, catalogue: readonly Product[], meta: AdvisorMeta): AdvisorBuild | null {
  const shelf = new Map<string, Product>(catalogue.filter((product) => !hiddenFromShop(product)).map((product) => [product.slug, shopView(product)]));
  const cap = BUDGETS[answers.budget] ?? Number.POSITIVE_INFINITY;
  const launcher = answers.needsLauncher
    ? [...shelf.values()].filter((product) => product.category === "lanciatori" && sellable(product) && !product.bundleOf).sort((a, b) => a.price.amount - b.price.amount)[0] ?? null
    : null;
  if (answers.needsLauncher && !launcher) return null;
  const room = cap - (launcher?.price.amount ?? 0);
  const style = STYLES[answers.style];
  const ranked = (tier: string) => meta.rankings.filter((row) => row.tierType === tier).sort((a, b) => a.rank - b.rank);

  for (const blade of ranked("blade")) {
    const main = blade.productSlug ? shelf.get(blade.productSlug) : undefined;
    if (!main || !sellable(main) || main.category !== "beyblade-x") continue;
    if (style && main.bladeType !== style) continue;
    if (main.price.amount > room) continue;

    // The combo the podiums use: the pieces the main product lacks, from the product that holds them.
    const has = partsOf(main.slug);
    const combo = comboOf(blade.archetype);
    const wanted = [
      combo.ratchet && has?.ratchet !== combo.ratchet ? { tier: "ratchet", piece: combo.ratchet } : null,
      combo.bit && (!has || BIT_CODES[combo.bit.toLowerCase()] !== has.bit) ? { tier: "bit", piece: combo.bit } : null,
    ].filter((item): item is { tier: string; piece: string } => item !== null);
    let spent = main.price.amount;
    const parts: { product: Product; piece: string }[] = [];
    for (const need of wanted) {
      const row = ranked(need.tier).find((item) => item.pieceName.toLowerCase() === need.piece.toLowerCase());
      const donor = row?.productSlug ? shelf.get(row.productSlug) : undefined;
      if (!donor || !sellable(donor) || donor.slug === main.slug) continue;
      const already = parts.find((part) => part.product.slug === donor.slug);
      if (already) {
        parts[parts.indexOf(already)] = { product: donor, piece: `${already.piece} e ${need.piece}` };
        continue;
      }
      if (spent + donor.price.amount > room) continue;
      spent += donor.price.amount;
      parts.push({ product: donor, piece: need.piece });
    }
    return { blade, main, parts, launcher, totalCents: spent + (launcher?.price.amount ?? 0) };
  }
  return null;
}

const euro = (cents: number) => formatPrice({ amount: cents, currency: "EUR" });
const line = (product: Product) => `<b>${escapeTelegram(product.name)}</b> · ${euro(product.price.amount)}`;
const restart: InlineKeyboard = [[{ text: "Rifai le domande", callback_data: ADVISOR_ACTION }]];

/** What the bot answers after the third question. */
export function advisorResult(answers: Required<Answers>, catalogue: readonly Product[], meta: AdvisorMeta | null): AdvisorMessage {
  const build = meta ? pickBuild(answers, catalogue, meta) : null;
  if (!meta || !build) {
    return {
      text: "Con queste risposte oggi non ho un pezzo da podio disponibile. Prova con un budget più alto o con «Non so, il più forte».",
      keyboard: [...restart, [{ text: "Guarda lo shop", url: shopLink("/negozio") }]],
    };
  }
  const month = monthLabel(meta.month).replace(/\s\d{4}$/, "");
  const combo = comboOf(build.blade.archetype);
  const comboText = combo.ratchet || combo.bit ? `, quasi sempre montata ${escapeTelegram([combo.ratchet, combo.bit].filter(Boolean).join(" "))}` : "";
  const slugs = [build.main, ...build.parts.map((part) => part.product), ...(build.launcher ? [build.launcher] : [])].map((product) => product.slug);
  const text = [
    "<b>LA MIA SCELTA //</b>",
    line(build.main),
    `La sua lama è la n. ${build.blade.rank} sui podi di ${month}${comboText}.`,
    ...build.parts.map((part) => `+ ${line(part.product)}\n  per ${escapeTelegram(part.piece)}`),
    ...(build.launcher ? [`+ ${line(build.launcher)}\n  per lanciarla`] : []),
    "",
    `Totale <b>${euro(build.totalCents)}</b>`,
  ].join("\n");
  return {
    text,
    keyboard: [[{ text: slugs.length > 1 ? "Metti tutto nel carrello" : "Mettila nel carrello", url: shopLink(`/carrello?aggiungi=${slugs.join(",")}`) }], ...restart],
  };
}
