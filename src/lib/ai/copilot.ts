import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ADMIN_NAV_ITEMS } from "@/lib/admin/navigation";
import type { Database } from "@/lib/supabase/database.types";
import { runAgent, type ClientTool } from "./agent-loop";
import { PRODUCTS } from "@/data/catalog";
import { copilotActionTools, shopDetailLists, type CopilotAction } from "./copilot-actions";
import { CLAUDE_MODELS, emptyUsage, SERVER_SIDE_FALLBACK_BETA, type ClaudeClient } from "./claude-api";
import { listObservations, listProposals } from "./pricing-repository";

/**
 * The partners' assistant: answers questions on stock, sales, forecast, profit and market with
 * read tools over the company in view, and since 2026-11-19 prepares changes (order status,
 * tracking, notes, stock, prices, costs) that run only when the partner presses "Conferma", with
 * the partner's own permissions (see copilot-actions.ts), and since 2026-11-24 product sheets too
 * (name, SKU, texts, category, offer, publication, specs). It sees no customer's personal data:
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
    tool("elenco_prodotti", "Tutti i prodotti: SKU, nome come lo mostra il sito, prezzo, giacenza e pubblicazione. Usalo per trovare un prodotto quando il nome dato dal socio non basta («il grip», «la fenice rossa»).", {},
      async () => {
        // "*" and not a column list: storefront_fields may not exist yet (migration 20261124120000).
        const { data, error } = await client.from("products").select("*").eq("organization_id", organizationId).order("sort_order").limit(200);
        if (error) throw new Error("Prodotti non disponibili");
        const catalogue = new Map(PRODUCTS.map((product) => [product.slug as string, product]));
        return (data ?? []).map((row) => {
          const page = catalogue.get(row.slug);
          const marked = new Set(row.storefront_fields ?? []);
          return {
            sku: row.sku, nome: page && !marked.has("name") ? page.name : row.name, prezzo_eur: euros(row.price_cents),
            stock: row.stock_quantity, pubblicazione: row.publication_status, sul_sito: page ? "sì" : "no, solo nel gestionale",
          };
        });
      }),
    tool("scheda_prodotto", "La scheda completa di un prodotto cercato per nome o SKU, come la mostra il sito: nome, nome breve, SKU, slug, categoria, tipo blade, tagline, descrizione, prezzo e prezzo barrato, pubblicazione, specifiche, feature, confezione e foto. Leggila prima di modifica_prodotto o dettagli_prodotto.",
      { cerca: { type: "string" } },
      async (input) => {
        const needle = searchText.parse(input.cerca);
        if (!needle) throw new Error("Indica nome o SKU");
        const pattern = `%${needle.replace(/[,%_()]/g, "")}%`;
        const { data, error } = await client.from("products").select("*, category:categories(name,slug)")
          .eq("organization_id", organizationId).or(`name.ilike.${pattern},sku.ilike.${pattern},slug.ilike.${pattern}`).limit(5);
        if (error) throw new Error("Prodotto non disponibile");
        const rows = data ?? [];
        if (rows.length === 0) throw new Error(`Nessun prodotto per «${needle}»`);
        if (rows.length > 1) return { piu_prodotti: rows.map((row) => ({ nome: row.name, sku: row.sku })), nota: "Più prodotti: richiama con lo SKU." };
        const row = rows[0]!;
        const lists = await shopDetailLists(client, row);
        const marked = new Set(row.storefront_fields ?? []);
        const catalogue = PRODUCTS.find((product) => product.slug === row.slug);
        // The page prints the catalogue's copy for every field the back office never changed.
        const shown = <T,>(field: string, sheet: T, page: T | undefined) => (catalogue && !marked.has(field) && page !== undefined ? page : sheet);
        const images = await client.from("product_images").select("alt,published,is_primary,sort_order").eq("organization_id", organizationId).eq("product_id", row.id).order("sort_order").limit(50);
        return {
          sku: row.sku, slug: row.slug, sul_sito: catalogue ? `/prodotto/${row.slug}` : "non è nel catalogo del sito",
          nome: shown("name", row.name, catalogue?.name), nome_breve: row.short_name, tagline: shown("tagline", row.tagline, catalogue?.tagline),
          descrizione: shown("description", row.description, catalogue?.description),
          categoria: (Array.isArray(row.category) ? row.category[0] : row.category)?.name ?? null, tipo_blade: row.blade_type,
          prezzo_eur: euros(row.price_cents), prezzo_barrato_eur: euros(row.compare_at_price_cents), pubblicazione: row.publication_status,
          specifiche: lists.specs, feature: lists.features, confezione: lists.boxContents.map(({ content }) => content),
          foto: catalogue && !marked.has("images")
            ? catalogue.images.map((image) => image.alt)
            : (images.data ?? []).filter((image) => image.published).map((image) => image.alt),
        };
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
  "Cambiare nome, SKU, testi, specifiche o pubblicazione di un prodotto: la sua scheda in Prodotti, oppure chiedilo a me. Il sito si aggiorna entro pochi minuti.",
  "Cambiare le foto di un prodotto: la sezione Immagini della sua scheda in Prodotti. Le foto nuove caricate nella libreria media non compaiono ancora sul sito: le aggiunge chi cura il codice del sito.",
  "Rimborsare o annullare un ordine: solo dalla scheda dell'ordine in Ordini («Rimborsa», «Annulla»), perché muovono soldi.",
];

/** Today as the partners say it, in Italian time: "martedì 24 novembre 2026". */
function today(now: Date): string {
  return new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
}

/**
 * The assistant's brief. Since 2026-11-24 (owner: "risponde a caso, mi serve un vero agente IA") it
 * is told to act: read what it needs, prepare every card the request calls for in one go, and ask
 * only for what it cannot read. "Scheda di conferma" is the card; "scheda prodotto" the product
 * sheet: the two used to share one word, and the model mixed them up.
 */
export function copilotSystemPrompt(company: string, now: Date = new Date()): string {
  const pages = ADMIN_NAV_ITEMS.filter((item) => !item.disabled).map((item) => item.label).join(", ");
  return [
    `Sei l'agente operativo del gestionale di ${company}: lavori per i soci, che spesso ti scrivono dal telefono quando non sono al computer. Rispondi in italiano, breve e concreto, con i numeri.`,
    `Oggi è ${today(now)}, ora italiana.`,
    "",
    "Come lavori:",
    "- Prima leggi, poi rispondi: ogni dato (ordini, giacenze, prezzi, schede prodotto, vendite, mercato) viene dagli strumenti, mai dalla memoria né da una risposta precedente se può essere cambiato. Se non trovi un prodotto per nome, usa elenco_prodotti.",
    "- Quando ti chiedono di cambiare qualcosa, preparalo subito con gli strumenti d'azione, senza chiedere il permesso in chat: ogni azione diventa una scheda di conferma, e la modifica parte solo quando il socio preme «Conferma», con i suoi permessi. Prepara nella stessa risposta tutte le schede che la richiesta richiede.",
    "- Chiedi solo ciò che non puoi leggere né ricavare: quale di due prodotti con lo stesso nome, un prezzo o un codice mai detto.",
    "- Se uno strumento risponde con un errore, leggi il motivo, correggi e riprova; se non si può fare, dillo in una frase con il motivo.",
    "- Chiudi dicendo cosa hai preparato e cosa resta da fare. Non dire mai che una cosa è fatta finché la conversazione non riporta «Eseguita».",
    "- Una scheda di conferma esiste solo se chiami lo strumento d'azione in questa risposta: quelle delle risposte precedenti non contano. Non scrivere «scheda pronta» o «conferma qui sotto» senza averlo chiamato ora.",
    "- Non inventare dati: se uno strumento non ha il dato, dillo. Importi in euro; profitto e costi sono netti IVA.",
    "",
    "Strumenti d'azione: cambia_stato_ordine, spedisci_ordine, nota_ordine, movimento_magazzino, cambia_prezzo, imposta_costo, modifica_prodotto, dettagli_prodotto.",
    "Prodotti: leggi prima scheda_prodotto. Con modifica_prodotto cambi nome, nome breve, SKU, tagline, descrizione, categoria, tipo blade, offerta (prezzo barrato) e pubblicazione; con dettagli_prodotto le specifiche, le feature e la confezione; il prezzo con cambia_prezzo; la giacenza con movimento_magazzino. Se sulla stessa scheda prodotto ora si vende un pezzo diverso, aggiorna anche tagline, descrizione e dettagli perché parlino del pezzo nuovo: scrivi tu testi brevi, senza promettere ciò che non sai. Il sito si aggiorna entro pochi minuti dalla conferma.",
    "Ordini: «segna come spedito/evaso» senza un codice di tracciamento si fa con cambia_stato_ordine (nessuna email); spedisci_ordine solo quando il socio dà corriere e codice.",
    "Non puoi preparare: rimborsi, annullamenti, coupon, lo slug (l'indirizzo della pagina), un prodotto nuovo che compaia sul sito, foto nuove sul sito. Indica dove si fanno; per prodotti nuovi e foto serve chi cura il codice del sito.",
    `Le pagine del gestionale sono solo queste, con questi nomi: ${pages}. Non nominare pagine o menu che non sono in questo elenco.`,
    ...HOW_TO,
    "",
    "Formato: frasi brevi, **grassetto** per i nomi importanti, elenchi con «- ». Niente tabelle, niente emoji.",
  ].join("\n");
}

const OUTCOME: Record<CopilotAction["status"], string> = { pending: "in attesa di conferma", done: "Eseguita", failed: "Non riuscita", cancelled: "Annullata dall'utente" };

/** An assistant turn as the model reads it back: its text, then what became of each card. */
function withOutcomes(turn: CopilotTurn): string {
  if (!turn.actions?.length) return turn.text;
  return [turn.text, ...turn.actions.map((action) => `[${action.title}: ${OUTCOME[action.status]}${action.result ? ` · ${action.result}` : ""}]`)].join("\n");
}

/**
 * An answer that points the partner at a card to confirm. Not the bare word "scheda": until
 * 2026-11-24 it matched "la scheda del prodotto" too, so a plain answer about a product sheet was
 * sent back and could come out as "Non sono riuscito a preparare la scheda".
 */
export function claimsACard(text: string): boolean {
  return /tast[oi] qui sotto|«\s*conferma\s*»|\bpremi\s+(il tasto\s+)?conferma\b|conferma(lo|la|le|li)? (qui )?sotto|sched[ae] (di conferma )?(pront[ae]|preparat[ae]|da confermare)|ho preparato (la|le|una|\d+) sched/i.test(text);
}

const NO_CARD_NUDGE =
  "In questa risposta non hai chiamato nessuno strumento d'azione, quindi non c'è nessuna scheda da confermare. Se serve un'azione, chiama ora lo strumento; altrimenti rispondi senza parlare di schede.";
const NO_CARD_ANSWER = "Non sono riuscito a preparare la scheda. Riscrivi la richiesta indicando ordine o prodotto e cosa fare.";

/** The text the partner reads, saying so when the run stopped before its end. */
function finalAnswer(result: { readonly text: string; readonly stopReason: string }, cards: number): string {
  const unfinished = result.stopReason === "deadline" || result.stopReason === "max_turns" || result.stopReason === "max_tokens";
  if (result.stopReason === "refusal" && !result.text) return "Su questa richiesta il modello si è fermato. Riformulala indicando ordine o prodotto e cosa fare.";
  const text = result.text || (cards ? "Ecco cosa ho preparato: conferma sotto." : "Non ho una risposta con i dati disponibili.");
  return unfinished ? `${text}\n\nMi sono fermato prima di finire: ${cards ? "conferma le schede pronte e " : ""}chiedimi di continuare.` : text;
}

export async function askCopilot(
  client: Client,
  claude: ClaudeClient,
  organization: { readonly id: number; readonly name: string },
  history: readonly CopilotTurn[],
  question: string,
  // Opus since 2026-11-24 (owner: "mi serve un vero agente IA"); COPILOT_MODEL still overrides it.
  model: string = process.env["COPILOT_MODEL"]?.trim() || CLAUDE_MODELS.orchestrator,
  now: () => number = Date.now,
): Promise<CopilotAnswer> {
  // The page may run for 300 s: no new model call starts after 240, so an answer always comes back.
  const deadline = now() + 240_000;
  const started = await client.rpc("start_agent_run", { p_organization_id: organization.id, p_agent: "copilot", p_models: [model] });
  if (started.error) throw new Error(started.error.message);
  const usage = emptyUsage();
  const actions: CopilotAction[] = [];
  try {
    const messages = [...history.slice(-10).map((turn) => ({ role: turn.role, content: withOutcomes(turn) })), { role: "user" as const, content: question }];
    const options = {
      model,
      system: copilotSystemPrompt(organization.name, new Date(now())),
      tools: copilotTools(client, organization.id, (action) => actions.push(action)),
      // The model thinks before it answers, and its thinking counts here: 2048 cut answers short.
      maxTokens: 16_000,
      // Reading a sheet, its details and preparing several cards takes more than eight calls.
      maxTurns: 20,
      effort: "high" as const,
      // A safety refusal is rerun on a fallback model instead of leaving the partner without answer.
      fallbacks: "default" as const,
      betas: [SERVER_SIDE_FALLBACK_BETA],
      deadline,
    };
    let result = await runAgent(claude, usage, { ...options, messages });
    // Seen live on 2026-11-19: the model wrote "Scheda pronta … conferma qui sotto" without calling
    // any action tool, so no card showed. One more go, told so; if it still prepares nothing, the
    // answer says that plainly instead of pointing at a button that is not there.
    if (actions.length === 0 && claimsACard(result.text)) {
      result = await runAgent(claude, usage, {
        ...options,
        maxTurns: 6,
        messages: [...messages, { role: "assistant" as const, content: result.text }, { role: "user" as const, content: NO_CARD_NUDGE }],
      });
      if (actions.length === 0 && claimsACard(result.text)) result = { ...result, text: NO_CARD_ANSWER };
    }
    await client.rpc("finish_agent_run", {
      p_run_id: started.data,
      p_outcome: {
        status: "succeeded", input_tokens: usage.inputTokens, output_tokens: usage.outputTokens, web_searches: 0,
        cost_estimate_cents: Math.ceil(usage.dollars * 100), summary: question.slice(0, 500),
      },
    });
    return { answer: finalAnswer(result, actions.length), dollars: usage.dollars, toolCalls: result.toolCalls, actions };
  } catch (error) {
    await client.rpc("finish_agent_run", {
      p_run_id: started.data,
      p_outcome: { status: "failed", input_tokens: usage.inputTokens, output_tokens: usage.outputTokens, error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}
