import { formatPrice } from "@/lib/format";
import type { Database } from "@/lib/supabase/database.types";
import { CLUB_MIN_ORDER_CENTS, clubUnitPrice, findClub, normaliseClubCode } from "./club-pricing";
import type { CategorySlug, Money } from "./types";

/**
 * The code a buyer types in the cart (owner, 2026-11-06: clubs typed their code there and read
 * "non valido", so the codes now live on the site). One field answers for two kinds of code:
 *
 * - a club's tier code, from the server-only CLUB_CODES variable (club-pricing.ts);
 * - a coupon the owner made in /admin/coupon, which holds from the moment it is saved.
 *
 * Both end the same way: a unit price per line, charged on Stripe as `price_data` on the catalogue's
 * own product, and the code in the order's coupon_code. A code never stacks with one typed on
 * Stripe's page: a cart holding a code has no promotion field there.
 */

export type SiteCoupon = {
  readonly code: string;
  readonly discountKind: "percentage" | "fixed";
  /** A percentage, or cents off the lines it covers. */
  readonly discountValue: number;
  readonly freeShipping: boolean;
  readonly minimumSubtotalCents: number;
  readonly maximumDiscountCents: number | null;
  /** All three empty: the whole cart. Otherwise only what they name. */
  readonly productSlugs: readonly string[];
  readonly categorySlugs: readonly string[];
  readonly bundleSlugs: readonly string[];
};

export type SiteCouponLookup =
  | { readonly status: "valid"; readonly coupon: SiteCoupon }
  /** It exists but does not hold now: switched off, out of its dates, used up, or tied to a buyer. */
  | { readonly status: "inactive" }
  | { readonly status: "unknown" }
  /** The database did not answer: neither a yes nor a no. */
  | { readonly status: "unavailable" };

export type FindSiteCoupon = (code: string) => Promise<SiteCouponLookup>;

type CouponRow = Pick<
  Database["public"]["Tables"]["coupons"]["Row"],
  | "code"
  | "discount_kind"
  | "discount_value"
  | "free_shipping"
  | "minimum_subtotal_cents"
  | "maximum_discount_cents"
  | "usage_limit"
  | "per_customer_limit"
  | "first_purchase_only"
  | "starts_at"
  | "expires_at"
  | "active"
  | "disabled_at"
>;

export type CouponTargets = Pick<SiteCoupon, "productSlugs" | "categorySlugs" | "bundleSlugs">;

/**
 * Whether a coupon holds right now. `usedCount` is how many live orders already carry it.
 *
 * "Solo primo acquisto" and "limite per cliente" need to know the buyer, and a cart does not: most
 * buyers reach Stripe as guests. A coupon with either one is refused rather than honoured unchecked.
 */
export function readSiteCoupon(row: CouponRow, targets: CouponTargets, usedCount: number, now: Date): SiteCouponLookup {
  const started = !row.starts_at || new Date(row.starts_at) <= now;
  const running = !row.expires_at || new Date(row.expires_at) > now;
  const left = row.usage_limit === null || usedCount < row.usage_limit;
  const forAnyone = !row.first_purchase_only && row.per_customer_limit === null;
  if (!row.active || row.disabled_at || !started || !running || !left || !forAnyone) return { status: "inactive" };
  return {
    status: "valid",
    coupon: {
      code: row.code,
      discountKind: row.discount_kind,
      discountValue: row.discount_value,
      freeShipping: row.free_shipping,
      minimumSubtotalCents: row.minimum_subtotal_cents,
      maximumDiscountCents: row.maximum_discount_cents,
      ...targets,
    },
  };
}

export const CODE_UNKNOWN = "Codice non valido.";
export const CODE_INACTIVE = "Questo codice non è attivo.";
export const CODE_UNAVAILABLE = "Non riesco a controllare il codice: riprova tra poco.";

export function codeMinimumMessage(minimumCents: number, missingCents: number): string {
  const euro = (amount: number) => formatPrice({ amount, currency: "EUR" });
  return `Il codice vale da ${euro(minimumCents)} di ordine: ne mancano ${euro(missingCents)}.`;
}

/** One cart line as a code prices it, at what it costs without the code. */
export type CodeLine = {
  readonly slug: string;
  readonly quantity: number;
  readonly price: Money;
  readonly category: CategorySlug | undefined;
  readonly consignment: boolean;
};

export type CartCodePricing = {
  readonly code: string;
  readonly minimumCents: number;
  readonly freeShipping: boolean;
  /** What one unit costs with the code, by slug, for the lines it covers. */
  unitPrices(lines: readonly CodeLine[]): ReadonlyMap<string, Money>;
};

/**
 * The partner's pieces are never covered: he is owed his price whatever the buyer pays, so a discount
 * there would come entirely out of the shop's few euros of commission.
 */
function siteCouponCovers(coupon: SiteCoupon, line: CodeLine): boolean {
  if (line.consignment) return false;
  const wholeCart = coupon.productSlugs.length + coupon.categorySlugs.length + coupon.bundleSlugs.length === 0;
  return (
    wholeCart ||
    coupon.productSlugs.includes(line.slug) ||
    coupon.bundleSlugs.includes(line.slug) ||
    (line.category !== undefined && coupon.categorySlugs.includes(line.category))
  );
}

/** The percentage off the covered lines: a percentage as it is, an amount or a cap spread over them. */
function effectivePercent(coupon: SiteCoupon, coveredCents: number): number {
  const off = coupon.discountKind === "percentage" ? (coveredCents * coupon.discountValue) / 100 : Math.min(coveredCents, coupon.discountValue);
  const cap = coupon.maximumDiscountCents;
  if (cap !== null && off > cap) return (100 * cap) / coveredCents;
  return coupon.discountKind === "percentage" ? coupon.discountValue : (100 * off) / coveredCents;
}

function siteCouponPricing(coupon: SiteCoupon): CartCodePricing {
  return {
    code: coupon.code,
    minimumCents: coupon.minimumSubtotalCents,
    freeShipping: coupon.freeShipping,
    unitPrices(lines) {
      const covered = lines.filter((line) => siteCouponCovers(coupon, line));
      const coveredCents = covered.reduce((sum, line) => sum + line.price.amount * line.quantity, 0);
      if (coveredCents <= 0) return new Map();
      const percent = effectivePercent(coupon, coveredCents);
      return new Map(
        covered.map((line) => [line.slug, { amount: Math.round((line.price.amount * (100 - percent)) / 100), currency: line.price.currency }]),
      );
    },
  };
}

export type CartCode = { readonly pricing: CartCodePricing } | { readonly refused: string };

/** What the code typed in the cart does, or why it does nothing. A club's code answers first. */
export async function resolveCartCode(typed: string | undefined, findCoupon: FindSiteCoupon): Promise<CartCode | null> {
  if (!typed) return null;
  const club = findClub(typed);
  if (club) {
    return {
      pricing: {
        code: club.code,
        minimumCents: CLUB_MIN_ORDER_CENTS,
        freeShipping: false,
        unitPrices: (lines) => new Map(lines.map((line) => [line.slug, clubUnitPrice(line.slug, line.price)])),
      },
    };
  }
  const found = await findCoupon(normaliseClubCode(typed));
  if (found.status === "valid") return { pricing: siteCouponPricing(found.coupon) };
  return { refused: found.status === "inactive" ? CODE_INACTIVE : found.status === "unavailable" ? CODE_UNAVAILABLE : CODE_UNKNOWN };
}
