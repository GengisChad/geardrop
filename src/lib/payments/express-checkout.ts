/**
 * Shown when the cart's shipping plan does not include Poste home ("standard").
 *
 * Takara-only and mixed Hasbro+Takara carts are locked to partner or InPost routes;
 * the buyer reaches them via the normal checkout where they pick the method explicitly.
 *
 * It lives outside the checkout actions because a "use server" file may export only async
 * functions: a constant exported there fails the production build.
 */
export const EXPRESS_CHECKOUT_LOCKED_MESSAGE =
  "La consegna rapida non è disponibile per questo carrello: usa il checkout normale per scegliere il metodo di spedizione.";
