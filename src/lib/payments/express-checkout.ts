/**
 * Shown when the cart cannot use express checkout: Takara-only and mixed Hasbro+Takara carts ship
 * partly from the partner's warehouse, and the buyer reaches them via the normal checkout.
 *
 * It lives outside the checkout actions because a "use server" file may export only async
 * functions: a constant exported there fails the production build.
 */
export const EXPRESS_CHECKOUT_LOCKED_MESSAGE =
  "La consegna rapida non è disponibile per questo carrello: usa il checkout normale per scegliere il metodo di spedizione.";

/** Express ships to an InPost Locker picked in the cart, since Stripe cannot ask for one (2026-10-23). */
export const EXPRESS_LOCKER_MISSING_MESSAGE = "Scegli il Locker InPost dove ritirare il pacco, poi paga.";
