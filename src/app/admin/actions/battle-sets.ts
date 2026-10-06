"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { countBattleSetSchema, openBattleSetsSchema } from "@/lib/admin/battle-sets";
import { requireStaffRole, requireUser } from "@/lib/auth/guards";
import { STOREFRONT_CACHE_TAGS } from "@/lib/storefront/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BattleSetActionState = { readonly ok: boolean; readonly message: string };

const MANAGERS = ["owner", "admin"] as const;
const text = (data: FormData, key: string) => (typeof data.get(key) === "string" ? String(data.get(key)) : "");

async function managerClient() {
  const client = await createSupabaseServerClient();
  await requireUser(client);
  await requireStaffRole(client, MANAGERS);
  return client;
}

function failure(error: unknown): BattleSetActionState {
  const message =
    error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : "";
  if (message.includes("GD_NOT_ENOUGH_SEALED_SETS")) return { ok: false, message: "Non ci sono abbastanza set sigillati." };
  if (message.includes("GD_BATTLE_SET_COUNT_INVALID")) return { ok: false, message: "Controlla i numeri: interi, da zero in su." };
  if (message.includes("GD_INVENTORY_MANAGER_REQUIRED")) return { ok: false, message: "Permessi insufficienti." };
  return { ok: false, message: "Operazione non completata. Riprova." };
}

function refresh() {
  // The loose tops are on the site: their availability changes with the sets.
  revalidateTag(STOREFRONT_CACHE_TAGS.products, { expire: 0 });
  revalidateTag("inventory", "max");
  revalidatePath("/admin/inventario");
}

/** Sets opened in a batch: they become loose pieces; what the shop can sell does not change. */
export async function openBattleSetsAction(_previous: BattleSetActionState, formData: FormData): Promise<BattleSetActionState> {
  const parsed = openBattleSetsSchema.safeParse({ setSlug: text(formData, "setSlug"), count: text(formData, "count") });
  if (!parsed.success) return { ok: false, message: "Indica quanti set hai aperto (da 1 a 1000)." };
  try {
    const client = await managerClient();
    const { data, error } = await client.rpc("open_battle_sets", { p_set_slug: parsed.data.setSlug, p_count: parsed.data.count });
    if (error) return failure(error);
    refresh();
    return { ok: true, message: `Registrati ${parsed.data.count} set aperti. Sigillati rimasti: ${data}.` };
  } catch (error) {
    return failure(error);
  }
}

/** What is on the shelf, counted by hand: the panel and the site start from these numbers. */
export async function countBattleSetAction(_previous: BattleSetActionState, formData: FormData): Promise<BattleSetActionState> {
  const loose: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("loose:") && typeof value === "string") loose[key.slice("loose:".length)] = value;
  }
  const parsed = countBattleSetSchema.safeParse({ setSlug: text(formData, "setSlug"), sealed: text(formData, "sealed"), loose });
  if (!parsed.success) return { ok: false, message: "Controlla i numeri: interi, da zero in su." };
  try {
    const client = await managerClient();
    const { error } = await client.rpc("count_battle_set", {
      p_set_slug: parsed.data.setSlug,
      p_sealed: parsed.data.sealed,
      p_loose: parsed.data.loose,
    });
    if (error) return failure(error);
    refresh();
    return { ok: true, message: "Conteggio salvato: magazzino e sito aggiornati." };
  } catch (error) {
    return failure(error);
  }
}
