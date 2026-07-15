"use client";

import { useState } from "react";
import { Bell, Check, ShoppingCart } from "lucide-react";
import { Button, type ButtonSize } from "@/components/ui/button";
import { useCart } from "@/lib/store/cart";
import { useToast } from "@/components/ui/toast";
import { STOCK_CTA, isPurchasable } from "@/lib/labels";
import type { StockStatus } from "@/lib/commerce/types";

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
   * "card" is the graphite CTA with a lime label from design system §09.
   * "primary" is the lime Primario button from §06, which the PDP mockups use for the
   * main buy action. Same behaviour, different weight in the hierarchy.
   */
  emphasis?: "card" | "primary";
};

export function AddToCartButton({
  slug,
  name,
  stock,
  quantity = 1,
  size = "md",
  fullWidth = true,
  label,
  emphasis = "card",
}: AddToCartButtonProps) {
  const add = useCart((s) => s.add);
  const toast = useToast();
  const [justAdded, setJustAdded] = useState(false);

  if (!isPurchasable(stock)) {
    return (
      <Button
        variant="card-notify"
        size={size}
        fullWidth={fullWidth}
        data-testid="notify-me"
        onClick={() => toast.push({ tone: "info", message: `Ti avviseremo quando ${name} torna disponibile.` })}
      >
        <Bell className="size-4" aria-hidden="true" />
        {label ?? STOCK_CTA[stock]}
      </Button>
    );
  }

  const isPreorder = stock === "pre-ordine";
  const variant = isPreorder ? "card-preorder" : emphasis === "primary" ? "primary" : "card";

  return (
    <Button
      variant={variant}
      size={size}
      fullWidth={fullWidth}
      data-testid="add-to-cart"
      onClick={() => {
        add(slug, quantity);
        setJustAdded(true);
        setTimeout(() => setJustAdded(false), 1400);
        toast.push({ tone: "success", message: `${name} aggiunto al carrello.` });
      }}
    >
      {justAdded ? <Check className="size-4" aria-hidden="true" /> : <ShoppingCart className="size-4" aria-hidden="true" />}
      {justAdded ? "Aggiunto" : (label ?? STOCK_CTA[stock])}
    </Button>
  );
}
