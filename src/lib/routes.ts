import type { Route } from "next";
import type { ProductSlug } from "@/data/assets";
import type { LegalSlug, SupportSlug } from "@/data/pages";
import type { CategorySlug } from "@/lib/commerce/types";

/**
 * The href type used across the app.
 *
 * Next's generated `Route` only admits a dynamic route when the string literal is
 * inferred at the call site. An href stored in a data structure, or forwarded through a
 * polymorphic component (`<Button as={Link}>`), loses that inference and every dynamic
 * route is rejected.
 *
 * Spelling the dynamic families out keeps them usable, and keying them off the same slug
 * unions the data layer uses makes this *stricter* than `Route` would have been: a typo
 * in a category, product, support or legal slug still fails to compile.
 */
export type AppHref =
  | Route
  | `/negozio/${CategorySlug}`
  | `/negozio/${CategorySlug}?${string}`
  | `/prodotto/${ProductSlug}`
  | `/assistenza/${SupportSlug}`
  | `/legale/${LegalSlug}`;
