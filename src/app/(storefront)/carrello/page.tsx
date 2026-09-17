import type { Metadata } from "next";
import { getCommerceProvider } from "@/lib/commerce/provider";
import { CartClient } from "./cart-client";
import type { Product } from "@/lib/commerce/types";

export const metadata: Metadata = {
  title: "Carrello",
  description: "Rivedi i prodotti nel tuo carrello GEAR//DROP e completa l'ordine.",
  robots: { index: false, follow: false },
};

export default async function CarrelloPage() {
  // Pre-load a few products (bundles first) to show in the empty-cart shelf.
  const commerce = await getCommerceProvider();
  const page = await commerce.listProducts({ sort: "popolari", perPage: 8 });

  // Bundles first, then regular products, take up to 4 total.
  const bundles: Product[] = [];
  const rest: Product[] = [];
  for (const p of page.items) {
    if (p.bundleOf) bundles.push(p);
    else rest.push(p);
  }
  const shelf: Product[] = [...bundles, ...rest].slice(0, 4);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
      <h1 className="gd-display-wide text-[2rem] font-extrabold text-graphite sm:text-[2.5rem]">Carrello</h1>
      <CartClient shelfProducts={shelf} />
    </div>
  );
}
