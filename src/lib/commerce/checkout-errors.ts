/**
 * Checkout failure vocabulary.
 *
 * Every rejection the order pipeline can produce is raised by PostgreSQL as a `GD_*`
 * message, so the boundary between database and UI is a small closed set of codes rather
 * than SQLSTATE strings or driver text. Anything unrecognised collapses to one neutral
 * sentence: an unmapped failure must never leak a query, a constraint name, or a table.
 */

/** Raised by the app itself, not by PostgreSQL, when no order backend is configured. */
export const CHECKOUT_UNAVAILABLE = "GD_CHECKOUT_UNAVAILABLE";

export const CHECKOUT_FALLBACK_MESSAGE =
  "Non siamo riusciti a registrare l'ordine. Riprova tra poco.";

const MESSAGES: Readonly<Record<string, string>> = {
  [CHECKOUT_UNAVAILABLE]:
    "Gli ordini non sono ancora attivi su questo sito. Il carrello resta salvato.",
  GD_ORDER_INTAKE_DISABLED:
    "Gli ordini non sono ancora attivi. Il carrello resta salvato: riprova più tardi.",
  GD_ORDER_INVALID_PAYLOAD:
    "Il carrello contiene righe non valide. Ricarica la pagina e riprova.",
  GD_ORDER_INVALID_QUANTITY: "Le quantità nel carrello non sono valide.",
  GD_ORDER_QUANTITY_LIMIT: "Hai superato la quantità massima consentita per articolo.",
  GD_PRICING_INVALID_LINES:
    "Il carrello contiene righe non valide. Ricarica la pagina e riprova.",
  GD_PRICING_PRODUCT_UNAVAILABLE:
    "Un articolo del carrello non è più disponibile nella quantità richiesta.",
  GD_PRICING_SHIPPING_INVALID: "Il metodo di spedizione scelto non è disponibile.",
  GD_PRICING_COUPON_INVALID:
    "Il codice sconto non è valido o non è applicabile a questo carrello.",
  GD_PRICING_TOTAL_TOO_LARGE: "Il totale del carrello supera il massimo gestibile.",
  GD_PRICING_CUSTOMER_MISMATCH: CHECKOUT_FALLBACK_MESSAGE,
};

/**
 * Pulls the domain code out of whatever the driver hands back. PostgREST reports the
 * raised message verbatim, but the code can also arrive inside `details` or `hint`
 * depending on where the exception surfaced, so every field is searched.
 */
export function checkoutErrorCode(error: unknown): string | null {
  if (typeof error === "string") return matchCode(error);
  if (typeof error !== "object" || error === null) return null;

  const candidate = error as Record<string, unknown>;
  for (const key of ["message", "details", "hint", "code"]) {
    const value = candidate[key];
    if (typeof value === "string") {
      const code = matchCode(value);
      if (code) return code;
    }
  }
  return null;
}

/** Maps any failure onto a sentence that is safe to render. */
export function checkoutErrorMessage(error: unknown): string {
  const code = checkoutErrorCode(error);
  if (!code) return CHECKOUT_FALLBACK_MESSAGE;
  return MESSAGES[code] ?? CHECKOUT_FALLBACK_MESSAGE;
}

function matchCode(value: string): string | null {
  return /GD_[A-Z0-9_]+/.exec(value)?.[0] ?? null;
}
