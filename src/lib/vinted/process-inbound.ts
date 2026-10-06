import type { AiReading, CatalogueEntry } from "./ai-reader";
import { matchListing, shouldApplyAutomatically, type ListingMatch, type MatchableProduct, type SuggestedLine } from "./catalogue-match";
import { isFromVinted, type ReceivedEmail } from "./resend-inbound";
import { htmlToText, parseVintedSaleEmail, VINTED_SALE_SUBJECT, type VintedSaleEmail } from "./sale-email";

/**
 * One inbound email, start to finish: store it, read the sale out of it, and either take the
 * pieces off the shelf (an authenticated Vinted email naming one product by code) or leave the
 * sale in the panel with the best suggestion available and tell the owner.
 *
 * Every dependency is passed in, so the whole decision is testable without Resend, Supabase or
 * Claude; src/app/api/vinted/inbound/route.ts wires the real ones.
 */

export type Suggestion = {
  readonly lines: readonly SuggestedLine[];
  readonly confidence: "high" | "medium" | "low";
  readonly source: ListingMatch["source"] | "claude";
  readonly reason: string;
};

export type AppliedLine = { readonly slug: string; readonly name: string; readonly quantity: number; readonly taken: number };

export type InboundStore = {
  ingest(input: {
    readonly providerEmailId: string;
    readonly from: string;
    readonly subject: string;
    readonly body: string;
    readonly senderVerified: boolean;
    readonly sale: (VintedSaleEmail & { readonly soldAt: string | null }) | null;
  }): Promise<{ readonly inboundId: number; readonly saleId: number | null; readonly created: boolean }>;
  suggest(saleId: number, suggestion: Suggestion): Promise<void>;
  autoApply(saleId: number, lines: readonly SuggestedLine[]): Promise<readonly AppliedLine[]>;
};

export type OwnerNotice =
  | { readonly kind: "sale-pending"; readonly saleId: number; readonly sale: VintedSaleEmail; readonly suggestion: Suggestion; readonly verified: boolean }
  | { readonly kind: "forwarding-check"; readonly subject: string; readonly text: string };

export type InboundDeps = {
  readonly store: InboundStore;
  readonly products: readonly MatchableProduct[];
  readonly catalogue: readonly CatalogueEntry[];
  /** Claude's reading; absent when ANTHROPIC_API_KEY is not set. */
  readonly readWithAi?: (email: { subject: string; from: string; text: string }, catalogue: readonly CatalogueEntry[]) => Promise<AiReading | null>;
  readonly notifyOwner: (notice: OwnerNotice) => Promise<void>;
};

export type InboundResult =
  | { readonly status: "duplicate"; readonly inboundId: number }
  | { readonly status: "stored"; readonly inboundId: number }
  | { readonly status: "recorded"; readonly saleId: number; readonly lines: readonly AppliedLine[] }
  | { readonly status: "pending"; readonly saleId: number; readonly suggestion: Suggestion };

/** Google sends the forwarding confirmation code here once, when Gmail's forwarding is set up. */
function isGmailForwardingCheck(from: string, subject: string): boolean {
  return /forwarding-noreply@google\.com/i.test(from) || /conferma (dell'?)?inoltro|forwarding confirmation/i.test(subject);
}

export function emailText(email: Pick<ReceivedEmail, "text" | "html">): string {
  const text = email.text?.trim();
  if (text) return text;
  return email.html ? htmlToText(email.html) : "";
}

async function safely<T>(work: () => Promise<T>): Promise<T | null> {
  try {
    return await work();
  } catch {
    return null;
  }
}

export async function processInboundEmail(email: ReceivedEmail, deps: InboundDeps): Promise<InboundResult> {
  const text = emailText(email);
  const fromVinted = isFromVinted(email.from);
  const verified = fromVinted && email.senderVerified;

  let sale = parseVintedSaleEmail(email.subject, text);
  let aiReading: AiReading | null = null;

  // Vinted's subject, but a layout the code-based reader does not recognise: Claude reads it.
  if (!sale && fromVinted && email.subject.toLowerCase().includes(VINTED_SALE_SUBJECT.toLowerCase()) && deps.readWithAi) {
    aiReading = await safely(() => deps.readWithAi!({ subject: email.subject, from: email.from, text }, deps.catalogue));
    if (aiReading?.isSale && aiReading.listingTitle) {
      sale = {
        buyerUsername: aiReading.buyerUsername,
        listingTitle: aiReading.listingTitle,
        itemCount: aiReading.itemCount,
        amountCents: aiReading.amountCents,
      };
    }
  }

  const stored = await deps.store.ingest({
    providerEmailId: email.id,
    from: email.from,
    subject: email.subject,
    body: text,
    senderVerified: email.senderVerified,
    sale: sale ? { ...sale, soldAt: email.createdAt } : null,
  });
  if (!stored.created) return { status: "duplicate", inboundId: stored.inboundId };

  if (!sale || stored.saleId === null) {
    if (isGmailForwardingCheck(email.from, email.subject)) {
      await deps.notifyOwner({ kind: "forwarding-check", subject: email.subject, text: text.slice(0, 1500) });
    }
    return { status: "stored", inboundId: stored.inboundId };
  }

  const match = matchListing(sale.listingTitle, sale.itemCount, deps.products);
  if (shouldApplyAutomatically(match, verified)) {
    const suggestion: Suggestion = { lines: match.lines, confidence: match.confidence, source: match.source, reason: match.reason };
    await deps.store.suggest(stored.saleId, suggestion);
    // The email is already stored, so a failure here must not be retried into a "duplicate":
    // the sale stays in the panel, with this suggestion, and the owner is told.
    const lines = await safely(() => deps.store.autoApply(stored.saleId!, match.lines));
    if (lines) return { status: "recorded", saleId: stored.saleId, lines };
    await deps.notifyOwner({ kind: "sale-pending", saleId: stored.saleId, sale, suggestion, verified });
    return { status: "pending", saleId: stored.saleId, suggestion };
  }

  // Not sure enough to move stock: offer the best reading in the panel.
  let suggestion: Suggestion = { lines: match.lines, confidence: match.confidence, source: match.source, reason: match.reason };
  if (sale.itemCount === 1 && match.confidence !== "high" && deps.readWithAi) {
    aiReading ??= await safely(() => deps.readWithAi!({ subject: email.subject, from: email.from, text }, deps.catalogue));
    if (aiReading && aiReading.lines.length > 0) {
      suggestion = { lines: aiReading.lines, confidence: aiReading.confidence, source: "claude", reason: aiReading.reason };
    }
  }
  await deps.store.suggest(stored.saleId, suggestion);
  await deps.notifyOwner({ kind: "sale-pending", saleId: stored.saleId, sale, suggestion, verified });
  return { status: "pending", saleId: stored.saleId, suggestion };
}
