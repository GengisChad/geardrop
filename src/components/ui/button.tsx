import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import type { AppHref } from "@/lib/routes";
import { cn } from "@/lib/cn";

/**
 * Holo Drop buttons. Lime is "buy" and carries the periodic sweep, violet is the secondary
 * emphasis, outlines cover everything else. Solid variants are chamfered like the HUD.
 */
export type ButtonVariant =
  | "primary"
  | "secondary"
  | "glass"
  | "tertiary"
  | "text"
  | "card"
  | "card-preorder"
  | "card-notify";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "gd-display inline-flex items-center justify-center gap-2 font-bold tracking-[0.08em] " +
  "transition-[background-color,color,border-color,box-shadow,opacity] duration-200 " +
  "disabled:cursor-not-allowed";

const VARIANTS: Record<ButtonVariant, string> = {
  // One primary action per view. (audit §7.3)
  primary: "gd-chamfer-lg gd-btn-sheen bg-lime text-void hover:bg-[#d8ff4d] disabled:bg-grey-300 disabled:text-grey-600",
  secondary: "gd-chamfer-lg bg-violet text-white hover:bg-[#8d58ff] disabled:bg-grey-300 disabled:text-grey-600",
  glass: "border border-white/20 bg-white/[0.03] text-graphite hover:border-lime hover:text-lime disabled:text-grey-400",
  tertiary:
    "border border-white/15 bg-transparent text-graphite hover:border-violet-soft hover:text-violet-soft disabled:text-grey-400",
  text: "text-violet-soft hover:text-white disabled:text-grey-400",
  card: "gd-chamfer bg-white/[0.09] text-graphite hover:bg-lime hover:text-void disabled:bg-grey-200 disabled:text-grey-400",
  "card-preorder": "gd-chamfer bg-white/[0.09] text-graphite hover:bg-lime hover:text-void",
  "card-notify": "gd-chamfer border border-white/15 text-grey-600 hover:border-violet-soft hover:text-violet-soft",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-10 px-4 text-small",
  md: "h-12 px-6 text-small",
  lg: "h-[3.75rem] px-7 text-[0.9375rem]",
};

export type ButtonProps<T extends ElementType> = {
  as?: T;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  children: ReactNode;
  /**
   * Overridden because forwarding to `Link` through a polymorphic `as` collapses Next's
   * href inference to `RouteImpl<unknown>`, which rejects every dynamic route. See
   * lib/routes.ts.
   */
  href?: AppHref;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "children" | "href">;

/**
 * Polymorphic so a link-shaped CTA keeps anchor semantics instead of a button with an
 * onClick — keyboard and middle-click behaviour come for free.
 */
export function Button<T extends ElementType = "button">({
  as,
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
  children,
  ...rest
}: ButtonProps<T>) {
  const Component = (as ?? "button") as ElementType;
  return (
    <Component
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && "w-full", className)}
      {...rest}
    >
      {children}
    </Component>
  );
}
