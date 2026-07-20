"use client";

import { useEffect, useRef, useState } from "react";
import { requestCartQuote } from "@/app/(storefront)/checkout/actions";
import { useCart } from "@/lib/store/cart";
import type { CartQuote } from "@/lib/commerce/types";

export type CartQuoteState = {
  /** Null until the first server answer arrives, and after a failed request. */
  readonly quote: CartQuote | null;
  /** True while the answer on screen is older than the cart it describes. */
  readonly loading: boolean;
  readonly hydrated: boolean;
  readonly count: number;
};

export type CartQuoteOptions = {
  readonly shippingCode?: string | undefined;
  readonly couponCode?: string | undefined;
};

/**
 * Asks the server to price the cart.
 *
 * The browser owns nothing but slugs and quantities. Names, prices, availability,
 * shipping options and totals all come back from the provider, so what the customer
 * reads is what the checkout will charge — computing any of it here is how the previous
 * version managed to disagree with the database.
 *
 * Answers are tagged with the cart they describe, so a slow reply cannot overwrite a
 * newer one and a stale total is always reported as `loading`.
 */
export function useCartQuote(options: CartQuoteOptions = {}): CartQuoteState {
  const lines = useCart((state) => state.lines);
  const hydrated = useCart((state) => state.hydrated);
  const { shippingCode, couponCode } = options;

  const requestKey = JSON.stringify({ lines, shippingCode: shippingCode ?? null, couponCode: couponCode ?? null });
  const [snapshot, setSnapshot] = useState<{ readonly key: string; readonly quote: CartQuote | null }>({
    key: "",
    quote: null,
  });
  const latestKey = useRef("");

  useEffect(() => {
    if (!hydrated) return;

    latestKey.current = requestKey;
    let cancelled = false;
    const settle = (quote: CartQuote | null) => {
      if (cancelled || latestKey.current !== requestKey) return;
      setSnapshot({ key: requestKey, quote });
    };

    requestCartQuote({
      lines: lines.map((line) => ({ slug: line.slug, quantity: line.quantity })),
      ...(shippingCode ? { shippingCode } : {}),
      ...(couponCode ? { couponCode } : {}),
    })
      .then(settle)
      .catch(() => settle(null));

    return () => {
      cancelled = true;
    };
  }, [requestKey, lines, shippingCode, couponCode, hydrated]);

  return {
    quote: snapshot.quote,
    loading: hydrated && snapshot.key !== requestKey,
    hydrated,
    count: lines.reduce((sum, line) => sum + line.quantity, 0),
  };
}
