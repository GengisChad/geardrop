import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import { GaEvent } from "@/components/analytics/ga-event";
import { brand } from "@/data/assets";
import { BUNDLES, PRODUCTS } from "@/data/catalog";
import { gaItem, purchaseEvent } from "@/lib/analytics/google";
import { retrieveCheckoutSession, type CheckoutSessionSummary } from "@/lib/payments/stripe-checkout";
import { ClearCart } from "./clear-cart";
import { GoogleReviewOptIn } from "@/components/checkout/google-review-opt-in";
import { reviewOptIn } from "@/lib/customer-reviews";

export const metadata: Metadata = {
  title: "Esito pagamento",
  description: "Esito del pagamento GEAR//DROP.",
  robots: { index: false, follow: false },
};

type SearchParams = { session_id?: string | string[] };

/**
 * Where Stripe sends the buyer back. The query string is never trusted: the outcome shown is
 * the one Stripe reports for that session, read server-side with the secret key.
 */
export default async function CheckoutResultPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { session_id: rawSessionId } = await searchParams;
  const session = typeof rawSessionId === "string" ? await retrieveCheckoutSession(rawSessionId) : null;

  const completed = session?.status === "complete";
  const paid = completed && session.paymentStatus !== "unpaid";
  const survey = paid ? reviewOptIn(session) : null;

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
      <div
        data-testid="checkout-result"
        className="gd-hud mx-auto mt-10 flex max-w-lg flex-col items-center bg-surface/80 px-6 py-14 text-center"
      >
        {completed ? <ClearCart /> : null}
        {paid ? <PurchaseEvent session={session} /> : null}
        {paid ? (
          <OrderLaunch />
        ) : completed ? (
          <Clock className="size-14 text-violet-soft" strokeWidth={1.5} aria-hidden="true" />
        ) : (
          <AlertTriangle className="size-14 text-soldout" strokeWidth={1.5} aria-hidden="true" />
        )}

        <h1 className="mt-5 text-h2 font-bold text-graphite">
          {paid ? "Pagamento ricevuto" : completed ? "Pagamento in elaborazione" : "Pagamento non completato"}
        </h1>

        {completed ? (
          <>
            <p className="mt-2 text-small text-grey-600">
              Ordine{" "}
              <span className={paid ? "gd-display gd-order-type font-bold text-graphite" : "gd-display font-bold text-graphite"} data-testid="order-number">
                {session.reference}
              </span>
              {session.totalCents !== null ? <> · Totale {formatPrice({ amount: session.totalCents, currency: "EUR" })}</> : null}
            </p>
            <p className="mt-3 max-w-sm text-[0.6875rem] text-grey-600">
              {paid
                ? "Grazie! Stripe ti invia la ricevuta via email. Se hai preso articoli in pre-ordine, l'email di conferma indica per ognuno quando arriva."
                : "Il metodo scelto conferma il pagamento in differita: ti avvisiamo appena risulta accreditato."}
              {session.email ? <> Riferimento email: {session.email}.</> : null}
            </p>
            <Button as={Link} href="/negozio" variant="primary" size="lg" className="mt-7">
              Continua ad acquistare
            </Button>
            <Link href="/ordine" className="mt-3 text-small text-grey-600 underline-offset-2 hover:underline hover:text-lime">
              Segui il tuo ordine
            </Link>
            <Link href="/account" className="mt-1 text-[0.6875rem] text-grey-600 underline-offset-2 hover:underline hover:text-lime">
              Tutti i tuoi ordini e dove si trova il pacco: nel tuo account
            </Link>
            {survey ? <GoogleReviewOptIn optIn={survey} /> : null}
          </>
        ) : (
          <>
            <p className="mt-2 max-w-sm text-small text-grey-600">
              Non risulta nessun pagamento per questo ordine e non è stato addebitato nulla. Il carrello è ancora salvato.
            </p>
            <Button as={Link} href="/checkout" variant="primary" size="lg" className="mt-7">
              Torna al checkout
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

const SHARD_COLOURS = ["var(--color-lime)", "var(--color-cyan)", "var(--color-magenta)"] as const;
const SHARDS = Array.from({ length: 12 }, (_, index) => ({
  angle: index * 30 + 12,
  reach: 70 + ((index * 37) % 50),
  colour: SHARD_COLOURS[index % SHARD_COLOURS.length],
}));

/**
 * The paid order's launch (owner, 2026-11-19): the emblem spins up like a launched top, a ring and
 * a burst of shards leave it, and the sticker is stamped. Plain CSS (globals.css), so it plays
 * once as the page arrives and needs no script; the words under it carry the outcome. "Pagato" is
 * what Stripe reported for this session, nothing more.
 */
function OrderLaunch() {
  return (
    <>
      <div className="gd-order-launch" aria-hidden="true" data-testid="order-launch">
        <Image src={brand.emblem} alt="" width={84} height={81} className="size-full object-contain" />
        <span className="gd-order-ring" />
        {SHARDS.map((shard) => (
          <span
            key={shard.angle}
            className="gd-order-shard"
            style={{ "--gd-a": `${shard.angle}deg`, "--gd-r": `${shard.reach}px`, "--gd-shard": shard.colour } as CSSProperties}
          />
        ))}
      </div>
      <p aria-hidden="true" className="gd-sticker gd-order-stamp mt-6 bg-lime px-3 py-1.5 text-[0.9375rem] text-void">
        Ordine pagato
      </p>
    </>
  );
}

const CATALOGUE: ReadonlyMap<string, { readonly name: string; readonly price: { readonly amount: number } }> = new Map(
  [...PRODUCTS, ...BUNDLES].map((product) => [product.slug, product]),
);

/**
 * The GA4 purchase for a paid session: Google Ads reads it to count the sales its campaigns bring.
 * Items come from the session's own line list and are named and priced from the catalogue.
 */
function PurchaseEvent({ session }: { readonly session: CheckoutSessionSummary }) {
  if (!session.reference || session.totalCents === null) return null;
  const items = session.lines.map((line) => {
    const product = CATALOGUE.get(line.slug);
    return gaItem({ slug: line.slug, name: product?.name ?? line.slug, priceCents: product?.price.amount ?? null, quantity: line.quantity });
  });
  return (
    <GaEvent
      name="purchase"
      params={purchaseEvent({ reference: session.reference, totalCents: session.totalCents, shippingCents: session.shippingCents ?? 0, items })}
      onceKey={`gd-ga-purchase-${session.reference}`}
    />
  );
}

