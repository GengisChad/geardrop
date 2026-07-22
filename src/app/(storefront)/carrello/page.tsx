import type { Metadata } from "next";
import { CartClient } from "./cart-client";

export const metadata: Metadata = {
  title: "Carrello",
  description: "Rivedi i prodotti nel tuo carrello GEAR//DROP e completa l'ordine.",
  robots: { index: false, follow: false },
};

export default function CarrelloPage() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
      <h1 className="gd-display-wide text-[2rem] font-extrabold text-graphite sm:text-[2.5rem]">Carrello</h1>
      <CartClient />
    </div>
  );
}
