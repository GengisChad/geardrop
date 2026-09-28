import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;
export type MarketSource = Database["public"]["Tables"]["market_sources"]["Row"];
export type PricingPolicy = Database["public"]["Tables"]["pricing_policies"]["Row"];
export type AgentRun = Database["public"]["Tables"]["agent_runs"]["Row"];
export type MarketObservation = Database["public"]["Tables"]["market_observations"]["Row"];
export type PricingProposal = Database["public"]["Tables"]["pricing_proposals"]["Row"];

export type ProposalListItem = PricingProposal & {
  readonly productName: string;
  readonly productSku: string;
};

export type ObservationListItem = MarketObservation & { readonly productName: string | null };

export async function listMarketSources(client: Client, organizationId: number): Promise<readonly MarketSource[]> {
  const { data, error } = await client.from("market_sources").select("*").eq("organization_id", organizationId)
    .order("active", { ascending: false }).order("kind").order("name");
  if (error) throw new Error("Impossibile caricare le fonti di mercato");
  return data ?? [];
}

export async function loadPricingPolicy(client: Client, organizationId: number): Promise<PricingPolicy> {
  const { data, error } = await client.from("pricing_policies").select("*").eq("organization_id", organizationId).maybeSingle();
  if (error) throw new Error("Impossibile caricare la politica prezzi");
  return data ?? {
    organization_id: organizationId,
    min_margin_bp: 2500,
    max_change_bp: 1500,
    cooldown_days: 7,
    rounding: "cents_90",
    products_per_run: 8,
    updated_at: new Date(0).toISOString(),
    updated_by: null,
  };
}

type ProductEmbed = { readonly name: string; readonly sku: string } | readonly { readonly name: string; readonly sku: string }[] | null;
const one = <T,>(value: T | readonly T[] | null): T | null => (Array.isArray(value) ? (value[0] ?? null) : (value as T | null));

export async function listProposals(
  client: Client,
  organizationId: number,
  status: "pending" | "decided",
  limit = 50,
): Promise<readonly ProposalListItem[]> {
  let query = client.from("pricing_proposals").select("*, product:products(name,sku)").eq("organization_id", organizationId);
  query = status === "pending" ? query.eq("status", "pending") : query.in("status", ["approved", "rejected"]);
  const { data, error } = await query.order(status === "pending" ? "created_at" : "decided_at", { ascending: false }).limit(limit);
  if (error) throw new Error("Impossibile caricare le proposte di prezzo");
  return ((data ?? []) as unknown as readonly (PricingProposal & { readonly product: ProductEmbed })[]).map(({ product, ...proposal }) => {
    const row = one(product);
    return { ...proposal, productName: row?.name ?? "Prodotto rimosso", productSku: row?.sku ?? "—" };
  });
}

export async function listAgentRuns(client: Client, organizationId: number, limit = 10): Promise<readonly AgentRun[]> {
  const { data, error } = await client.from("agent_runs").select("*").eq("organization_id", organizationId)
    .order("started_at", { ascending: false }).limit(limit);
  if (error) throw new Error("Impossibile caricare le esecuzioni dell'agente");
  return data ?? [];
}

export async function listObservations(
  client: Client,
  organizationId: number,
  options: { readonly productId?: number; readonly sinceDays?: number; readonly limit?: number } = {},
): Promise<readonly ObservationListItem[]> {
  let query = client.from("market_observations").select("*, product:products(name,sku)").eq("organization_id", organizationId);
  if (options.productId) query = query.eq("product_id", options.productId);
  if (options.sinceDays) query = query.gte("observed_at", new Date(Date.now() - options.sinceDays * 86_400_000).toISOString());
  const { data, error } = await query.order("observed_at", { ascending: false }).limit(options.limit ?? 100);
  if (error) throw new Error("Impossibile caricare le osservazioni di mercato");
  return ((data ?? []) as unknown as readonly (MarketObservation & { readonly product: ProductEmbed })[]).map(({ product, ...observation }) => ({
    ...observation,
    productName: one(product)?.name ?? null,
  }));
}
