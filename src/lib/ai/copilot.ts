import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ADMIN_NAV_ITEMS } from "@/lib/admin/navigation";
import type { Database } from "@/lib/supabase/database.types";
import { runAgent, type ClientTool } from "./agent-loop";
import { copilotActionTools, type CopilotAction } from "./copilot-actions";
import { CLAUDE_MODELS, emptyUsage, type ClaudeClient } from "./claude-api";
import { listObservations, listProposals } from "./pricing-repository";

/**
 * The partners' assistant: answers questions on stock, sales, forecast, profit and market with
 * read tools over the company in view, and since 2026-11-19 prepares changes (order status,
 * tracking, notes, stock, prices, costs) that run only when the partner presses "Conferma", with
 * the partner's own permissions (see copilot-actions.ts). It sees no customer's personal data:
 * orders come without names, emails, addresses or the buyer's notes.
 */

type Client = SupabaseClient<Database>;

export type CopilotTurn = { readonly role: "user" | "assistant"; readonly text: string; readonly actions?: readonly CopilotAction[] };
export type CopilotAnswer = { readonly answer: string; readonly dollars: number; readonly toolCalls: number; readonly actions: readonly CopilotAction[] };

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

export function copilotTools(client: Client, organizationId: number, collect: (action: CopilotAction) => void = () => {}): readonly ClientTool[] {
  return [
    ...copilotActionTools(client, organizationId, collect),
    tool("ordine", "Un ordine cercato per numero (es. GD-ESZGLRU5): stato, pagamento, data, spedizione, tracciamento e articoli. Senza dati personali.",
      { numero: { type: "string" } },
      async (input) => {
        const wanted = String(input.numero ?? "").trim().toUpperCase().slice(0, 30);
        const { data, error } = await client.from("orders")
          .select("id,order_number,created_at,status,payment_status,total_cents,refunded_cents,shipping_method_code,tracking_carrier,tracking_code,shipped_at,delivered_at")
          .eq("organization_id", organizationId).eq("order_number", wanted).maybeSingle();
        if (error || !data) throw new Error(`Ordine ${wanted} non trovato`);
        const items = await client.from("order_items").select("product_name_snapshot,sku_snapshot,quantity,unit_price_cents").eq("organization_id", organizationId).eq("order_id", data.id);
        return {
          numero: data.order_number, data: data.created_at.slice(0, 16), stato: data.status, pagamento: data.payment_status,
          totale_eur: euros(data.total_cents), rimborsato_eur: euros(data.refunded_cents), spedizione: data.shipping_method_code,
          corriere: data.tracking_carrier, tracciamento: data.tracking_code, spedito_il: data.shipped_at?.slice(0, 10) ?? null, consegnato_il: data.delivered_at?.slice(0, 10) ?? null,
          articoli: (items.data ?? []).map((item) => ({ nome: item.product_name_snapshot, sku: item.sku_snapshot, quantita: item.quantity, prezzo_eur: euros(item.unit_price_cents) })),
        };
      }),
    tool("da_spedire", "Ordini pagati non ancora spediti, dal più vecchio, senza dati personali.", {},
      async () => {
        const { data, error } = await client.from("orders").select("order_number,created_at,status,total_cents,shipping_method_code")
          .eq("organization_id", organizationId).eq("payment_status", "paid").is("shipped_at", null).in("status", ["confirmed", "processing"])
          .order("created_at", { ascending: true }).limit(100);
        if (error) throw new Error("Ordini non disponibili");
        return (data ?? []).map((order) => ({ numero: order.order_number, data: order.created_at.slice(0, 10), stato: order.status, totale_eur: euros(order.total_cents), spedizione: order.shipping_method_code }));
      }),
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

/**
 * Where things are done in the panel. The page list is the admin menu itself, so the assistant
 * can only name pages that exist (owner, 2026-11-18: it had invented "Magazzino > Riordini").
 */
const HOW_TO = [
  "Riordinare: in Previsioni vedi cosa e quanto; l'ordine al fornitore è una bozza in Carichi merce (Nuovo carico) segnata come ordinata, che diventa giacenza con «Carica in magazzino» quando la merce arriva.",
  "Spedire: Da spedire; con più ordini selezionati, «Crea spedizioni InPost» crea tutte le spedizioni e un PDF con le etichette.",
  "Controllare un pacco prima di chiuderlo: in Da spedire, «Controlla pacco» sull'ordine.",
  "Reso: nella scheda dell'ordine spedito, «Registra reso»; il rimborso con «Rimborsa».",
  "Correggere la giacenza: Conteggio inventario (conteggio fisico) o Inventario (singolo movimento).",
  "Cambiare un prezzo: la scheda del prodotto in Prodotti, Listino e margini, oppure le proposte in Prezzi IA.",
  "Rimborsare o annullare un ordine: solo dalla scheda dell'ordine in Ordini («Rimborsa», «Annulla»), perché muovono soldi.",
];

export function copilotSystemPrompt(company: string): string {
  const pages = ADMIN_NAV_ITEMS.filter((item) => !item.disabled).map((item) => item.label).join(", ");
  return [
    `Sei l'assistente del gestionale di ${company}. Rispondi ai soci in italiano, in modo breve e concreto, con i numeri.`,
    "Usa gli strumenti per leggere i dati reali prima di rispondere: magazzino, previsioni, ordini, prodotti, mercato, proposte di prezzo.",
    "Non inventare dati: se uno strumento non ha il dato dillo. Importi in euro; profitto e costi sono netti IVA.",
    "Puoi preparare modifiche con gli strumenti d'azione: cambia_stato_ordine, spedisci_ordine, nota_ordine, movimento_magazzino, cambia_prezzo, imposta_costo. Ogni azione diventa una scheda che l'utente conferma con un tasto, con i suoi permessi: non dire mai che una cosa è fatta finché la conversazione non riporta «Eseguita».",
    "Prima di preparare un'azione leggi i dati che servono (ordine, da_spedire, prodotto). Se l'utente chiede più cose, prepara una scheda per ciascuna. Se un dato è ambiguo (più prodotti con lo stesso nome), chiedi invece di indovinare.",
    "Rimborsi, annullamenti e coupon non li puoi preparare: indica dove farli.",
    `Le pagine del gestionale sono solo queste, con questi nomi: ${pages}. Non nominare pagine o menu che non sono in questo elenco.`,
    ...HOW_TO,
    "Formato: frasi brevi, **grassetto** per i nomi importanti, elenchi con «- ». Niente tabelle, niente emoji.",
  ].join("\n");
}

const OUTCOME: Record<CopilotAction["status"], string> = { pending: "in attesa di conferma", done: "Eseguita", failed: "Non riuscita", cancelled: "Annullata dall'utente" };

/** An assistant turn as the model reads it back: its text, then what became of each card. */
function withOutcomes(turn: CopilotTurn): string {
  if (!turn.actions?.length) return turn.text;
  return [turn.text, ...turn.actions.map((action) => `[${action.title}: ${OUTCOME[action.status]}${action.result ? ` · ${action.result}` : ""}]`)].join("\n");
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
  const actions: CopilotAction[] = [];
  try {
    const result = await runAgent(claude, usage, {
      model,
      system: copilotSystemPrompt(organization.name),
      messages: [...history.slice(-10).map((turn) => ({ role: turn.role, content: withOutcomes(turn) })), { role: "user" as const, content: question }],
      tools: copilotTools(client, organization.id, (action) => actions.push(action)),
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
    return { answer: result.text || (actions.length ? "Ecco cosa preparo: conferma sotto." : "Non ho una risposta con i dati disponibili."), dollars: usage.dollars, toolCalls: result.toolCalls, actions };
  } catch (error) {
    await client.rpc("finish_agent_run", {
      p_run_id: started.data,
      p_outcome: { status: "failed", input_tokens: usage.inputTokens, output_tokens: usage.outputTokens, error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}
