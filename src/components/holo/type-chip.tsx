import { Disc3, Infinity as InfinityIcon, Rocket, Scale, Shield, Wrench, Zap } from "lucide-react";
import type { Product } from "@/lib/commerce/types";
import { kindLabel } from "@/lib/holo";
import { cn } from "@/lib/cn";

const ICON = { className: "size-3.5", strokeWidth: 2.4, "aria-hidden": true } as const;

function KindIcon({ product }: { readonly product: Pick<Product, "bladeType" | "category"> }) {
  switch (product.bladeType) {
    case "attacco":
      return <Zap {...ICON} />;
    case "bilanciato":
      return <Scale {...ICON} />;
    case "stamina":
      return <InfinityIcon {...ICON} />;
    case "difesa":
      return <Shield {...ICON} />;
    default:
      break;
  }
  if (product.category === "stadi") return <Disc3 {...ICON} />;
  if (product.category === "lanciatori") return <Rocket {...ICON} />;
  if (product.category === "accessori") return <Wrench {...ICON} />;
  return <Zap {...ICON} />;
}

/** Chamfered chip in the card's foil colour: what kind of item this is, at a glance. */
export function TypeChip({
  product,
  className,
}: {
  readonly product: Pick<Product, "bladeType" | "category">;
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        "gd-display gd-chamfer inline-flex h-[1.625rem] shrink-0 items-center gap-1.5 bg-[var(--f2)] pl-2 pr-2.5 text-[0.6875rem] font-bold tracking-[0.12em] text-void",
        className,
      )}
    >
      <KindIcon product={product} />
      {kindLabel(product)}
    </span>
  );
}
