"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Check, ShoppingCart } from "lucide-react";
import { Button, type ButtonSize } from "@/components/ui/button";
import { useCart } from "@/lib/store/cart";
import { useToast } from "@/components/ui/toast";
import { STOCK_CTA, isPurchasable } from "@/lib/labels";
import type { StockStatus } from "@/lib/commerce/types";
import { cn } from "@/lib/cn";
import { trackEvent } from "@/lib/funnel";

type AddToCartButtonProps = {
  slug: string;
  name: string;
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

const COMPACT = "gd-chamfer inline-flex size-11 shrink-0 items-center justify-center transition-colors duration-200";

export function AddToCartButton({
  slug,
  name,
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
    const notify = () => toast.push({ tone: "info", message: `Ti avviseremo quando ${name} torna disponibile.` });
    if (compact) {
      return (
        <button
          type="button"
          onClick={notify}
          data-testid="notify-me"
          aria-label={`${text}: ${name}`}
          className={cn(COMPACT, "border border-white/15 text-grey-600 hover:border-violet-soft hover:text-violet-soft")}
        >
          <Bell className="size-4" aria-hidden="true" />
        </button>
      );
    }
    return (
      <Button variant="card-notify" size={size} fullWidth={fullWidth} data-testid="notify-me" onClick={notify}>
        <Bell className="size-4" aria-hidden="true" />
        {text}
      </Button>
    );
  }

  const onAdd = () => {
    add(slug, quantity);
    trackEvent("add_to_cart");
    setJustAdded(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setJustAdded(false), 1400);
    toast.push({ tone: "success", message: `${name} aggiunto al carrello.` });
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={onAdd}
        data-testid="add-to-cart"
        aria-label={justAdded ? `${name} aggiunto al carrello` : `${text}: ${name}`}
        className={cn(COMPACT, justAdded ? "bg-lime text-void" : "bg-white/[0.09] text-graphite hover:bg-lime hover:text-void")}
      >
        {justAdded ? <Check className="size-4" aria-hidden="true" /> : <ShoppingCart className="size-4" aria-hidden="true" />}
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
