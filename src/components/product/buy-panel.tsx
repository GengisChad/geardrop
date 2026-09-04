"use client";

import { useState } from "react";
import { CheckCircle2, Heart, Hourglass, Truck, XCircle } from "lucide-react";
import { AddToCartButton } from "@/components/product/add-to-cart-button";
import { QuantityStepper } from "@/components/product/quantity-stepper";
import { Button } from "@/components/ui/button";
import { useWishlist } from "@/lib/store/wishlist";
import { MAX_QUANTITY_PER_LINE } from "@/lib/store/cart";
import { STOCK_HINT, STOCK_LABEL, isPurchasable } from "@/lib/labels";
import type { Product, StockStatus } from "@/lib/commerce/types";
import { cn } from "@/lib/cn";

const STATUS_ICON: Record<StockStatus, typeof Truck> = {
  disponibile: CheckCircle2,
  "in-arrivo": Truck,
  "pre-ordine": Hourglass,
  esaurito: XCircle,
};

const STATUS_PANEL: Record<StockStatus, string> = {
  disponibile: "border-available/30 bg-available-bg",
  "in-arrivo": "border-incoming-solid/40 bg-incoming-bg/40",
  "pre-ordine": "border-preorder/30 bg-preorder-bg",
  esaurito: "border-soldout/30 bg-soldout-bg",
};

const STATUS_TEXT: Record<StockStatus, string> = {
  disponibile: "text-available",
  "in-arrivo": "text-graphite",
  "pre-ordine": "text-preorder",
  esaurito: "text-soldout",
};

/** Quantity + CTA block. Client-side because quantity is local state. */
export function BuyPanel({ product }: { product: Product }) {
  const [quantity, setQuantity] = useState(1);
  const toggle = useWishlist((s) => s.toggle);
  const hydrated = useWishlist((s) => s.hydrated);
  const saved = useWishlist((s) => s.slugs.includes(product.slug));
  const isSaved = hydrated && saved;
  const Icon = STATUS_ICON[product.stock];
  const quantityCap = Math.min(
    MAX_QUANTITY_PER_LINE,
    product.availableQuantity ?? MAX_QUANTITY_PER_LINE,
  );

  return (
    <div className="flex flex-col gap-5">
      <div className={cn("flex items-center gap-3 rounded-xl border px-4 py-3", STATUS_PANEL[product.stock])}>
        <Icon className={cn("size-5 shrink-0", STATUS_TEXT[product.stock])} strokeWidth={2.25} aria-hidden="true" />
        <div>
          <p className={cn("gd-display text-small font-bold tracking-wider", STATUS_TEXT[product.stock])}>
            {STOCK_LABEL[product.stock]}
          </p>
          <p className="text-[0.6875rem] text-grey-600">{STOCK_HINT[product.stock]}</p>
          {product.stock === "pre-ordine" && product.availableQuantity !== undefined ? (
            <p className="mt-1 tabular text-[0.6875rem] font-bold text-preorder" data-testid="preorder-remaining">
              {product.availableQuantity} pre-ordini rimasti
            </p>
          ) : null}
        </div>
      </div>

      {isPurchasable(product.stock) ? (
        <div className="flex items-center gap-4">
          <span className="gd-display text-small font-bold tracking-wider text-grey-600">Quantità</span>
          <QuantityStepper value={quantity} onChange={setQuantity} max={quantityCap} />
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <AddToCartButton
            slug={product.slug}
            name={product.name}
            stock={product.stock}
            quantity={quantity}
            size="lg"
            emphasis="primary"
            label={
              product.stock === "esaurito"
                ? "Avvisami"
                : product.stock === "pre-ordine"
                  ? "Pre-ordina"
                  : "Aggiungi al carrello"
            }
          />
        </div>
        <Button
          variant="tertiary"
          size="lg"
          onClick={() => toggle(product.slug)}
          aria-pressed={isSaved}
          className="sm:w-auto"
        >
          <Heart className={cn("size-4", isSaved && "text-violet")} fill={isSaved ? "currentColor" : "none"} aria-hidden="true" />
          <span className="whitespace-nowrap">{isSaved ? "Nei preferiti" : "Aggiungi ai preferiti"}</span>
        </Button>
      </div>
    </div>
  );
}
