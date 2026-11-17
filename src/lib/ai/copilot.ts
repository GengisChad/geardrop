import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";
import { runAgent, type ClientTool } from "./agent-loop";
import { CLAUDE_MODELS, emptyUsage, type ClaudeClient } from "./claude-api";
import { listObservations, listProposals } from "./pricing-repository";

/**
 * The partners' assistant: answers questions on stock, sales, forecast, profit and market
 * with read-only tools over the company in view. It changes nothing and sees no customer's
 * personal data: orders come without names, emails or addresses.
 */

type Client = SupabaseClient<Database>;

export type CopilotTurn = { readonly role: "user" | "assistant"; readonly text: string };
export type CopilotAnswer = { readonly answer: string; readonly dollars: number; readonly toolCalls: number };

const euros = (cents: number | null | undefined) => (cents == null ? null : Math.round(cents) / 100);

function tool(name: string, description: string, properties: Record<string, unknown>, run: (input: Record<string, unknown>) => Promise<unknown>): ClientTool {
  return {
    name,
    description,
    input_schema: { type: "object", properties, required: [] },
    run: (input) => run(input && typeof input === "object" ? input as Record<string, unknown> : {}),
  };
}

const searchText = z.string().trim().max(100).optional().catch(undefined);
const days = z.number().int().min(1).max(365).optional().catch(undefined);

export function copilotTools(client: Client, organizationId: number): readonly ClientTool[] {
  return [
    tool("panoramica_magazzino", "Valore del magazzino, profitto e ordini completi/incompleti degli ultimi N giorni, prodotti senza costo, carichi in bozza.",
      { giorni: { type: "integer", description: "Periodo in giorni, default 30" } },
      async (input) => {
        const { data, error } = await client.rpc("get_warehouse_summary", { p_organization_id: organizationId, p_days: days.parse(input.giorni) ?? 30 });
        if (error) throw new Error("Riepilogo non disponibile");
        return data;
      }),
    tool("previsioni", "Ritmo di vendita, copertura in giorni, data di esaurimento e quantità da riordinare per prodotto, dal più urgente.",
      { cerca: { type: "string", description: "Filtra per nome o SKU" }, limite: { type: "integer" } },
      async (input) => {
        const { data, error } = await client.rpc("get_inventory_forecast", { p_organization_id: organizationId, p_lead_days: 14, p_target_days: 45 });
        if (error) throw new Error("Previsioni non disponibili");
        const needle = searchText.parse(input.cerca)?.toLowerCase();
        return (data ?? [])
          .filter((row) => !needle || row.name.toLowerCase().includes(needle) || row.sku.toLowerCase().includes(needle))
          .slice(0, Math.min(Number(input.limite) || 25, 60))
          .map((row) => ({
            sku: row.sku, nome: row.name, stato: row.publication_status, prezzo_eur: euros(row.price_cents),
            stock: row.unlimited_stock ? "su ordinazione" : row.stock_quantity, venduti_7_30_90: [row.sold_7, row.sold_30, row.sold_90],
            ritmo_giorno: Number(row.daily_rate), copertura_giorni: row.days_of_cover === null ? null : Number(row.days_of_cover),
            esaurimento: row.stockout_date, da_riordinare: row.suggested_reorder, costo_medio_eur: euros(row.average_cost_cents),
            preordini_da_servire: row.preorder_backlog, in_arrivo: row.incoming_quantity,
          }));
      }),
    tool("ordini_recenti", "Ordini degli ultimi N giorni (senza dati personali) con totale, stato e profitto quando calcolabile.",
      { giorni: { type: "integer", description: "Default 14" } },
      async (input) => {
        const since = new Date(Date.now() - (days.parse(input.giorni) ?? 14) * 86_400_000).toISOString();
        const [orders, profits] = await Promise.all([
          client.from("orders").select("id,order_number,created_at,status,payment_status,total_cents,refunded_cents,shipping_method_code")
            .eq("organization_id", organizationId).gte("created_at", since).order("created_at", { ascending: false }).limit(100),
          client.from("order_profit").select("order_id,revenue_net_cents,profit_cents,missing")
            .eq("organization_id", organizationId).gte("created_at", since).limit(200),
        ]);
        if (orders.error || profits.error) throw new Error("Ordini non disponibili");
        const profitById = new Map((profits.data ?? []).map((row) => [row.order_id, row]));
        return (orders.data ?? []).map((order) => {
          const profit = profitById.get(order.id);
          return {
            numero: order.order_number, data: order.created_at.slice(0, 16), stato: order.status, pagamento: order.payment_status,
            totale_eur: euros(order.total_cents), rimborsato_eur: euros(order.refunded_cents), spedizione: order.shipping_method_code,
            ricavo_netto_eur: euros(profit?.revenue_net_cents), profitto_eur: euros(profit?.profit_cents), costi_mancanti: profit?.missing ?? null,
          };
        });
      }),
    tool("prodotto", "Scheda di un prodotto cercato per nome o SKU: prezzo, stock, costo medio, valore, stato.",
      { cerca: { type: "string" } },
      async (input) => {
        const needle = searchText.parse(input.cerca);
        if (!needle) throw new Error("Indica nome o SKU");
        const pattern = `%${needle.replace(/[,%_()]/g, "")}%`;
        const { data, error } = await client.from("inventory_valuation")
          .select("product_id,sku,name,stock_quantity,unlimited_stock,average_cost_cents,last_cost_cents,value_cents")
          .eq("organization_id", organizationId).or(`name.ilike.${pattern},sku.ilike.${pattern}`).limit(10);
        if (error) throw new Error("Prodotto non disponibile");
        const ids = (data ?? []).flatMap((row) => (row.product_id === null ? [] : [row.product_id]));
        const prices = ids.length
          ? await client.from("products").select("id,price_cents,publication_status,stock_status").eq("organization_id", organizationId).in("id", ids)
          : { data: [], error: null };
        const priceById = new Map((prices.data ?? []).map((row) => [row.id, row]));
        return (data ?? []).map((row) => {
          const product = row.product_id === null ? undefined : priceById.get(row.product_id);
          return {
            sku: row.sku, nome: row.name, prezzo_eur: euros(product?.price_cents), stato: product?.publication_status, disponibilita: product?.stock_status,
            stock: row.unlimited_stock ? "su ordinazione" : row.stock_quantity, costo_medio_eur: euros(row.average_cost_cents),
            ultimo_costo_eur: euros(row.last_cost_cents), valore_magazzino_eur: euros(row.value_cents),
          };
        });
      }),
    tool("mercato", "Prezzi osservati dall'agente sulle fonti approvate negli ultimi N giorni.",
      { giorni: { type: "integer", description: "Default 30" } },
      async (input) => (await listObservations(client, organizationId, { sinceDays: days.parse(input.giorni) ?? 30, limit: 80 })).map((row) => ({
        prodotto: row.productName, fonte: row.source_domain, titolo: row.title, prezzo_eur: euros(row.price_cents),
        disponibilita: row.availability, condizione: row.item_condition, data: row.observed_at.slice(0, 10), url: row.url,
      }))),
    tool("proposte_prezzo", "Proposte di prezzo in attesa di decisione, con motivazione e verifica della politica.", {},
      async () => (await listProposals(client, organizationId, "pending", 30)).map((row) => ({
        prodotto: row.productName, sku: row.productSku, attuale_eur: euros(row.current_price_cents), proposto_eur: euros(row.proposed_price_cents),
        confidenza: Number(row.confidence), fuori_politica: row.out_of_policy, note: row.policy_notes, motivazione: row.rationale,
      }))),
  ];
}

function system(company: string): string {
  return [
    `Sei l'assistente del gestionale di ${company}. Rispondi ai soci in italiano, in modo breve e concreto, con i numeri.`,
    "Usa gli strumenti per leggere i dati reali prima di rispondere: magazzino, previsioni, ordini, prodotti, mercato, proposte di prezzo.",
    "Non inventare dati: se uno strumento non ha il dato dillo. Importi in euro; profitto e costi sono netti IVA.",
    "Non puoi modificare nulla: per azioni (riordini, prezzi, spedizioni) indica la pagina del gestionale da usare.",
  ].join("\n");
}

export async function askCopilot(
  client: Client,
  claude: ClaudeClient,
  organization: { readonly id: number; readonly name: string },
  history: readonly CopilotTurn[],
  question: string,
  model: string = process.env["COPILOT_MODEL"]?.trim() || CLAUDE_MODELS.worker,
): Promise<CopilotAnswer> {
  const started = await client.rpc("start_agent_run", { p_organization_id: organization.id, p_agent: "copilot", p_models: [model] });
  if (started.error) throw new Error(started.error.message);
  const usage = emptyUsage();
  try {
    const result = await runAgent(claude, usage, {
      model,
      system: system(organization.name),
      messages: [...history.slice(-10).map((turn) => ({ role: turn.role, content: turn.text })), { role: "user" as const, content: question }],
      tools: copilotTools(client, organization.id),
      maxTokens: 2048,
      maxTurns: 8,
    });
    await client.rpc("finish_agent_run", {
      p_run_id: started.data,
      p_outcome: {
        status: "succeeded", input_tokens: usage.inputTokens, output_tokens: usage.outputTokens, web_searches: 0,
        cost_estimate_cents: Math.ceil(usage.dollars * 100), summary: question.slice(0, 500),
      },
    });
    return { answer: result.text || "Non ho una risposta con i dati disponibili.", dollars: usage.dollars, toolCalls: result.toolCalls };
  } catch (error) {
    await client.rpc("finish_agent_run", {
      p_run_id: started.data,
      p_outcome: { status: "failed", input_tokens: usage.inputTokens, output_tokens: usage.outputTokens, error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}
