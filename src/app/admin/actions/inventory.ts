"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireStaffRole, requireUser } from "@/lib/auth/guards";
import type { StaffPrincipal, StaffRole } from "@/lib/auth/roles";
import { inventoryAdjustmentSchema } from "@/lib/admin/inventory";
import { listPendingRestockRequests } from "@/lib/admin/inventory-restock";
import { sendEmail } from "@/lib/email/resend";
import { restockNotificationEmail } from "@/lib/orders/restock-email";
import type { Database } from "@/lib/supabase/database.types";
import * as supabaseServer from "@/lib/supabase/server";

export type InventoryActionState = {
  readonly ok: boolean;
  readonly message: string;
  readonly newStock?: number;
};

export type RestockNotifyActionState = {
  readonly ok: boolean;
  readonly message: string;
  /** How many emails were successfully sent. */
  readonly sent?: number;
};

type Client = SupabaseClient<Database>;

async function verifiedStaff(client: Client, allowed: readonly StaffRole[]): Promise<StaffPrincipal> {
  await requireUser(client);
  return requireStaffRole(client, allowed);
}

function value(formData: FormData, key: string): string {
  const candidate = formData.get(key);
  return typeof candidate === "string" ? candidate : "";
}

function safeInventoryFailure(error: unknown): InventoryActionState {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("GD_INSUFFICIENT_STOCK")) return { ok: false, message: "Stock insufficiente per questa riduzione." };
  if (message.includes("GD_INVALID_STOCK_DELTA")) return { ok: false, message: "La variazione inventario non è valida." };
  if (message.includes("GD_INVALID_MANUAL_STOCK_REASON")) return { ok: false, message: "La causale inventario non è valida." };
  if (message.includes("GD_PRODUCT_NOT_FOUND")) return { ok: false, message: "Prodotto non trovato." };
  return { ok: false, message: "Movimento non registrato. Controlla i dati e riprova." };
}

export async function adjustInventoryAction(
  _previous: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const parsed = inventoryAdjustmentSchema.safeParse({
    sku: value(formData, "sku"),
    delta: value(formData, "delta"),
    reason: value(formData, "reason"),
    note: value(formData, "note"),
    confirmReduction: formData.get("confirmReduction") === "on",
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Controlla i dati inseriti." };

  try {
    const client = await supabaseServer.createSupabaseServerClient();
    await verifiedStaff(client, ["owner", "admin"]);
    const input = parsed.data;
    const args = {
      p_sku: input.sku,
      p_delta: input.delta,
      p_reason: input.reason,
      ...(input.note === null ? {} : { p_note: input.note }),
    };
    const { data, error } = await client.rpc("adjust_inventory", args);
    if (error) return safeInventoryFailure(error);

    revalidateTag("inventory", "max");
    revalidateTag("dashboard", "max");
    revalidateTag("products", "max");
    revalidatePath("/admin");
    revalidatePath("/admin/inventario");
    revalidatePath("/admin/prodotti");
    return { ok: true, message: `Movimento registrato. Stock attuale: ${data}.`, newStock: data };
  } catch (error) {
    return safeInventoryFailure(error);
  }
}

/** Why Resend refused, in words the owner can act on (same wording as orders.ts). */
function restockEmailFailure(reason: "not_configured" | "rejected", detail?: string): string {
  if (reason === "not_configured") return "l'invio email non è configurato (manca RESEND_API_KEY).";
  if (detail && /testing emails|verify a domain|domain is not verified|not verified/i.test(detail)) {
    return "il dominio geardropshop.it non è ancora verificato su Resend, quindi l'email può arrivare solo a te.";
  }
  return `Resend ha rifiutato l'invio (${detail ?? "errore sconosciuto"}).`;
}

/**
 * Sends a restock notification email to everyone who signed up for a product, then marks
 * only the successfully delivered requests as notified. Idempotency key per request id
 * prevents duplicate delivery on retries.
 */
export async function sendRestockNoticesAction(
  _previous: RestockNotifyActionState,
  formData: FormData,
): Promise<RestockNotifyActionState> {
  const productSlug = value(formData, "productSlug");
  const productName = value(formData, "productName");
  if (!productSlug || !productName) {
    return { ok: false, message: "Prodotto non specificato." };
  }

  try {
    const client = await supabaseServer.createSupabaseServerClient();
    await verifiedStaff(client, ["owner", "admin"]);

    const requests = await listPendingRestockRequests(client, productSlug);
    if (requests.length === 0) {
      return { ok: true, message: "Nessun avviso in attesa per questo prodotto.", sent: 0 };
    }

    let sent = 0;
    let lastEmailFailure: string | undefined;
    const notifiedIds: number[] = [];

    for (const request of requests) {
      const emailContent = restockNotificationEmail({
        productName,
        productSlug,
        to: request.email,
      });
      const result = await sendEmail({
        ...emailContent,
        idempotencyKey: `gd-restock-${request.id}`,
      });
      if (result.ok) {
        notifiedIds.push(request.id);
        sent++;
      } else {
        lastEmailFailure = restockEmailFailure(result.reason, result.detail);
        // Stop on a domain-verification block; it will affect every address.
        if (result.reason === "not_configured" || /domain is not verified|not verified|verify a domain/i.test(result.detail ?? "")) {
          break;
        }
      }
    }

    // Mark successfully delivered requests and purge old ones.
    if (notifiedIds.length > 0 || true) {
      // Always call to trigger the 6-month cleanup even when no new ones were sent.
      await client.rpc("mark_restock_notices_sent", { p_request_ids: notifiedIds });
    }

    revalidatePath("/admin/inventario");
    revalidateTag("inventory", "max");

    if (sent === 0 && lastEmailFailure) {
      return { ok: false, message: `Nessun avviso inviato: ${lastEmailFailure}`, sent: 0 };
    }
    const suffix = lastEmailFailure ? ` (attenzione: ${lastEmailFailure})` : "";
    return {
      ok: true,
      message: `Avvisi inviati: ${sent}${suffix}`,
      sent,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("GD_RESTOCK_MANAGER_REQUIRED")) {
      return { ok: false, message: "Permessi insufficienti." };
    }
    return { ok: false, message: "Operazione non completata. Riprova." };
  }
}
