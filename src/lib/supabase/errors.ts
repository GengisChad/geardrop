/**
 * Domain error mapping.
 *
 * The database raises stable `GD_*` codes (see supabase/migrations/0003_functions.sql and
 * 0005_admin.sql). Everything the user is allowed to see is in this table; anything else
 * collapses to one generic string so SQL text, table names, coupon limits and other
 * customers' data never reach the UI (design §10).
 */

const MESSAGES: Record<string, string> = {
  GD_INVALID_REQUEST: "Richiesta non valida. Ricarica la pagina e riprova.",
  GD_INVALID_CONTACT: "Controlla l'indirizzo email inserito.",
  GD_INVALID_ADDRESS: "Controlla l'indirizzo di spedizione.",
  GD_CHECKOUT_DISABLED: "Le vendite non sono ancora aperte. Torna a trovarci al prossimo drop.",
  GD_EMPTY_CART: "Il carrello è vuoto.",
  GD_INVALID_QUANTITY: "Quantità non valida per uno dei prodotti.",
  GD_DUPLICATE_SKU: "Un prodotto compare due volte nel carrello.",
  GD_PRODUCT_UNAVAILABLE: "Uno dei prodotti non è più disponibile.",
  GD_INSUFFICIENT_STOCK: "Le quantità richieste superano la disponibilità.",
  GD_INVALID_SHIPPING: "Metodo di spedizione non valido.",
  GD_INVALID_COUPON: "Codice sconto non valido o non applicabile.",
  GD_FORBIDDEN: "Non hai i permessi per questa operazione.",
  GD_ORDER_NOT_FOUND: "Ordine non trovato.",
  GD_INVALID_STATUS: "Stato non valido.",
  GD_INVALID_ROLE: "Ruolo non valido.",
  GD_USER_NOT_FOUND: "Nessun utente registrato con questa email.",
  GD_CANNOT_DEMOTE_SELF: "Un owner non può rimuovere o declassare se stesso.",
};

export const GENERIC_ERROR = "Operazione non riuscita. Riprova più tardi.";

/**
 * Extracts a known domain code from a PostgREST error message. The RPCs raise the bare
 * code, but PostgREST wraps it, so the code is matched anywhere in the string.
 */
export function domainMessage(raw: string | null | undefined): string {
  if (!raw) return GENERIC_ERROR;

  for (const [code, message] of Object.entries(MESSAGES)) {
    if (raw.includes(code)) return message;
  }
  return GENERIC_ERROR;
}

export function domainCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return Object.keys(MESSAGES).find((code) => raw.includes(code)) ?? null;
}
