import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import type { AppHref } from "@/lib/routes";
import { cn } from "@/lib/cn";

/** Variants transcribed from design system §06 (Primario / Secondario / Terziario / Testo). */
export type ButtonVariant = "primary" | "secondary" | "tertiary" | "text" | "card" | "card-preorder" | "card-notify";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "gd-display inline-flex items-center justify-center gap-2 font-bold tracking-wide " +
  "transition-[background-color,color,border-color,transform,box-shadow] duration-200 " +
  "disabled:cursor-not-allowed active:translate-y-px";

const VARIANTS: Record<ButtonVariant, string> = {
  // Lime = "buy". One primary action per screen. (audit §7.3)
  primary:
    "rounded-full bg-lime text-graphite hover:bg-[#d4ff3d] active:bg-[#b8ee00] " +
    "shadow-[0_2px_0_0_rgba(18,20,23,0.16)] disabled:bg-grey-200 disabled:text-grey-400 disabled:shadow-none",
  secondary:
    "rounded-full border border-violet bg-graphite text-white hover:bg-grey-700 " +
    "hover:border-violet/70 disabled:border-grey-300 disabled:bg-grey-200 disabled:text-grey-400",
  tertiary:
    "rounded-full border border-violet bg-white text-graphite hover:bg-violet-tint " +
    "disabled:border-grey-300 disabled:bg-grey-100 disabled:text-grey-400",
  text: "rounded-full text-violet hover:text-violet-ink disabled:text-grey-400",
  // Card CTA: graphite fill, lime label.
  card: "rounded-full bg-graphite text-lime hover:bg-grey-700 disabled:bg-grey-200 disabled:text-grey-400",
  "card-preorder": "rounded-full bg-violet text-white hover:bg-violet-ink",
  "card-notify": "rounded-full border border-grey-300 bg-white text-graphite hover:border-violet hover:text-violet",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-4 text-small",
  md: "h-11 px-6 text-small",
  lg: "h-14 px-8 text-body",
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
