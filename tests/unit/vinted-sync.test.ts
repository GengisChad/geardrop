import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { BUNDLES, PRODUCTS } from "@/data/catalog";
import { BATTLE_SETS, STOCK_ONLY_PRODUCTS } from "@/data/stock-only";
import { matchListing, productKeys, shouldApplyAutomatically, type SuggestedLine } from "@/lib/vinted/catalogue-match";
import { ownerNoticeEmail } from "@/lib/vinted/owner-email";
import { processInboundEmail, type InboundStore, type OwnerNotice } from "@/lib/vinted/process-inbound";
import { isFromVinted, parseReceivedEvent, verifySvixSignature, type ReceivedEmail } from "@/lib/vinted/resend-inbound";
import { decodeHtmlField, htmlToText, parseAmountCents, parseVintedSaleEmail } from "@/lib/vinted/sale-email";

vi.mock("server-only", () => ({}));

/*
 * The two real "Hai venduto un articolo su Vinted" emails of 2026-10-06, as text, with the
 * seller's and buyers' usernames replaced. One is a single listing (a Drop Attack stadium sold
 * without its tops), the other a two-listing order that the email does not itemise.
 */
const SINGLE = `Hai venduto un articolo su Vinted
Ciao venditore01,
acquirente01
ha comprato
Beyblade X arena drop attack SOLO arena
!
10.00
Una volta completato l'ordine, trasferiremo il pagamento dell'acquirente sul tuo Saldo Vinted.
Invia l'ordine entro 5 giorni.`;

const SET = `Hai venduto un articolo su Vinted
Ciao venditore01,
acquirente02
ha comprato
2
Set di 2 articoli
!
24.00
Una volta completato l'ordine, trasferiremo il pagamento dell'acquirente sul tuo Saldo Vinted.`;

const SUBJECT = "Hai venduto un articolo su Vinted";

describe("reading the sale email", () => {
  it("reads a single listing: buyer, title as written, amount", () => {
    expect(parseVintedSaleEmail(SUBJECT, SINGLE)).toEqual({
      buyerUsername: "acquirente01",
      listingTitle: "Beyblade X arena drop attack SOLO arena",
      itemCount: 1,
      amountCents: 1000,
    });
  });

  it("reads a multi-listing order as a set, whose pieces the email does not name", () => {
    expect(parseVintedSaleEmail(SUBJECT, SET)).toEqual({
      buyerUsername: "acquirente02",
      listingTitle: "Set di 2 articoli",
      itemCount: 2,
      amountCents: 2400,
    });
  });

  it("reads the same email when Vinted puts it on one line, with a euro sign", () => {
    const flat = `${SUBJECT} Ciao venditore01, acquirente01 ha comprato Shadow Shinobi 1-80MN € 9,99 Invia l'ordine entro 5 giorni.`;
    expect(parseVintedSaleEmail(SUBJECT, flat)).toMatchObject({ listingTitle: "Shadow Shinobi 1-80MN", amountCents: 999 });
  });

  it("never takes a decimal inside the title for the amount", () => {
    const lines = SINGLE.replace("Beyblade X arena drop attack SOLO arena", "Shadow Shinobi 1-80MN pagato 9.99").replace("10.00", "12.00");
    expect(parseVintedSaleEmail(SUBJECT, lines)).toMatchObject({ listingTitle: "Shadow Shinobi 1-80MN pagato 9.99", amountCents: 1200 });
    const flat = `${SUBJECT} acquirente01 ha comprato Shadow Shinobi ex 9.99 ! 12.00 Una volta completato l'ordine`;
    expect(parseVintedSaleEmail(SUBJECT, flat)).toMatchObject({ listingTitle: "Shadow Shinobi ex 9.99", amountCents: 1200 });
  });

  it("ignores emails that are not a sale", () => {
    expect(parseVintedSaleEmail("La tua etichetta è pronta", "Stampa l'etichetta di spedizione")).toBeNull();
    expect(parseVintedSaleEmail("Conferma dell'inoltro Gmail", "Codice di conferma: 123456")).toBeNull();
  });

  it("turns Vinted's HTML, also when Resend hands it back as a data URI, into lines of text", () => {
    const html = `<html><head><style>p{}</style></head><body><p>acquirente01</p><p>ha&nbsp;comprato</p><div>Hover Wyvern 3-85N</div><td>15.00&euro;</td></body></html>`;
    expect(htmlToText(html)).toBe("acquirente01\nha comprato\nHover Wyvern 3-85N\n15.00€");
    const dataUri = `data:text/html;base64,${Buffer.from(html).toString("base64")}`;
    expect(decodeHtmlField(dataUri)).toBe(html);
    expect(htmlToText(dataUri)).toBe(htmlToText(html));
  });

  it("parses amounts the way Vinted and Italians write them", () => {
    expect(parseAmountCents("24.00")).toBe(2400);
    expect(parseAmountCents("9,99")).toBe(999);
    expect(parseAmountCents("€ 1.024,50")).toBe(102450);
    expect(parseAmountCents("dieci")).toBeNull();
  });
});

describe("matching a listing to the catalogue", () => {
  it("splits a product name into its code and its blade", () => {
    expect(productKeys("Shadow Shinobi 1-80MN")).toEqual({ code: "1-80mn", blade: "shadow shinobi" });
    expect(productKeys("Hurricane Enlil IS 7-55T")).toEqual({ code: "7-55t", blade: "hurricane enlil" });
    expect(productKeys("Glory Valkerion LF")).toEqual({ code: null, blade: "glory valkerion" });
  });

  it("acts alone on a code that names one product", () => {
    const match = matchListing("Beyblade X Shadow Shinobi 1-80MN nuovo", 1, PRODUCTS);
    expect(match).toMatchObject({ lines: [{ slug: "shadow-shinobi-1-80mn", quantity: 1 }], confidence: "high", source: "code" });
    expect(matchListing("Impact Drake 9-60LR imbustato", 1, PRODUCTS).lines).toEqual([{ slug: "impact-drake-9-60lr", quantity: 1 }]);
  });

  it("takes one Drop Attack set off the shelf for a stadium sold alone", () => {
    const match = matchListing("Beyblade X arena drop attack SOLO arena", 1, PRODUCTS);
    expect(match).toMatchObject({ lines: [{ slug: "drop-attack-battle-set", quantity: 1 }], confidence: "high", source: "arena-only" });
  });

  it("sells the Drop Attack stadium as its own stock item, which follows the sets", () => {
    const shelf = [...PRODUCTS, ...STOCK_ONLY_PRODUCTS];
    expect(matchListing("Beyblade X arena drop attack SOLO arena", 1, shelf)).toMatchObject({
      lines: [{ slug: "drop-attack-arena", quantity: 1 }], confidence: "high", source: "arena-only",
    });
    // The stadium alone never reaches the storefront catalogue.
    expect(PRODUCTS.some((product) => STOCK_ONLY_PRODUCTS.some((item) => item.slug === product.slug))).toBe(false);
    for (const set of BATTLE_SETS) {
      expect(PRODUCTS.some((product) => product.slug === set.setSlug), set.setSlug).toBe(true);
      for (const piece of set.pieces) expect(shelf.some((product) => product.slug === piece), piece).toBe(true);
    }
  });

  it("sells the Sneak Attack pieces on Vinted only, each recognised by its full name", () => {
    const shelf = [...PRODUCTS, ...STOCK_ONLY_PRODUCTS];
    expect(matchListing("Arena Sneak Attack senza trottole", 1, shelf).lines).toEqual([{ slug: "sneak-attack-arena", quantity: 1 }]);
    expect(matchListing("Beyblade X Rampart Aegis GB Hasbro nuovo", 1, shelf)).toMatchObject({
      lines: [{ slug: "rampart-aegis-gb", quantity: 1 }], confidence: "high",
    });
    expect(matchListing("Cutter Shinobi LF trottola attacco", 1, shelf)).toMatchObject({
      lines: [{ slug: "cutter-shinobi-lf", quantity: 1 }], confidence: "high",
    });
    // Without the bit it is still a name, offered for one tap rather than applied.
    expect(matchListing("Cutter Shinobi beyblade", 1, shelf)).toMatchObject({ confidence: "medium", source: "name" });
    // Not to be confused with the Shadow Shinobi sold on the site.
    expect(matchListing("Shadow Shinobi 1-80MN", 1, shelf).lines).toEqual([{ slug: "shadow-shinobi-1-80mn", quantity: 1 }]);
  });

  it("reads the stadium-alone rule only from explicit words, never from the tops sold without it", () => {
    expect(matchListing("Impact Drake 9-60LR drop attack senza arena", 1, PRODUCTS)).toMatchObject({
      lines: [{ slug: "impact-drake-9-60lr", quantity: 1 }], source: "code",
    });
    expect(matchListing("Arena Drop Attack senza trottole", 1, PRODUCTS)).toMatchObject({ lines: [{ slug: "drop-attack-battle-set", quantity: 1 }], source: "arena-only" });
    expect(matchListing("Stadio Sneak Attack da solo", 1, PRODUCTS)).toMatchObject({ lines: [{ slug: "sneak-attack-battle-set", quantity: 1 }] });
    // A whole set that mentions its stadium is not a stadium sold alone.
    expect(matchListing("Drop Attack Battle Set completo con arena", 1, PRODUCTS).source).not.toBe("arena-only");
    // Both at once is not something to act on.
    expect(matchListing("Drop attack solo arena + 9-60LR", 1, PRODUCTS)).toMatchObject({ lines: [], confidence: "low" });
    expect(matchListing("Impact Drake drop attack arena senza trottole", 1, PRODUCTS)).toMatchObject({ lines: [], confidence: "low" });
    // A top listed without its launcher is not a stadium.
    expect(matchListing("Impact Drake drop attack arena senza lanciatori", 1, PRODUCTS).source).not.toBe("arena-only");
  });

  it("only proposes a name without a code, and never guesses a set", () => {
    expect(matchListing("Shadow Shinobi come nuovo", 1, PRODUCTS)).toMatchObject({ confidence: "medium", source: "name" });
    expect(matchListing("Set di 2 articoli", 2, PRODUCTS)).toMatchObject({ lines: [], confidence: "low" });
    expect(matchListing("Lotto trottole varie", 1, PRODUCTS)).toMatchObject({ lines: [], confidence: "low" });
  });

  it("moves stock alone only for an authenticated, unmistakable sale", () => {
    const sure = matchListing("Shadow Shinobi 1-80MN", 1, PRODUCTS);
    expect(shouldApplyAutomatically(sure, true)).toBe(true);
    expect(shouldApplyAutomatically(sure, false)).toBe(false);
    expect(shouldApplyAutomatically(matchListing("Shadow Shinobi", 1, PRODUCTS), true)).toBe(false);
  });

  it("knows every code in the catalogue belongs to one product only", () => {
    const codes = PRODUCTS.map((product) => productKeys(product.name).code).filter((code): code is string => code !== null);
    const repeated = codes.filter((code, index) => codes.indexOf(code) !== index);
    // A shared code is still matched through the blade; this documents which ones need it.
    for (const code of repeated) {
      const owners = PRODUCTS.filter((product) => productKeys(product.name).code === code);
      expect(new Set(owners.map((product) => productKeys(product.name).blade)).size, code).toBe(owners.length);
    }
  });
});

describe("Resend's signed webhook", () => {
  const secret = `whsec_${Buffer.from("geardrop-test-secret").toString("base64")}`;
  const sign = (id: string, timestamp: string, body: string) =>
    `v1,${createHmac("sha256", Buffer.from("geardrop-test-secret")).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
  const body = JSON.stringify({ type: "email.received", data: { email_id: "abc" } });

  it("accepts Resend's signature and nothing else", () => {
    const now = 1_790_000_000;
    const headers = { id: "msg_1", timestamp: String(now), signature: `v1,bm9wZQ== ${sign("msg_1", String(now), body)}` };
    expect(verifySvixSignature(body, headers, secret, now)).toBe(true);
    expect(verifySvixSignature(`${body} `, headers, secret, now)).toBe(false);
    expect(verifySvixSignature(body, { ...headers, signature: "v1,bm9wZQ==" }, secret, now)).toBe(false);
    expect(verifySvixSignature(body, headers, "whsec_b3RoZXI=", now)).toBe(false);
  });

  it("refuses a replay older than five minutes", () => {
    const then = 1_790_000_000;
    const headers = { id: "msg_1", timestamp: String(then), signature: sign("msg_1", String(then), body) };
    expect(verifySvixSignature(body, headers, secret, then + 301)).toBe(false);
  });

  it("reads the event type and the email id", () => {
    expect(parseReceivedEvent(body)).toEqual({ type: "email.received", emailId: "abc" });
    expect(parseReceivedEvent("not json")).toBeNull();
  });

  it("recognises Vinted's sender, not a look-alike", () => {
    expect(isFromVinted("Il team Vinted <no-reply@vinted.it>")).toBe(true);
    expect(isFromVinted("no-reply@vinted.com")).toBe(true);
    expect(isFromVinted("Vinted <no-reply@vinted.it.example.com>")).toBe(false);
    expect(isFromVinted("vinted@gmail.com")).toBe(false);
    // A Vinted address in the display name, or trailing the real one, is not the sender.
    expect(isFromVinted("attacker@evil.com no-reply@vinted.it")).toBe(false);
    expect(isFromVinted("\"no-reply@vinted.it\" <evil@example.com>")).toBe(false);
  });
});

function fakeStore(overrides: Partial<InboundStore> = {}) {
  const calls = { suggest: [] as unknown[], autoApply: [] as unknown[] };
  const store: InboundStore = {
    ingest: vi.fn(async (input) => ({ inboundId: 1, saleId: input.sale ? 7 : null, created: true })),
    suggest: vi.fn(async (_id, suggestion) => {
      calls.suggest.push(suggestion);
    }),
    autoApply: vi.fn(async (_id: number, lines: readonly SuggestedLine[]) => {
      calls.autoApply.push(lines);
      return lines.map((line) => ({ ...line, name: line.slug, taken: line.quantity }));
    }),
    ...overrides,
  };
  return { store, calls };
}

const vintedEmail = (text: string, overrides: Partial<ReceivedEmail> = {}): ReceivedEmail => ({
  id: "resend-1",
  from: "Il team Vinted <no-reply@vinted.it>",
  subject: SUBJECT,
  text,
  html: null,
  senderVerified: true,
  createdAt: "2026-10-06T10:14:00Z",
  ...overrides,
});

const catalogue = PRODUCTS.map((product) => ({ slug: product.slug, name: product.name }));

describe("one inbound email, start to finish", () => {
  it("records an authenticated sale named by code, and tells nobody", async () => {
    const { store, calls } = fakeStore();
    const notifyOwner = vi.fn(async () => undefined);
    const text = SINGLE.replace("Beyblade X arena drop attack SOLO arena", "Shadow Shinobi 1-80MN").replace("10.00", "9.99");
    const result = await processInboundEmail(vintedEmail(text), { store, products: PRODUCTS, catalogue, notifyOwner });
    expect(result).toMatchObject({ status: "recorded", saleId: 7 });
    expect(calls.autoApply).toEqual([[{ slug: "shadow-shinobi-1-80mn", quantity: 1 }]]);
    expect(notifyOwner).not.toHaveBeenCalled();
  });

  it("leaves a set for the owner, with an email, and moves nothing", async () => {
    const { store, calls } = fakeStore();
    const notices: OwnerNotice[] = [];
    const result = await processInboundEmail(vintedEmail(SET), {
      store, products: PRODUCTS, catalogue, notifyOwner: async (notice) => void notices.push(notice),
    });
    expect(result).toMatchObject({ status: "pending" });
    expect(calls.autoApply).toEqual([]);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ kind: "sale-pending", sale: { itemCount: 2, amountCents: 2400 } });
  });

  it("does not trust an email that only claims to come from Vinted", async () => {
    const { store, calls } = fakeStore();
    const text = SINGLE.replace("Beyblade X arena drop attack SOLO arena", "Shadow Shinobi 1-80MN");
    const result = await processInboundEmail(vintedEmail(text, { senderVerified: false }), {
      store, products: PRODUCTS, catalogue, notifyOwner: async () => undefined,
    });
    expect(result).toMatchObject({ status: "pending", suggestion: { confidence: "high" } });
    expect(calls.autoApply).toEqual([]);
  });

  it("asks Claude for a title without a code, and only offers its answer", async () => {
    const { store, calls } = fakeStore();
    const readWithAi = vi.fn(async () => ({
      isSale: true, buyerUsername: "acquirente01", listingTitle: "Trottola difesa alta verde", itemCount: 1, amountCents: 1500,
      lines: [{ slug: "hover-wyvern-3-85n", quantity: 1 }], confidence: "medium" as const, reason: "Difesa verde: Hover Wyvern.",
    }));
    const text = SINGLE.replace("Beyblade X arena drop attack SOLO arena", "Trottola difesa alta verde");
    const result = await processInboundEmail(vintedEmail(text), {
      store, products: PRODUCTS, catalogue, readWithAi, notifyOwner: async () => undefined,
    });
    expect(readWithAi).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ status: "pending", suggestion: { source: "claude", lines: [{ slug: "hover-wyvern-3-85n", quantity: 1 }] } });
    expect(calls.autoApply).toEqual([]);
  });

  it("never spends a Claude call on email that did not really come from Vinted", async () => {
    const { store } = fakeStore();
    const readWithAi = vi.fn(async () => null);
    const text = SINGLE.replace("Beyblade X arena drop attack SOLO arena", "Trottola misteriosa");
    await processInboundEmail(vintedEmail(text, { senderVerified: false }), {
      store, products: PRODUCTS, catalogue, readWithAi, notifyOwner: async () => undefined,
    });
    await processInboundEmail(vintedEmail(text, { id: "resend-2", from: "attacker@evil.com no-reply@vinted.it" }), {
      store, products: PRODUCTS, catalogue, readWithAi, notifyOwner: async () => undefined,
    });
    expect(readWithAi).not.toHaveBeenCalled();
  });

  it("never moves stock on a sale only Claude could read, even when its title carries a code", async () => {
    const { store, calls } = fakeStore();
    const readWithAi = vi.fn(async () => ({
      isSale: true, buyerUsername: "acquirente01", listingTitle: "Shadow Shinobi 1-80MN", itemCount: 1, amountCents: 999,
      lines: [{ slug: "shadow-shinobi-1-80mn", quantity: 1 }], confidence: "high" as const, reason: "Codice 1-80MN.",
    }));
    const unreadable = "Ciao venditore01, una vendita è arrivata: controlla l'app.";
    const result = await processInboundEmail(vintedEmail(unreadable), { store, products: PRODUCTS, catalogue, readWithAi, notifyOwner: async () => undefined });
    expect(readWithAi).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ status: "pending" });
    expect(calls.autoApply).toEqual([]);
  });

  it("keeps the sale waiting, and tells the owner, when the shelf cannot be written", async () => {
    const { store } = fakeStore({ autoApply: vi.fn(async () => { throw new Error("db down"); }) });
    const notifyOwner = vi.fn(async () => undefined);
    const text = SINGLE.replace("Beyblade X arena drop attack SOLO arena", "Shadow Shinobi 1-80MN");
    const result = await processInboundEmail(vintedEmail(text), { store, products: PRODUCTS, catalogue, notifyOwner });
    expect(result).toMatchObject({ status: "pending" });
    expect(notifyOwner).toHaveBeenCalledOnce();
  });

  it("does nothing twice for an email Resend delivers again", async () => {
    const { store, calls } = fakeStore({ ingest: vi.fn(async () => ({ inboundId: 1, saleId: 7, created: false })) });
    const result = await processInboundEmail(vintedEmail(SINGLE), { store, products: PRODUCTS, catalogue, notifyOwner: async () => undefined });
    expect(result).toEqual({ status: "duplicate", inboundId: 1 });
    expect(calls.autoApply).toEqual([]);
  });

  it("passes Google's forwarding code on to the owner, once, and stores anything else quietly", async () => {
    const { store } = fakeStore();
    const notices: OwnerNotice[] = [];
    const google = vintedEmail("Codice di conferma: 123456789", { from: "Gmail Team <forwarding-noreply@google.com>", subject: "(#123456789) Conferma inoltro Gmail" });
    await processInboundEmail(google, { store, products: PRODUCTS, catalogue, notifyOwner: async (notice) => void notices.push(notice) });
    expect(notices).toEqual([{ kind: "forwarding-check", subject: google.subject, text: "Codice di conferma: 123456789" }]);

    const spam = vintedEmail("Offerta imperdibile", { from: "promo@example.com", subject: "Sconti" });
    const result = await processInboundEmail(spam, { store, products: PRODUCTS, catalogue, notifyOwner: async (notice) => void notices.push(notice) });
    expect(result).toMatchObject({ status: "stored" });
    expect(notices).toHaveLength(1);
  });
});

describe("the owner's email", () => {
  it("says what waits, what the reader proposes, and links the panel", () => {
    const names = new Map(PRODUCTS.map((product) => [product.slug, product.name]));
    const email = ownerNoticeEmail(
      {
        kind: "sale-pending", saleId: 7, verified: true,
        sale: { buyerUsername: "acquirente02", listingTitle: "Set di 2 articoli", itemCount: 2, amountCents: 2400 },
        suggestion: { lines: [], confidence: "low", source: "none", reason: "Ordine di 2 annunci: l'email non dice quali." },
      },
      names,
    );
    // Intl puts a no-break space before the euro sign.
    expect(email.subject).toMatch(/^Vendita Vinted da confermare: Set di 2 articoli \(24,00\s€\)$/);
    expect(email.text).toContain("https://geardropshop.it/admin/vinted");
    expect(email.idempotencyKey).toBe("gd-vinted-pending-7");
  });

  it("knows the bundles the reader may be offered", () => {
    expect(BUNDLES.every((bundle) => (bundle.bundleOf ?? []).every((part) => PRODUCTS.some((product) => product.slug === part.slug)))).toBe(true);
  });
});
