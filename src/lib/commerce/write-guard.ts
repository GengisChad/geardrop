import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Two switches in `site_settings` decide whether the shop may change commercial state:
 *
 * - `maintenance_mode` freezes every commercial write — checkout, refunds, shipping, notes,
 *   customer emails — for staff too. It exists for cut-overs where nothing may change under
 *   the operator's feet, such as applying a database migration to a live shop.
 * - `accept_orders` governs only new orders taken through the database checkout. The static
 *   catalogue Stripe checkout predates the switch, and production sells through it with
 *   `accept_orders = false` (see docs/operations/geardrop-production-rollout.md): enforcing
 *   the switch there would stop live sales, so callers opt in with `requireAcceptOrders`.
 *
 * Both switches belong to one company: every read names it. Both reads fail closed: if the
 * switches cannot be read, nothing is written.
 */
export type CommerceSwitches = { readonly maintenanceMode: boolean; readonly acceptOrders: boolean };

export type CommerceWriteBlockedCode =
  | "GD_COMMERCE_MAINTENANCE"
  | "GD_CHECKOUT_INTAKE_CLOSED"
  | "GD_COMMERCE_SWITCHES_UNAVAILABLE";

export class CommerceWriteBlockedError extends Error {
  readonly code: CommerceWriteBlockedCode;

  constructor(code: CommerceWriteBlockedCode) {
    super(code);
    this.name = "CommerceWriteBlockedError";
    this.code = code;
  }
}

/** Long enough for a healthy round trip, short enough that a stuck read never holds a buyer. */
const SWITCH_READ_TIMEOUT_MS = 5_000;

export async function readCommerceSwitches(
  client: SupabaseClient<Database>,
  organizationId: number,
): Promise<CommerceSwitches> {
  try {
    const { data, error } = await client
      .from("site_settings")
      .select("maintenance_mode,accept_orders")
      .eq("organization_id", organizationId)
      .abortSignal(AbortSignal.timeout(SWITCH_READ_TIMEOUT_MS))
      .maybeSingle();
    if (error || !data) throw new CommerceWriteBlockedError("GD_COMMERCE_SWITCHES_UNAVAILABLE");
    return { maintenanceMode: data.maintenance_mode === true, acceptOrders: data.accept_orders === true };
  } catch (error) {
    if (error instanceof CommerceWriteBlockedError) throw error;
    throw new CommerceWriteBlockedError("GD_COMMERCE_SWITCHES_UNAVAILABLE");
  }
}

/** Throws unless commercial writes are allowed. Call it before any database, email or payment effect. */
export async function assertCommerceMaintenanceOpen(
  client: SupabaseClient<Database>,
  organizationId: number,
): Promise<void> {
  const switches = await readCommerceSwitches(client, organizationId);
  if (switches.maintenanceMode) throw new CommerceWriteBlockedError("GD_COMMERCE_MAINTENANCE");
}

/** Throws unless a new order may be taken. Maintenance is checked first. */
export async function assertCheckoutIntakeOpen(
  client: SupabaseClient<Database>,
  organizationId: number,
  options: { readonly requireAcceptOrders: boolean },
): Promise<void> {
  const switches = await readCommerceSwitches(client, organizationId);
  if (switches.maintenanceMode) throw new CommerceWriteBlockedError("GD_COMMERCE_MAINTENANCE");
  if (options.requireAcceptOrders && !switches.acceptOrders) throw new CommerceWriteBlockedError("GD_CHECKOUT_INTAKE_CLOSED");
}

const MESSAGES: Record<CommerceWriteBlockedCode, { readonly customer: string; readonly staff: string }> = {
  GD_COMMERCE_MAINTENANCE: {
    customer: "Il negozio è in manutenzione: gli ordini riaprono a breve.",
    staff: "Negozio in manutenzione: ordini, rimborsi e spedizioni sono sospesi. Disattiva la manutenzione nelle impostazioni per procedere.",
  },
  GD_CHECKOUT_INTAKE_CLOSED: {
    // Same sentence the database returns for GD_ORDER_INTAKE_DISABLED (checkout-errors.ts).
    customer: "Gli ordini non sono ancora attivi. Il carrello resta salvato: riprova più tardi.",
    staff: "Il negozio non accetta nuovi ordini: attivali dalle impostazioni.",
  },
  GD_COMMERCE_SWITCHES_UNAVAILABLE: {
    customer: "Non riusciamo a verificare lo stato del negozio. Riprova tra qualche minuto.",
    staff: "Impossibile verificare lo stato del negozio: operazione non eseguita. Riprova.",
  },
};

/** The message for a blocked write, or null when the error is not one of the guard's. */
export function commerceWriteBlockedMessage(error: unknown, audience: "customer" | "staff"): string | null {
  return error instanceof CommerceWriteBlockedError ? MESSAGES[error.code][audience] : null;
}
