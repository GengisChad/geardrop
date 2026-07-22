"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireStaffRole, requireUser } from "@/lib/auth/guards";
import type { StaffPrincipal, StaffRole } from "@/lib/auth/roles";
import { inventoryAdjustmentSchema } from "@/lib/admin/inventory";
import type { Database } from "@/lib/supabase/database.types";
import * as supabaseServer from "@/lib/supabase/server";

export type InventoryActionState = {
  readonly ok: boolean;
  readonly message: string;
  readonly newStock?: number;
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
