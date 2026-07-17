import type { Metadata } from "next";
import { WishlistClient } from "@/app/preferiti/wishlist-client";
import { PRODUCTS } from "@/data/catalog";

export const metadata: Metadata = {
  title: "Preferiti",
  description: "I prodotti che hai salvato su GEAR//DROP.",
  robots: { index: false, follow: false },
};

export default function PreferitiPage() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
      <div data-testid="wishlist-surface" className="gd-glass-panel rounded-[--radius-glass] px-5 py-6 sm:px-7">
        <h1 className="gd-display-wide text-[2rem] font-extrabold text-graphite sm:text-[2.5rem]">Preferiti</h1>
        <p className="mt-2 text-small text-grey-600">I prodotti che hai salvato restano qui, anche se chiudi il browser.</p>
      </div>
      {/* The catalogue is passed down so the client never re-fetches what the server has. */}
      <WishlistClient catalogue={PRODUCTS} />
    </div>
  );
}
