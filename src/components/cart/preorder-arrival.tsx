"use client";

import { useEffect, useRef } from "react";
import { useCart } from "@/lib/store/cart";
import { cartLinkPieces } from "@/lib/telegram/preorder-rules";

/**
 * A buyer who chooses "paga sul sito" in the Telegram bot lands on /carrello?preordine=<slug>&q=<n>:
 * the piece, which no page of the shop lists, is put in the cart for him and the address is
 * cleaned, so a reload or a shared link does not add it again. «Che bey compro?» sends several at
 * once, /carrello?aggiungi=a,b,c, one of each.
 *
 * The address is read here, in the browser, so the cart page stays a static page for everyone
 * else. Nothing in the link is trusted: price, availability and whether the piece exists at all
 * come from the server's quote, like any other line of the cart.
 */
export function PreorderArrival() {
  const hydrated = useCart((state) => state.hydrated);
  const done = useRef(false);

  useEffect(() => {
    // Not before the stored cart is read: it would be written over what was just added.
    if (!hydrated || done.current) return;
    done.current = true;
    const pieces = cartLinkPieces(window.location.search);
    if (pieces.length === 0) return;
    for (const wanted of pieces) {
      const cart = useCart.getState();
      const inCart = cart.lines.find((line) => line.slug === wanted.slug)?.quantity ?? 0;
      if (inCart < wanted.quantity) cart.add(wanted.slug, wanted.quantity - inCart);
    }
    window.history.replaceState(null, "", "/carrello");
  }, [hydrated]);

  return null;
}
