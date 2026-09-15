import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import { retrieveCheckoutSession } from "@/lib/payments/stripe-checkout";
import { ClearCart } from "./clear-cart";

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

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
      <div
        data-testid="checkout-result"
        className="mx-auto mt-10 flex max-w-lg flex-col items-center rounded-[--radius-card] border border-grey-200 bg-white px-6 py-14 text-center"
      >
        {completed ? <ClearCart /> : null}
        {paid ? (
          <CheckCircle2 className="size-14 text-available" strokeWidth={1.5} aria-hidden="true" />
        ) : completed ? (
          <Clock className="size-14 text-violet" strokeWidth={1.5} aria-hidden="true" />
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
              <span className="gd-display font-bold text-graphite" data-testid="order-number">
                {session.reference}
              </span>
              {session.totalCents !== null ? <> · Totale {formatPrice({ amount: session.totalCents, currency: "EUR" })}</> : null}
            </p>
            <p className="mt-3 max-w-sm text-[0.6875rem] text-grey-600">
              {paid
                ? "Grazie! Stripe ti invia la ricevuta via email. Per i pre-ordini affidiamo il pacco al corriere entro 14 giorni dalla conferma."
                : "Il metodo scelto conferma il pagamento in differita: ti avvisiamo appena risulta accreditato."}
              {session.email ? <> Riferimento email: {session.email}.</> : null}
            </p>
            <Button as={Link} href="/negozio" variant="primary" size="lg" className="mt-7">
              Continua ad acquistare
            </Button>
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
