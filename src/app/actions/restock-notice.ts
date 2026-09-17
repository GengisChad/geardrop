"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type RestockNoticeState = {
  readonly ok: boolean;
  readonly message: string;
};

const restockNoticeSchema = z.object({
  slug: z.string().min(1).max(120).trim(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Controlla l'indirizzo email.")
    .max(320, "Controlla l'indirizzo email.")
    .email("Controlla l'indirizzo email."),
});

function failure(error: unknown): RestockNoticeState {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("GD_RESTOCK_INVALID_EMAIL"))
    return { ok: false, message: "Controlla l'indirizzo email." };
  if (message.includes("GD_RESTOCK_PRODUCT_NOT_FOUND"))
    return { ok: false, message: "Prodotto non trovato." };
  if (message.includes("GD_RESTOCK_INVALID_SLUG"))
    return { ok: false, message: "Prodotto non trovato." };
  return { ok: false, message: "Non è stato possibile registrare la richiesta. Riprova." };
}

export async function requestRestockNoticeAction(
  _previous: RestockNoticeState,
  formData: FormData,
): Promise<RestockNoticeState> {
  const parsed = restockNoticeSchema.safeParse({
    slug: formData.get("slug"),
    email: formData.get("email"),
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      message: first?.message ?? "Controlla l'indirizzo email.",
    };
  }

  try {
    const client = await createSupabaseServerClient();
    const { error } = await client.rpc("request_restock_notice", {
      p_slug: parsed.data.slug,
      p_email: parsed.data.email,
    });
    if (error) return failure(error);
    return { ok: true, message: "Ti avvisiamo appena torna disponibile." };
  } catch (error) {
    return failure(error);
  }
}
