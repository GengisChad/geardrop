import { CONSIGNMENT_PARTNER, partnerLines, PRODUCTS } from "@/data/catalog";
import { formatPrice } from "@/lib/format";
import { SHOP_EMAIL } from "@/lib/email/resend";
import {
  addressPanel,
  button,
  callout,
  EMAIL_COLORS,
  emailShell,
  escapeHtml,
  label,
  link,
  note,
  paragraph,
  shopEmailLink,
  signOff,
} from "@/lib/email/template";
import { deliveryClause, preorderDelivery } from "@/lib/labels";
import { PRODUCTION_ORIGIN } from "@/lib/site-url";
import type { LowStockProduct } from "./process-paid-checkout";
import type { PaidCheckout } from "./stripe-order";

/**
 * Emails for a paid order: the owner's notification carries everything needed to pack and
 * ship without opening another tool; the buyer's confirmation repeats what they bought.
 * The frame and blocks are the shop's email template (lib/email/template.ts).
 */

/** Kept here too: the order emails were the first to need them, and callers still import them from here. */
export { emailShell, escapeHtml };

export type RecordedOrder = {
  readonly id: number;
  readonly orderNumber: string;
  /** Pre-ordered units per checkout line, in line order; absent when unknown. */
  readonly preorderQuantities?: readonly number[];
};

const euro = (cents: number) => formatPrice({ amount: cents, currency: "EUR" });

const PRODUCT_NAME = new Map(PRODUCTS.map((product) => [product.slug as string, product.name]));

/** What to pack for a bundle line: every pack it ships, times the bundle quantity. */
function packingList(line: PaidCheckout["lines"][number]): string | null {
  if (!line.components?.length) return null;
  return line.components.map((part) => `${part.quantity * line.quantity} × ${PRODUCT_NAME.get(part.slug) ?? part.slug}`).join(" + ");
}

const dateFormatter = new Intl.DateTimeFormat("it-IT", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Europe/Rome",
});

function addressBlock(checkout: PaidCheckout): readonly string[] {
  const { shipping } = checkout;
  const place = [shipping.postalCode, shipping.city, shipping.province ? `(${shipping.province})` : ""].filter(Boolean).join(" ");
  // Which carrier, and for a pickup method the point itself: what the parcel is booked on.
  // Carrier-aware: derive label from the method code stored in the shipping snapshot.
  const pickupLabel = (() => {
    if (!shipping.pickupPoint) return "";
    const method = shipping.method ?? "";
    if (method.startsWith("poste")) return `Punto di ritiro Poste: ${shipping.pickupPoint}`;
    if (method.startsWith("inpost")) return `Punto InPost: ${shipping.pickupPoint}`;
    return `Punto di ritiro: ${shipping.pickupPoint}`;
  })();
  const carrier = [
    shipping.methodLabel ? `Spedizione: ${shipping.methodLabel}` : "",
    pickupLabel,
  ];
  return [shipping.name, shipping.address, place, shipping.country, ...carrier].filter(Boolean);
}

type Audience = "owner" | "buyer";

/** What a line says about pieces that were not on the shelf, or null when it ships in full. */
function preorderLine(checkout: PaidCheckout, order: RecordedOrder, index: number, audience: Audience): string | null {
  const line = checkout.lines[index]!;
  const units = order.preorderQuantities?.[index] ?? 0;
  if (units <= 0) return null;
  const which = units >= line.quantity ? "PRE-ORDINE" : `PRE-ORDINE: ${units} di ${line.quantity}`;
  if (audience === "buyer") return `${which} · ${deliveryClause(preorderDelivery(line.releasePreorder))}`;
  const announced = checkout.announcedPreorder?.[line.slug] ?? 0;
  const surprise =
    units > announced
      ? " Il cliente non ha visto l'avviso di pre-ordine: il pezzo è finito mentre pagava, avvisalo tu."
      : "";
  return `${which} · non era a magazzino, da riordinare.${surprise}`;
}

/** The lines that wait for stock, as "1 × Glory Valkerion LF", for the owner's summary box. */
export function preorderSummary(checkout: PaidCheckout, order: RecordedOrder): readonly string[] {
  return checkout.lines.flatMap((line, index) => {
    const units = order.preorderQuantities?.[index] ?? 0;
    return units > 0 ? [`${units} × ${line.name}`] : [];
  });
}

function subtotalCents(checkout: PaidCheckout): number {
  return checkout.lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0);
}

const CELL = `font-family:Anybody,'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.45;vertical-align:top`;
const MONO_CELL = `font-family:'JetBrains Mono',Consolas,'Courier New',monospace;font-size:14px;font-weight:bold;line-height:1.45;vertical-align:top`;

function linesTable(checkout: PaidCheckout, order: RecordedOrder, audience: Audience): string {
  const rule = `border-top:1px solid ${EMAIL_COLORS.line}`;
  const rows = checkout.lines
    .map((line, index) => {
      const packing = packingList(line);
      const preorder = preorderLine(checkout, order, index, audience);
      return `<tr>
        <td width="44" style="width:44px;padding:11px 0;${rule};${MONO_CELL};color:${preorder ? EMAIL_COLORS.violetSoft : EMAIL_COLORS.lime}">${line.quantity}&times;</td>
        <td style="padding:11px 12px 11px 0;${rule};${CELL};color:${EMAIL_COLORS.text}">${escapeHtml(line.name)}${
          packing ? `<div style="margin-top:3px;font-size:13px;color:${EMAIL_COLORS.muted}">Da spedire: ${escapeHtml(packing)}</div>` : ""
        }${
          preorder
            ? `<div style="margin-top:4px;font-family:'JetBrains Mono',Consolas,'Courier New',monospace;font-size:12px;font-weight:bold;letter-spacing:0.4px;color:${EMAIL_COLORS.violetSoft}">${escapeHtml(preorder)}</div>`
            : ""
        }</td>
        <td style="padding:11px 0;${rule};${CELL};color:${EMAIL_COLORS.text};text-align:right;white-space:nowrap">${euro(line.quantity * line.unitPriceCents)}</td>
      </tr>`;
    })
    .join("");
  const total = (name: string, value: string, options: { readonly strong?: boolean; readonly colour?: string; readonly rule?: boolean } = {}) =>
    `<tr><td></td><td style="padding:${options.strong ? "12px" : "6px"} 12px ${options.strong ? "4px" : "6px"} 0;${options.rule ? rule + ";" : ""}${CELL};color:${options.strong ? EMAIL_COLORS.text : EMAIL_COLORS.muted};${options.strong ? "font-weight:800;" : ""}">${escapeHtml(name)}</td><td style="padding:${options.strong ? "12px" : "6px"} 0 ${options.strong ? "4px" : "6px"};${options.rule ? rule + ";" : ""}${CELL};text-align:right;white-space:nowrap;color:${options.colour ?? EMAIL_COLORS.text};${options.strong ? "font-size:18px;font-weight:800;" : ""}">${value}</td></tr>`;
  const discountLabel = checkout.couponCode ? `Sconto (${checkout.couponCode})` : "Sconto";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
    ${rows}
    ${total("Subtotale", euro(subtotalCents(checkout)), { rule: true })}
    ${checkout.discountCents > 0 ? total(discountLabel, `-${euro(checkout.discountCents)}`, { colour: EMAIL_COLORS.lime }) : ""}
    ${total("Spedizione", checkout.shippingCents === 0 ? "Gratuita" : euro(checkout.shippingCents))}
    ${total("Totale pagato", euro(checkout.totalCents), { strong: true, rule: true })}
  </table>`;
}

/** Returns true when the shipping address looks empty (e.g. a recovery-link session). */
function isAddressMissing(checkout: PaidCheckout): boolean {
  return !checkout.shipping.address && !checkout.shipping.city && !checkout.shipping.postalCode;
}

/** One line per low-stock product for the owner alert box. */
function lowStockLine(item: LowStockProduct): string {
  if (item.stockQuantity === 0) return `${escapeHtml(item.name)} — finito, ora in pre-ordine`;
  return `${escapeHtml(item.name)} — ne resta ${item.stockQuantity}`;
}

export function ownerOrderEmail(
  checkout: PaidCheckout,
  order: RecordedOrder,
  lowStockItems: readonly LowStockProduct[] = [],
  partnerEmailStatus: "sent" | "not_applicable" | "not_configured" | "failed" = "not_applicable",
) {
  const address = addressBlock(checkout);
  const adminUrl = `${PRODUCTION_ORIGIN}/admin/ordini/${order.id}`;
  const stripeUrl = checkout.paymentIntentId ? `https://dashboard.stripe.com/payments/${checkout.paymentIntentId}` : null;
  const when = dateFormatter.format(new Date(checkout.createdAt));
  const preordered = preorderSummary(checkout, order);
  // What the buyer was told, in their own words: an unreleased drop waits for the release.
  const waits = [
    ...new Set(
      checkout.lines
        .filter((_line, index) => (order.preorderQuantities?.[index] ?? 0) > 0)
        .map((line) => deliveryClause(preorderDelivery(line.releasePreorder))),
    ),
  ];
  const subject = `${preordered.length ? "[PRE-ORDINE] " : ""}Nuovo ordine ${order.orderNumber} · ${euro(checkout.totalCents)} · ${checkout.shipping.name || checkout.email}`;

  // NerdPoint consignment lines and what to pay them.
  const pLines = partnerLines(checkout.lines);
  const partnerOwedCents = pLines.reduce((sum, l) => sum + l.owed, 0);
  const partnerBoxHtml = pLines.length
    ? callout(
        `<strong style="color:${EMAIL_COLORS.text}">Spedisce ${escapeHtml(CONSIGNMENT_PARTNER.name)}:</strong>
        <ul style="margin:4px 0 0;padding-left:20px">${pLines.map((l) => `<li>${escapeHtml(l.name)} &times; ${l.quantity}</li>`).join("")}</ul>
        <p style="margin:8px 0 0">Da bonificare a ${escapeHtml(CONSIGNMENT_PARTNER.name)}: <strong style="color:${EMAIL_COLORS.text}">${euro(partnerOwedCents)}</strong></p>
        <p style="margin:4px 0 0;font-size:13px;color:${EMAIL_COLORS.muted}">${
          partnerEmailStatus === "sent"
            ? `Email inviata a ${escapeHtml(CONSIGNMENT_PARTNER.name)} con i dettagli di spedizione.`
            : partnerEmailStatus === "failed"
              ? `<span style="color:${EMAIL_COLORS.magenta};font-weight:bold">Email al partner NON inviata: inoltra tu l'ordine a ${escapeHtml(CONSIGNMENT_PARTNER.email)}.</span>`
              : partnerEmailStatus === "not_configured"
                ? `Email non configurata: inoltra tu l'ordine a ${escapeHtml(CONSIGNMENT_PARTNER.email)}.`
                : ""
        }</p>`,
        partnerEmailStatus === "failed" ? "alert" : "info",
      )
    : "";
  const partnerBoxText = pLines.length
    ? [
        "",
        `SPEDISCE ${CONSIGNMENT_PARTNER.name.toUpperCase()}`,
        ...pLines.map((l) => `  ${l.quantity} × ${l.name}`),
        `Da bonificare a ${CONSIGNMENT_PARTNER.name}: ${euro(partnerOwedCents)}`,
        partnerEmailStatus === "sent"
          ? `Email inviata a ${CONSIGNMENT_PARTNER.name}.`
          : `EMAIL AL PARTNER NON INVIATA — inoltra tu l'ordine a ${CONSIGNMENT_PARTNER.email}.`,
      ]
    : [];

  const missingAddress = isAddressMissing(checkout);
  const contact = [
    checkout.phone ? `Tel: <a href="tel:${escapeHtml(checkout.phone)}" style="color:${EMAIL_COLORS.text}">${escapeHtml(checkout.phone)}</a>` : "",
    `Email: <a href="mailto:${escapeHtml(checkout.email)}" style="color:${EMAIL_COLORS.text}">${escapeHtml(checkout.email)}</a>`,
  ]
    .filter(Boolean)
    .map((line) => `<div style="margin-top:4px;font-size:14px;color:${EMAIL_COLORS.muted}">${line}</div>`)
    .join("");
  const html = emailShell(
    `Nuovo ordine ${order.orderNumber}`,
    `${paragraph(`Pagato su Stripe il ${escapeHtml(when)}. Totale <strong style="color:${EMAIL_COLORS.text}">${euro(checkout.totalCents)}</strong>.`)}
    ${missingAddress ? callout(`<strong style="color:${EMAIL_COLORS.text}">Indirizzo di spedizione mancante: contatta il cliente</strong>`, "alert") : ""}
    ${label("Spedire a")}
    ${addressPanel(address.length ? address : ["(indirizzo non pervenuto)"])}
    ${contact}
    ${checkout.notes ? callout(`<strong style="color:${EMAIL_COLORS.text}">Note del cliente:</strong> ${escapeHtml(checkout.notes)}`, "info") : ""}
    ${
      preordered.length
        ? callout(
            `<strong style="color:${EMAIL_COLORS.text}">Contiene un pre-ordine:</strong> ${escapeHtml(preordered.join(", "))}. Al cliente è indicato che ${escapeHtml(waits.join(" · "))}.`,
            "incoming",
          )
        : ""
    }
    ${partnerBoxHtml}
    ${label("Articoli")}
    ${linesTable(checkout, order, "owner")}
    ${
      lowStockItems.length
        ? callout(
            `<strong style="color:${EMAIL_COLORS.text}">Scorte basse:</strong><ul style="margin:4px 0 0;padding-left:20px">${lowStockItems.map((item) => `<li>${lowStockLine(item)}</li>`).join("")}</ul>`,
            "alert",
          )
        : ""
    }
    ${button("Apri l'ordine nel pannello", adminUrl, "now")}
    ${stripeUrl ? `<p style="margin:12px 0 0;font-size:13px">${link("Vedi il pagamento su Stripe", stripeUrl, "info")}</p>` : ""}
    ${note(`Lo stock dei pezzi venduti è già stato scalato sul sito${
      preordered.length ? "; i pezzi in pre-ordine non lo toccano finché non ricarichi il magazzino" : ""
    }.`)}`,
    {
      tone: preordered.length ? "incoming" : "now",
      kicker: `${preordered.length ? "Con pre-ordine" : "Pagato"} · ${euro(checkout.totalCents)}`,
      preheader: `${checkout.shipping.name || checkout.email} · ${checkout.lines.map((line) => `${line.quantity}× ${line.name}`).join(", ")}`,
      footer: "internal",
    },
  );

  const text = [
    `Nuovo ordine ${order.orderNumber} — pagato su Stripe il ${when}`,
    "",
    missingAddress ? "ATTENZIONE: Indirizzo di spedizione mancante: contatta il cliente" : null,
    "SPEDIRE A",
    ...(address.length ? address : ["(indirizzo non pervenuto)"]),
    checkout.phone ? `Tel: ${checkout.phone}` : null,
    `Email: ${checkout.email}`,
    checkout.notes ? `Note del cliente: ${checkout.notes}` : null,
    preordered.length ? `
CONTIENE UN PRE-ORDINE: ${preordered.join(", ")}` : null,
    ...partnerBoxText,
    "",
    "ARTICOLI",
    ...checkout.lines.flatMap((line, index) => [
      `${line.quantity} × ${line.name} — ${euro(line.quantity * line.unitPriceCents)}`,
      ...(packingList(line) ? [`   Da spedire: ${packingList(line)}`] : []),
      ...(preorderLine(checkout, order, index, "owner") ? [`   ${preorderLine(checkout, order, index, "owner")}`] : []),
    ]),
    checkout.discountCents > 0
      ? `Sconto${checkout.couponCode ? ` (${checkout.couponCode})` : ""}: -${euro(checkout.discountCents)}`
      : null,
    `Spedizione: ${checkout.shippingCents === 0 ? "gratuita" : euro(checkout.shippingCents)}`,
    `Totale pagato: ${euro(checkout.totalCents)}`,
    ...(lowStockItems.length
      ? ["", "SCORTE BASSE:", ...lowStockItems.map((item) => `  ${item.name}: ${item.stockQuantity === 0 ? "finito, ora in pre-ordine" : `ne resta ${item.stockQuantity}`}`)]
      : []),
    "",
    `Pannello: ${adminUrl}`,
    stripeUrl ? `Stripe: ${stripeUrl}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return { subject, html, text };
}

/** followUrl: «Segui su Telegram», the bot's signed link for this order (lib/telegram/order-follow.ts). */
export function customerOrderEmail(checkout: PaidCheckout, order: RecordedOrder, followUrl: string | null = null) {
  const address = addressBlock(checkout);
  const subject = `Ordine ${order.orderNumber} confermato · GEAR//DROP`;
  const waitsForStock = (order.preorderQuantities ?? []).some((units) => units > 0);
  const html = emailShell(
    "Grazie, il tuo ordine è confermato",
    `${paragraph(`Abbiamo ricevuto il pagamento dell'ordine <strong style="color:${EMAIL_COLORS.text}">${escapeHtml(order.orderNumber)}</strong>. ${
      waitsForStock ? "I pezzi in pre-ordine partono appena arrivano: ti scriviamo noi." : "Ti scriviamo appena parte il pacco."
    }`)}
    ${followUrl ? button("Segui su Telegram", followUrl, "incoming", { hint: "Ti scriviamo lì quando parte e quando arriva." }) : ""}
    ${label("Il tuo ordine")}
    ${linesTable(checkout, order, "buyer")}
    ${address.length ? `${label("Spedizione a")}${addressPanel(address)}` : ""}
    ${paragraph(`Domande? Rispondi a questa email o scrivi a ${shopEmailLink()} indicando il numero d'ordine.`, { size: 14, top: 24 })}
    ${signOff()}`,
    {
      tone: waitsForStock ? "incoming" : "now",
      kicker: `${waitsForStock ? "Pre-ordine" : "Ordine"} ${order.orderNumber}`,
      preheader: waitsForStock
        ? `Pagamento ricevuto per ${order.orderNumber}: i pezzi in pre-ordine partono appena arrivano.`
        : `Pagamento ricevuto per ${order.orderNumber}: ti scriviamo appena parte il pacco.`,
    },
  );
  const text = [
    `Grazie, il tuo ordine ${order.orderNumber} è confermato.`,
    "",
    ...checkout.lines.flatMap((line, index) => [
      `${line.quantity} × ${line.name} — ${euro(line.quantity * line.unitPriceCents)}`,
      ...(preorderLine(checkout, order, index, "buyer") ? [`   ${preorderLine(checkout, order, index, "buyer")}`] : []),
    ]),
    `Spedizione: ${checkout.shippingCents === 0 ? "gratuita" : euro(checkout.shippingCents)}`,
    `Totale pagato: ${euro(checkout.totalCents)}`,
    "",
    "Spedizione a:",
    ...address,
    "",
    ...(followUrl ? [`Segui l'ordine su Telegram: ${followUrl}`, ""] : []),
    `Domande? Scrivi a ${SHOP_EMAIL} indicando il numero d'ordine.`,
  ].join("\n");
  return { subject, html, text };
}
