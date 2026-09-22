"use client";

import { useState } from "react";
import { CheckCircle2, Heart, Hourglass, Truck, XCircle } from "lucide-react";
import { AddToCartButton } from "@/components/product/add-to-cart-button";
import { QuantityStepper } from "@/components/product/quantity-stepper";
import { RestockForm } from "@/components/product/restock-form";
import { Button } from "@/components/ui/button";
import { useWishlist } from "@/lib/store/wishlist";
import { MAX_QUANTITY_PER_LINE } from "@/lib/store/cart";
import { PREORDER_DELIVERY, deliveryClause, isPurchasable, stockHint, stockLabel } from "@/lib/labels";
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
  // A sold-out drop wears the pre-order's own icon and colour: it is waiting, not gone.
  const tone: StockStatus = product.stock === "esaurito" && product.releasePreorder ? "pre-ordine" : product.stock;
  const Icon = STATUS_ICON[tone];
  // A product that sells past its stock is capped only by the per-line limit.
  const quantityCap = product.autoPreorder
    ? MAX_QUANTITY_PER_LINE
    : Math.min(MAX_QUANTITY_PER_LINE, product.availableQuantity ?? MAX_QUANTITY_PER_LINE);
  const shelf = product.availableQuantity;
  const beyondShelf =
    product.autoPreorder && product.stock === "disponibile" && shelf !== undefined && quantity > shelf ? quantity - shelf : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className={cn("flex items-center gap-3 rounded-xl border px-4 py-3", STATUS_PANEL[tone])}>
        <Icon className={cn("size-5 shrink-0", STATUS_TEXT[tone])} strokeWidth={2.25} aria-hidden="true" />
        <div>
          <p className={cn("gd-display text-small font-bold tracking-wider", STATUS_TEXT[tone])}>
            {stockLabel(product)}
          </p>
          <p className="text-[0.6875rem] text-grey-600">{stockHint(product)}</p>
          {product.stock === "pre-ordine" && !product.autoPreorder && product.availableQuantity !== undefined ? (
            <p className="mt-1 tabular text-[0.6875rem] font-bold text-preorder" data-testid="preorder-remaining">
              {product.availableQuantity} pre-ordini rimasti
            </p>
          ) : null}
          {product.stock === "disponibile" && product.availableQuantity !== undefined ? (
            <p className="mt-1 tabular text-[0.6875rem] font-bold text-available" data-testid="stock-remaining">
              {product.availableQuantity}{" "}
              {product.bundleOf
                ? "duo disponibili"
                : product.availableQuantity === 1
                  ? "pezzo disponibile"
                  : "pezzi disponibili"}
            </p>
          ) : null}
        </div>
      </div>

      {isPurchasable(product.stock) ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-4">
            <span className="gd-display text-small font-bold tracking-wider text-grey-600">Quantità</span>
            <QuantityStepper value={quantity} onChange={setQuantity} max={quantityCap} />
          </div>
          {beyondShelf > 0 ? (
            <p className="text-[0.6875rem] font-bold text-preorder" data-testid="preorder-split" role="status">
              {beyondShelf} in pre-ordine oltre {product.bundleOf ? "i duo" : "i pezzi"} disponibili ·{" "}
              {deliveryClause(PREORDER_DELIVERY)}
            </p>
          ) : null}
        </div>
      ) : null}

      {product.stock === "esaurito" ? (
        <RestockForm slug={product.slug} name={product.name} {...(product.releasePreorder ? { releasePreorder: true } : {})} />
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <AddToCartButton
              slug={product.slug}
              name={product.name}
              stock={product.stock}
              quantity={quantity}
              size="lg"
              emphasis="primary"
              label={product.stock === "pre-ordine" ? "Pre-ordina" : "Aggiungi al carrello"}
            />
          </div>
          <Button
            variant="tertiary"
            size="lg"
            onClick={() => toggle(product.slug)}
            aria-pressed={isSaved}
            className="sm:w-auto"
          >
            <Heart className={cn("size-4", isSaved && "text-violet-soft")} fill={isSaved ? "currentColor" : "none"} aria-hidden="true" />
            <span className="whitespace-nowrap">{isSaved ? "Nei preferiti" : "Aggiungi ai preferiti"}</span>
          </Button>
        </div>
      )}
    </div>
  );
}
