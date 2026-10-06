/**
 * Reads Vinted's "Hai venduto un articolo su Vinted" email.
 *
 * The email (2026-10-06, two real samples) says who bought, the title the seller gave the
 * listing — or "Set di N articoli" when the buyer took several listings in one order, without
 * naming them — and the amount as "24.00". It carries no order number in its text, so the
 * Resend email id is what makes a delivery unique.
 */

export const VINTED_SALE_SUBJECT = "Hai venduto un articolo su Vinted";

export type VintedSaleEmail = {
  readonly buyerUsername: string;
  readonly listingTitle: string;
  /** 1 for a single listing; N for "Set di N articoli", whose pieces the email does not name. */
  readonly itemCount: number;
  readonly amountCents: number;
};

const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", euro: "€", rsquo: "’", lsquo: "‘",
  egrave: "è", eacute: "é", agrave: "à", igrave: "ì", ograve: "ò", ugrave: "ù", Egrave: "È",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1]?.toLowerCase() === "x" ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name] ?? whole;
  });
}

/** Resend may hand the HTML back as a data URI ("html_format": "data_uri"). */
export function decodeHtmlField(html: string): string {
  const match = /^data:([^,]*?),(.*)$/s.exec(html.trim());
  if (!match) return html;
  const meta = match[1] ?? "";
  const payload = match[2] ?? "";
  return meta.endsWith(";base64") ? Buffer.from(payload, "base64").toString("utf8") : decodeURIComponent(payload);
}

/** Plain text out of an email's HTML, one visual line per line. */
export function htmlToText(html: string): string {
  const body = decodeHtmlField(html)
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|td|th|li|h[1-6]|table|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(body)
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function isVintedSaleEmail(subject: string, text: string): boolean {
  const normalized = `${subject}\n${text}`.toLowerCase();
  return normalized.includes(VINTED_SALE_SUBJECT.toLowerCase()) && /\bha comprato\b/.test(normalized);
}

/** "24.00", "24,00", "1.024,50", "€ 9,99" → cents. */
export function parseAmountCents(raw: string): number | null {
  const compact = raw.replace(/[€\s]|EUR/gi, "");
  const match = /^(\d{1,3}(?:[.,]\d{3})*|\d+)[.,](\d{2})$/.exec(compact);
  if (!match) return null;
  const units = Number.parseInt((match[1] ?? "").replace(/[.,]/g, ""), 10);
  return Number.isFinite(units) ? units * 100 + Number.parseInt(match[2] ?? "0", 10) : null;
}

/**
 * The sale out of the email's text, or null when the text does not read like one. The layout is
 * "<buyer> ha comprato [badge] <title> [icon] <amount>", one block per line in the samples; the
 * reader joins the lines so the same pattern holds if Vinted puts them on one line.
 */
export function parseVintedSaleEmail(subject: string, text: string): VintedSaleEmail | null {
  if (!isVintedSaleEmail(subject, text)) return null;
  const flat = text.replace(/\s+/g, " ").trim();
  const sale = /(\S+) ha comprato (?:\d{1,2} (?=Set di \d))?(.+?) (?:[!€] )?(?:€ ?)?(\d{1,6}[.,]\d{2})(?: ?€| EUR)?(?: |$)/i.exec(flat);
  if (!sale) return null;

  const buyerUsername = (sale[1] ?? "").replace(/[,;:]$/, "");
  const listingTitle = (sale[2] ?? "").replace(/\s*[!€]\s*$/, "").trim();
  const amountCents = parseAmountCents(sale[3] ?? "");
  if (!listingTitle || amountCents === null) return null;

  const set = /^Set di (\d{1,2}) articoli$/i.exec(listingTitle);
  return {
    buyerUsername,
    listingTitle,
    itemCount: set ? Math.max(1, Number.parseInt(set[1] ?? "1", 10)) : 1,
    amountCents,
  };
}
