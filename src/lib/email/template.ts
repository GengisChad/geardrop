/**
 * The frame and building blocks every GEAR//DROP email shares, in the shop's X-Rail look:
 * void ground, the emblem beside the typeset wordmark, a rail and a sticker in the colour of
 * what the email is about, squared corners and "//" on the buttons.
 *
 * Colour keeps the meaning it has on the site: lime is "subito" (paid, back on the shelf, ready),
 * violet is "in arrivo" (pre-orders, a parcel on its way). Cyan and magenta are seconds only:
 * cyan for plain information, magenta for something that needs a look.
 *
 * Tables and inline styles, because that is what mail clients actually read. The wordmark is live
 * text, so the brand still reads with images off; the emblem is the site's own PNG, loaded from
 * the public site. Web fonts and the split headline are a bonus for the clients that render them
 * (Apple Mail, iOS); everyone else gets the Arial fallback and a plain white title.
 */

import { SELLER } from "@/data/pages";
import { SHOP_EMAIL } from "@/lib/email/resend";
import { PRODUCTION_ORIGIN } from "@/lib/site-url";

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

/** The site's tokens (src/styles/globals.css), the ones an email needs. */
export const EMAIL_COLORS = {
  void: "#07070c",
  surface: "#0e0e15",
  surface2: "#1c1b22",
  /** A raised panel inside the card: callouts, the address. */
  panel: "#15141c",
  line: "#26252e",
  text: "#f3f2f7",
  body: "#d9d8e2",
  muted: "#9b9aa8",
  lime: "#c6ff00",
  violet: "#7a3cff",
  violetSoft: "#bba6ff",
  cyan: "#25d4ff",
  magenta: "#ff2d8a",
} as const;

/** What the email is about, which picks the colour of its rail, sticker and main button. */
export type EmailTone = "now" | "incoming" | "info" | "alert";

const TONES: Readonly<Record<EmailTone, { readonly fill: string; readonly ink: string; readonly link: string }>> = {
  now: { fill: EMAIL_COLORS.lime, ink: EMAIL_COLORS.void, link: EMAIL_COLORS.lime },
  incoming: { fill: EMAIL_COLORS.violet, ink: "#ffffff", link: EMAIL_COLORS.violetSoft },
  info: { fill: EMAIL_COLORS.cyan, ink: EMAIL_COLORS.void, link: EMAIL_COLORS.cyan },
  alert: { fill: EMAIL_COLORS.magenta, ink: "#ffffff", link: EMAIL_COLORS.magenta },
};

/** The emblem cut from public/brand/emblem.png at 96 px with its transparency: 6 KB instead of 1 MB. */
export const EMAIL_EMBLEM = "/email/emblem.png";

const SANS = "Anybody,'Helvetica Neue',Helvetica,Arial,sans-serif";
const MONO = "'JetBrains Mono',Consolas,'Courier New',monospace";
const WORDMARK = "'Chakra Petch','Arial Black',Arial,sans-serif";

export type EmailShellOptions = {
  /** The line the inbox shows next to the subject, before the email is opened. */
  readonly preheader?: string;
  /** The sticker above the title, for example "Ordine GD-FL3NHC8W". */
  readonly kicker?: string;
  readonly subtitle?: string;
  readonly tone?: EmailTone;
  /** "customer" carries the shop links and the seller; "internal" is for the owner and the partner. */
  readonly footer?: "customer" | "internal";
  /** Where the emblem loads from; only a local preview changes it. */
  readonly origin?: string;
};

/* ---------- content blocks ---------- */

/** A paragraph; `html` must already be safe (escape stored text with escapeHtml). */
export function paragraph(html: string, options: { readonly size?: number; readonly top?: number } = {}): string {
  return `<p style="margin:${options.top ?? 0}px 0 16px;font-family:${SANS};font-size:${options.size ?? 16}px;line-height:1.6;color:${EMAIL_COLORS.body}">${html}</p>`;
}

/** The section label, with the ">" prompt the shop's shelves open with. */
export function label(text: string): string {
  return `<p style="margin:28px 0 10px;font-family:${MONO};font-size:12px;line-height:1.2;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:${EMAIL_COLORS.text}"><span style="color:${EMAIL_COLORS.cyan}">&gt;</span>&nbsp;${escapeHtml(text)}</p>`;
}

/** Small print for notes and caveats. */
export function note(html: string): string {
  return `<p style="margin:16px 0 0;font-family:${SANS};font-size:13px;line-height:1.55;color:${EMAIL_COLORS.muted}">${html}</p>`;
}

/** A link in the tone's colour, underlined so it reads as one without colour too. */
export function link(text: string, href: string, tone: EmailTone = "now"): string {
  return `<a href="${escapeHtml(href)}" style="color:${TONES[tone].link};text-decoration:underline;font-weight:bold">${escapeHtml(text)}</a>`;
}

/** The shop's inbox as a link, for "scrivi a …". */
export function shopEmailLink(tone: EmailTone = "now"): string {
  return link(SHOP_EMAIL, `mailto:${SHOP_EMAIL}`, tone);
}

/**
 * The button: squared, in the tone's colour, with the "//" the site's buttons carry. Built as a
 * table so Outlook draws it too.
 */
export function button(text: string, href: string, tone: EmailTone = "now", options: { readonly hint?: string } = {}): string {
  const { fill, ink } = TONES[tone];
  const hint = options.hint
    ? `<p style="margin:8px 0 0;font-family:${SANS};font-size:13px;line-height:1.5;color:${EMAIL_COLORS.muted}">${escapeHtml(options.hint)}</p>`
    : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 4px"><tr><td bgcolor="${fill}" style="background:${fill};border-radius:2px"><a href="${escapeHtml(href)}" style="display:inline-block;padding:15px 26px;font-family:${SANS};font-size:15px;font-weight:800;line-height:1;letter-spacing:0.4px;text-transform:uppercase;color:${ink};text-decoration:none;border-radius:2px"><span style="opacity:0.55">//</span>&nbsp;${escapeHtml(text)}</a></td></tr></table>${hint}`;
}

/** A panel with a rail on its left in the tone's colour; `html` must already be safe. */
export function callout(html: string, tone: EmailTone = "info", heading?: string): string {
  const title = heading
    ? `<p style="margin:0 0 6px;font-family:${SANS};font-size:15px;line-height:1.4;font-weight:800;color:${EMAIL_COLORS.text}">${escapeHtml(heading)}</p>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0;border-collapse:collapse"><tr><td width="3" bgcolor="${TONES[tone].fill}" style="width:3px;background:${TONES[tone].fill};font-size:0;line-height:0">&nbsp;</td><td bgcolor="${EMAIL_COLORS.panel}" style="background:${EMAIL_COLORS.panel};padding:14px 16px;font-family:${SANS};font-size:15px;line-height:1.6;color:${EMAIL_COLORS.body}">${title}${html}</td></tr></table>`;
}

export type EmailItem = { readonly name: string; readonly quantity: number; readonly detail?: string | null };

/** The pieces in a parcel, one per row, with the quantity in mono like the shop's part codes. */
export function itemList(items: readonly EmailItem[]): string {
  const rows = items
    .map(
      (item) => `<tr><td width="44" valign="top" style="width:44px;padding:11px 0;border-top:1px solid ${EMAIL_COLORS.line};font-family:${MONO};font-size:14px;font-weight:bold;line-height:1.45;color:${EMAIL_COLORS.lime}">${item.quantity}&times;</td><td valign="top" style="padding:11px 0;border-top:1px solid ${EMAIL_COLORS.line};font-family:${SANS};font-size:15px;line-height:1.45;color:${EMAIL_COLORS.text}">${escapeHtml(item.name)}${
        item.detail ? `<div style="margin-top:3px;font-size:13px;color:${EMAIL_COLORS.muted}">${escapeHtml(item.detail)}</div>` : ""
      }</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-bottom:1px solid ${EMAIL_COLORS.line}">${rows}</table>`;
}

/** Label / value rows split by a hairline. Values are escaped unless `html` is set. */
export function dataTable(
  rows: ReadonlyArray<readonly [string, string]>,
  options: { readonly html?: boolean; readonly strongLast?: boolean } = {},
): string {
  const cells = rows
    .map(([key, value], index) => {
      const strong = options.strongLast && index === rows.length - 1;
      const style = `padding:11px 0;border-top:1px solid ${EMAIL_COLORS.line};font-family:${SANS};font-size:15px;line-height:1.45;vertical-align:top;${
        strong ? `font-weight:800;color:${EMAIL_COLORS.text};` : `color:${EMAIL_COLORS.body};`
      }`;
      return `<tr><td style="${style}padding-right:16px;${strong ? "" : `color:${EMAIL_COLORS.muted};`}">${escapeHtml(key)}</td><td style="${style}text-align:right;word-break:break-word;overflow-wrap:anywhere">${
        options.html ? value : escapeHtml(value)
      }</td></tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-bottom:1px solid ${EMAIL_COLORS.line}">${cells}</table>`;
}

/** An address or any short block of lines, on the raised panel. */
export function addressPanel(lines: readonly string[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td bgcolor="${EMAIL_COLORS.panel}" style="background:${EMAIL_COLORS.panel};border:1px solid ${EMAIL_COLORS.line};padding:14px 16px;font-family:${SANS};font-size:15px;line-height:1.6;color:${EMAIL_COLORS.text}">${lines
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join("")}</td></tr></table>`;
}

/** The closing line and the shop's name. */
export function signOff(line = "Grazie e buone battaglie!"): string {
  return `<p style="margin:28px 0 0;font-family:${SANS};font-size:15px;line-height:1.5;color:${EMAIL_COLORS.body}">${escapeHtml(line)}<br><span style="font-family:${WORDMARK};font-style:italic;font-weight:bold;color:${EMAIL_COLORS.text}">GEAR<span style="color:${EMAIL_COLORS.lime}">//</span><span style="color:${EMAIL_COLORS.violetSoft}">DROP</span></span></p>`;
}

/* ---------- the frame ---------- */

function footer(kind: "customer" | "internal"): string {
  const muted = `color:${EMAIL_COLORS.muted};text-decoration:none`;
  const footerLink = (text: string, href: string) => `<a href="${href}" style="${muted};white-space:nowrap">${escapeHtml(text)}</a>`;
  const seller = `GEAR//DROP di ${escapeHtml(SELLER.holder)} · P.IVA ${SELLER.vat}`;
  const rows =
    kind === "customer"
      ? [
          `<span style="font-family:${MONO};font-size:11px;letter-spacing:1.5px;text-transform:uppercase">${[
            footerLink("Shop", `${PRODUCTION_ORIGIN}/`),
            footerLink("Il tuo ordine", `${PRODUCTION_ORIGIN}/ordine`),
            footerLink("Resi", `${PRODUCTION_ORIGIN}/assistenza/resi`),
            footerLink("Telegram", "https://t.me/geardropshop"),
          ].join(`&nbsp;&nbsp;<span style="color:${EMAIL_COLORS.lime}">//</span>&nbsp;&nbsp;`)}</span>`,
          seller,
        ]
      : ["Email operativa di GEAR//DROP.", seller];
  return rows.map((row) => `<p style="margin:0 0 8px">${row}</p>`).join("");
}

/** A rail in the tone's colour, broken once like the site's dividers. */
function rail(tone: EmailTone): string {
  const fill = TONES[tone].fill;
  // Percentages, so no cell collapses next to the long one, on a phone as on a desktop.
  const cell = (width: number, colour: string) =>
    `<td width="${width}%" height="3" bgcolor="${colour}" style="width:${width}%;height:3px;background:${colour};font-size:0;line-height:0">&nbsp;</td>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;table-layout:fixed"><tr>${cell(22, fill)}${cell(1, EMAIL_COLORS.void)}${cell(4, fill)}${cell(1, EMAIL_COLORS.void)}${cell(72, EMAIL_COLORS.surface2)}</tr></table>`;
}

/** The frame every GEAR//DROP email shares: wordmark, rail, card with sticker and title, footer. */
export function emailShell(title: string, content: string, options: EmailShellOptions = {}): string {
  const tone = options.tone ?? "now";
  const { fill, ink } = TONES[tone];
  const origin = (options.origin ?? PRODUCTION_ORIGIN).replace(/\/$/, "");
  const preheader = options.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(options.preheader)}${"&nbsp;&zwnj;".repeat(60)}</div>`
    : "";
  const kicker = options.kicker
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px"><tr><td bgcolor="${fill}" style="background:${fill};border:1px solid #ffffff;padding:5px 9px;font-family:${MONO};font-size:11px;line-height:1.2;font-weight:bold;letter-spacing:1.6px;text-transform:uppercase;color:${ink}">${escapeHtml(options.kicker)}</td></tr></table>`
    : "";
  const subtitle = options.subtitle
    ? `<p style="margin:12px 0 0;font-family:${SANS};font-size:16px;line-height:1.5;color:${EMAIL_COLORS.muted}">${escapeHtml(options.subtitle)}</p>`
    : "";

  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapeHtml(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Anybody:wght@400;800&amp;family=Chakra+Petch:ital,wght@1,700&amp;family=JetBrains+Mono:wght@700&amp;display=swap" rel="stylesheet">
<style>
:root { color-scheme: dark; supported-color-schemes: dark; }
@media (max-width: 620px) {
  .gd-pad { padding-left: 20px !important; padding-right: 20px !important; }
  .gd-title { font-size: 26px !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background:${EMAIL_COLORS.void};-webkit-text-size-adjust:100%">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${EMAIL_COLORS.void}" style="background:${EMAIL_COLORS.void}">
  <tr><td align="center" style="padding:28px 12px 40px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
      <tr><td style="padding:0 0 18px">
        <a href="${PRODUCTION_ORIGIN}/" style="text-decoration:none"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="middle" style="padding-right:10px"><img src="${origin}${EMAIL_EMBLEM}" width="40" height="40" alt="" style="display:block;width:40px;height:40px;border:0;outline:none"></td>
          <td valign="middle" style="font-family:${WORDMARK};font-size:24px;line-height:1;font-style:italic;font-weight:bold;letter-spacing:0.5px;color:${EMAIL_COLORS.text}">GEAR<span style="color:${EMAIL_COLORS.lime}">//</span><span style="color:${EMAIL_COLORS.violetSoft}">DROP</span></td>
        </tr></table></a>
      </td></tr>
      <tr><td>${rail(tone)}</td></tr>
      <tr><td class="gd-pad" bgcolor="${EMAIL_COLORS.surface}" style="background:${EMAIL_COLORS.surface};border:1px solid ${EMAIL_COLORS.surface2};border-top:0;border-bottom:0;padding:32px 36px 8px">
        ${kicker}<h1 class="gd-title" style="margin:0;font-family:${SANS};font-size:30px;line-height:1.12;font-weight:800;letter-spacing:-0.3px;color:${EMAIL_COLORS.text};text-shadow:-2px 0 rgba(37,212,255,0.55),2px 0 rgba(255,45,138,0.55)">${escapeHtml(title)}</h1>${subtitle}
      </td></tr>
      <tr><td class="gd-pad" bgcolor="${EMAIL_COLORS.surface}" style="background:${EMAIL_COLORS.surface};border:1px solid ${EMAIL_COLORS.surface2};border-top:0;padding:24px 36px 36px;font-family:${SANS};font-size:16px;line-height:1.6;color:${EMAIL_COLORS.body}">
        ${content}
      </td></tr>
      <tr><td class="gd-pad" align="center" style="padding:24px 36px 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${EMAIL_COLORS.muted}">
        ${footer(options.footer ?? "customer")}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
