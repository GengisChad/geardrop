/**
 * Shown when the cart cannot use express checkout: a cart holding the partner's consignment pieces
 * ships at least partly from that warehouse, and the buyer reaches it via the normal checkout.
 *
 * It lives outside the checkout actions because a "use server" file may export only async
 * functions: a constant exported there fails the production build.
 */
export const EXPRESS_CHECKOUT_LOCKED_MESSAGE =
  "La consegna rapida non è disponibile per questo carrello: usa il checkout normale per scegliere il metodo di spedizione.";

/** A code tied to a buyer needs the email before the price is fixed, and only the checkout form asks first. */
export const EXPRESS_CODE_NEEDS_EMAIL_MESSAGE = "Questo codice si controlla con la tua email: usa \"Vai al checkout\" per pagare.";

/** Express ships to an InPost Locker picked in the cart, since Stripe cannot ask for one (2026-10-23). */
export const EXPRESS_LOCKER_MISSING_MESSAGE = "Scegli il Locker InPost dove ritirare il pacco, poi paga.";
