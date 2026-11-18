"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireStaffRole, requireUser } from "@/lib/auth/guards";
import { parseThreshold, stockCountNote, stockCountPlan, type StockCountChange, type StockCountProblem } from "@/lib/admin/stock-count";
import { loadStockCountRows } from "@/lib/admin/stock-count-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type StockCountState = {
  readonly ok: boolean;
  readonly message: string;
  readonly applied: readonly StockCountChange[];
  readonly problems: readonly StockCountProblem[];
};

/**
 * Applies a physical count. The figures are compared with the stock *now*, not with what the page
 * showed when it was opened, so an order paid in the meantime is not counted twice. Each change is
 * one "manual_adjustment" movement with the day of the count as its note, through the same
 * database function as a single adjustment (audited, never below zero).
 */
export async function applyStockCountAction(_previous: StockCountState, formData: FormData): Promise<StockCountState> {
  const counted = new Map<number, string>();
  const thresholds = new Map<number, number>();
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    const count = /^count-(\d+)$/.exec(key);
    if (count) counted.set(Number(count[1]), value);
    const minimum = /^min-(\d+)$/.exec(key);
    const threshold = minimum ? parseThreshold(value) : null;
    if (minimum && threshold !== null) thresholds.set(Number(minimum[1]), threshold);
  }

  try {
    const client = await createSupabaseServerClient();
    await requireUser(client);
    const principal = await requireStaffRole(client, ["owner", "admin"]);
    const organizationId = principal.organization.id;
    const rows = await loadStockCountRows(client, organizationId);
    const plan = stockCountPlan(rows, counted);
    const note = stockCountNote(new Date());

    const applied: StockCountChange[] = [];
    const problems: StockCountProblem[] = [...plan.problems];
    for (const change of plan.changes) {
      const { error } = await client.rpc("adjust_inventory", {
        p_organization_id: organizationId,
        p_sku: change.sku,
        p_delta: change.delta,
        p_reason: "manual_adjustment",
        p_note: note,
      });
      if (error) problems.push({ productId: change.productId, name: change.name, message: "Movimento non registrato: riprova." });
      else applied.push(change);
    }

    // Thresholds that changed: the warning "stock basso" and the order email follow them.
    let thresholdsChanged = 0;
    for (const row of rows) {
      const next = thresholds.get(row.productId);
      if (next === undefined || next === row.lowStockThreshold) continue;
      const { error } = await client
        .from("products")
        .update({ low_stock_threshold: next })
        .eq("id", row.productId)
        .eq("organization_id", organizationId);
      if (error) problems.push({ productId: row.productId, name: row.name, message: "Scorta minima non salvata." });
      else thresholdsChanged += 1;
    }

    if (applied.length > 0 || thresholdsChanged > 0) {
      revalidateTag("inventory", "max");
      revalidateTag("dashboard", "max");
      revalidateTag("products", "max");
      revalidatePath("/admin");
      revalidatePath("/admin/inventario");
      revalidatePath("/admin/inventario/conteggio");
    }

    const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    const parts = [
      count(applied.length, "giacenza aggiornata", "giacenze aggiornate"),
      count(plan.matching, "già giusta", "già giuste"),
      ...(thresholdsChanged > 0 ? [count(thresholdsChanged, "scorta minima cambiata", "scorte minime cambiate")] : []),
    ];
    return {
      ok: problems.length === 0,
      message: problems.length === 0 ? `${parts.join(", ")}.` : `${parts.join(", ")}. ${problems.length} da ricontrollare.`,
      applied,
      problems,
    };
  } catch {
    return { ok: false, message: "Conteggio non applicato. Riprova.", applied: [], problems: [] };
  }
}
