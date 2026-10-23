import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";

/** The panel's view of the Vinted sync: what waits for the owner, what was recorded. */

export type VintedSaleRow = Database["public"]["Tables"]["vinted_sales"]["Row"];
export type InboundEmailRow = Pick<
  Database["public"]["Tables"]["inbound_emails"]["Row"],
  "id" | "from_address" | "subject" | "received_at" | "body_text"
>;

export type SuggestionView = {
  readonly lines: readonly { readonly slug: string; readonly quantity: number }[];
  readonly confidence: string;
  readonly source: string;
  readonly reason: string;
};

export type AppliedLineView = { readonly slug: string; readonly name: string; readonly quantity: number; readonly taken: number };

const lineShape = z.object({ slug: z.string().min(1).max(160), quantity: z.number().int().min(1).max(50) });

export function readSuggestion(value: unknown): SuggestionView {
  const parsed = z
    .object({
      lines: z.array(lineShape).default([]),
      confidence: z.string().default("low"),
      source: z.string().default("none"),
      reason: z.string().default(""),
    })
    .safeParse(value ?? {});
  return parsed.success ? parsed.data : { lines: [], confidence: "low", source: "none", reason: "" };
}

export function readAppliedLines(value: unknown): readonly AppliedLineView[] {
  const parsed = z
    .array(z.object({ slug: z.string(), name: z.string(), quantity: z.number(), taken: z.number() }))
    .safeParse(value ?? []);
  return parsed.success ? parsed.data : [];
}

export const applyVintedSaleSchema = z.object({
  saleId: z.coerce.number().int().positive(),
  lines: z.array(lineShape).min(1).max(20),
});

export const dismissVintedSaleSchema = z.object({
  saleId: z.coerce.number().int().positive(),
  note: z.string().trim().max(1000),
});

export async function loadVintedPanel(client: SupabaseClient<Database>) {
  const [pending, recent, other] = await Promise.all([
    client.from("vinted_sales").select("*").eq("status", "pending").order("sold_at", { ascending: false }).limit(50),
    client.from("vinted_sales").select("*").neq("status", "pending").order("sold_at", { ascending: false }).limit(60),
    client
      .from("inbound_emails")
      .select("id,from_address,subject,received_at,body_text")
      .eq("kind", "other")
      .order("received_at", { ascending: false })
      .limit(10),
  ]);
  if (pending.error || recent.error || other.error) throw new Error("Impossibile leggere le vendite Vinted.");
  return {
    pending: pending.data,
    recent: recent.data,
    other: other.data as readonly InboundEmailRow[],
  };
}
