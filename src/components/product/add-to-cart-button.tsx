"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Check, ShoppingCart } from "lucide-react";
import { Button, type ButtonSize } from "@/components/ui/button";
import { useCart } from "@/lib/store/cart";
import { useToast } from "@/components/ui/toast";
import { ToastFreeShipping } from "@/components/cart/toast-free-shipping";
import { STOCK_CTA, isPurchasable } from "@/lib/labels";
import type { StockStatus } from "@/lib/commerce/types";
import { cn } from "@/lib/cn";
import { trackEvent } from "@/lib/funnel";
import { gaItem, sendGaEvent } from "@/lib/analytics/google";

type AddToCartButtonProps = {
  slug: string;
  name: string;
  /** Unit price in cents, for the GA4 add_to_cart value. */
  priceCents?: number;
  stock: StockStatus;
  quantity?: number;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** PDP uses the long label; cards use the short one from design system §09. */
  label?: string;
  /**
   * "card" is the quiet dark CTA that lights up lime on hover; "primary" is the lime buy
   * button the PDP, hero and Arena lead with. Same behaviour, different weight.
   */
  emphasis?: "card" | "primary";
  /** Square icon button for the tight card footer; the label moves to aria-label. */
  compact?: boolean;
};

/** The card's slanted cart button: lime icon on carbon, filled lime on hover. */
const COMPACT = "gd-chamfer inline-flex h-11 w-12 shrink-0 items-center justify-center transition-colors duration-200";

export function AddToCartButton({
  slug,
  name,
  priceCents,
  stock,
  quantity = 1,
  size = "md",
  fullWidth = true,
  label,
  emphasis = "card",
  compact = false,
}: AddToCartButtonProps) {
  const add = useCart((s) => s.add);
  const toast = useToast();
  const [justAdded, setJustAdded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const text = label ?? STOCK_CTA[stock];

  if (!isPurchasable(stock)) {
    // The availability notice is a real form on the product page; every other surface leads there.
    const notice = `/prodotto/${slug}#restock-form` as const;
    if (compact) {
      return (
        <Link
          href={notice}
          data-testid="notify-me"
          aria-label={`${text}: ${name}`}
          className={cn(COMPACT, "bg-surface-2 text-grey-600 hover:bg-violet hover:text-white")}
        >
          <Bell className="size-4" aria-hidden="true" />
        </Link>
      );
    }
    return (
      <Button as={Link} href={notice} variant="card-notify" size={size} fullWidth={fullWidth} data-testid="notify-me">
        <Bell className="size-4" aria-hidden="true" />
        {text}
      </Button>
    );
  }

  const onAdd = () => {
    add(slug, quantity);
    trackEvent("add_to_cart");
    sendGaEvent("add_to_cart", {
      ...(priceCents === undefined ? {} : { currency: "EUR", value: (priceCents * quantity) / 100 }),
      items: [gaItem({ slug, name, priceCents: priceCents ?? null, quantity })],
    });
    setJustAdded(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setJustAdded(false), 1400);
    // The next step is one tap away, and the free-shipping line (from the server's quote of
    // the new cart) nudges a second piece with what is really missing.
    toast.push({
      tone: "success",
      message: "Aggiunto al carrello",
      detail: name,
      footer: <ToastFreeShipping />,
      action: { label: "Vai al carrello", href: "/carrello" },
    });
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={onAdd}
        data-testid="add-to-cart"
        aria-label={justAdded ? `${name} aggiunto al carrello` : `${text}: ${name}`}
        className={cn(
          COMPACT,
          justAdded
            ? "bg-lime text-void"
            : stock === "pre-ordine"
              ? "bg-violet text-white hover:bg-[#9566ff]"
              : "bg-surface-2 text-lime hover:bg-lime hover:text-void",
        )}
      >
        {justAdded ? (
          <Check className="size-[1.125rem] animate-[gd-kick_0.4s_ease-out]" strokeWidth={2.5} aria-hidden="true" />
        ) : (
          <ShoppingCart className="size-[1.125rem]" strokeWidth={2.25} aria-hidden="true" />
        )}
      </button>
    );
  }

  const variant = emphasis === "primary" ? "primary" : stock === "pre-ordine" ? "card-preorder" : "card";

  return (
    <Button variant={variant} size={size} fullWidth={fullWidth} data-testid="add-to-cart" onClick={onAdd}>
      {justAdded ? <Check className="size-4" aria-hidden="true" /> : <ShoppingCart className="size-4" aria-hidden="true" />}
      {justAdded ? "Aggiunto" : text}
    </Button>
  );
}
