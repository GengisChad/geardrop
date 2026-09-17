import type { Metadata } from "next";
import { OrderLookupForm } from "./order-lookup-form";

export const metadata: Metadata = {
  title: "Traccia il tuo ordine",
  description: "Inserisci il numero ordine e l'email per seguire lo stato della tua spedizione.",
  robots: { index: false, follow: false },
};

export default function OrdineTracciamentPage() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-lg">
        <h1 className="gd-display-wide text-[2rem] font-extrabold text-graphite sm:text-[2.5rem]">
          Traccia il tuo ordine
        </h1>
        <p className="mt-2 text-small text-grey-600">
          Inserisci il numero ordine (es. GD-XXXXXXXX) e l&rsquo;email con cui hai acquistato.
        </p>
      </div>
      <div className="mt-8">
        <OrderLookupForm />
      </div>
    </div>
  );
}
