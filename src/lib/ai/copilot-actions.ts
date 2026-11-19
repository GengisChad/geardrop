import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { adjustInventoryAction } from "@/app/admin/actions/inventory";
import { addOrderNoteAction, shipOrderAction, transitionOrderAction } from "@/app/admin/actions/orders";
import { setListPriceAction } from "@/app/admin/actions/products";
import { setProductCostAction } from "@/app/admin/actions/warehouse";
import { CARRIERS, carrierById } from "@/lib/orders/carriers";
import type { Database } from "@/lib/supabase/database.types";
import type { ClientTool } from "./agent-loop";

/**
 * What the assistant may change (owner, 2026-11-19: "l'assistente deve avere modo di poter fare
 * quello che gli viene chiesto e avere i permessi interni per farlo").
 *
 * The model never writes. Its action tools only look the order or product up and prepare a card;
 * the partner presses "Conferma" and the card runs through the very server action behind the
 * panel's own button, with the partner's session: the same role checks (owner/admin, the cost
 * owner-only), the same database functions, the same status events, audit rows and customer
 * emails. So the assistant can do exactly what the person asking could do by hand, and nothing
 * else, and nothing happens without a click. Refunds and cancellations stay on the order page:
 * they move money.
 */

type Client = SupabaseClient<Database>;

export const COPILOT_ACTION_KINDS = ["stato_ordine", "spedisci_ordine", "nota_ordine", "movimento_magazzino", "prezzo", "costo"] as const;
export type CopilotActionKind = (typeof COPILOT_ACTION_KINDS)[number];

export type CopilotAction = {
  readonly id: string;
  readonly kind: CopilotActionKind;
  /** The resolved input the confirm runs with; validated again before running. */
  readonly input: Readonly<Record<string, string | number | boolean | null>>;
  readonly title: string;
  readonly details: readonly string[];
  /** Said on the card in red: an email to a customer, a price under cost, a stock reduction. */
  readonly warning: string | null;
  readonly status: "pending" | "done" | "failed" | "cancelled";
  readonly result: string | null;
};

export const copilotActionSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(COPILOT_ACTION_KINDS),
  input: z.record(z.string(), z.union([z.string().max(4000), z.number(), z.boolean(), z.null()])),
  title: z.string().max(300),
  details: z.array(z.string().max(500)).max(12),
  warning: z.string().max(500).nullable(),
  status: z.enum(["pending", "done", "failed", "cancelled"]),
  result: z.string().max(1000).nullable(),
});

const ORDER_STEPS = ["pending", "confirmed", "processing", "shipped", "completed"] as const;
type OrderStep = (typeof ORDER_STEPS)[number];
const STATUS_LABEL: Record<OrderStep, string> = {
  pending: "in attesa",
  confirmed: "confermato",
  processing: "in lavorazione",
  shipped: "spedito",
  completed: "consegnato",
};
const TARGETS: Record<string, OrderStep> = {
  confermato: "confirmed",
  in_lavorazione: "processing",
  spedito: "shipped",
  evaso: "shipped",
  consegnato: "completed",
};

const euro = (cents: number) => `€${(cents / 100).toFixed(2).replace(".", ",")}`;
const cents = (value: unknown) => {
  const number = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) : null;
};

const inputSchemas = {
  stato_ordine: z.object({ orderId: z.number().int().positive(), orderNumber: z.string(), to: z.enum(["confirmed", "processing", "shipped", "completed"]), note: z.string().max(1000).nullable() }),
  spedisci_ordine: z.object({ orderId: z.number().int().positive(), orderNumber: z.string(), carrierId: z.string().min(1).max(40), code: z.string().max(240) }),
  nota_ordine: z.object({ orderId: z.number().int().positive(), orderNumber: z.string(), note: z.string().min(1).max(4000) }),
  movimento_magazzino: z.object({ sku: z.string().min(1).max(120), name: z.string(), delta: z.number().int().min(-100_000).max(100_000).refine((value) => value !== 0), reason: z.enum(["manual_adjustment", "return", "damage"]), note: z.string().max(500) }),
  prezzo: z.object({ productId: z.number().int().positive(), name: z.string(), priceCents: z.number().int().positive(), belowCost: z.boolean() }),
  costo: z.object({ productId: z.number().int().positive(), name: z.string(), costCents: z.number().int().positive(), reason: z.string().min(1).max(500) }),
} satisfies Record<CopilotActionKind, z.ZodTypeAny>;

function card(kind: CopilotActionKind, input: CopilotAction["input"], title: string, details: readonly string[], warning: string | null = null): CopilotAction {
  return { id: randomUUID(), kind, input, title, details, warning, status: "pending", result: null };
}

async function findOrder(client: Client, organizationId: number, number: unknown) {
  const wanted = String(number ?? "").trim().toUpperCase();
  if (!/^GD-[A-Z0-9]{4,16}$/.test(wanted)) throw new Error("Indica il numero d'ordine completo, es. GD-ESZGLRU5.");
  const { data, error } = await client
    .from("orders")
    .select("id,order_number,status,payment_status,shipped_at,tracking_code")
    .eq("organization_id", organizationId)
    .eq("order_number", wanted)
    .maybeSingle();
  if (error || !data) throw new Error(`Ordine ${wanted} non trovato.`);
  return data;
}

async function findProduct(client: Client, organizationId: number, search: unknown) {
  const needle = String(search ?? "").trim().slice(0, 100);
  if (!needle) throw new Error("Indica il nome o lo SKU del prodotto.");
  const pattern = `%${needle.replace(/[,%_()]/g, "")}%`;
  const { data, error } = await client
    .from("products")
    .select("id,sku,name,price_cents,compare_at_price_cents,stock_quantity")
    .eq("organization_id", organizationId)
    .or(`name.ilike.${pattern},sku.ilike.${pattern},slug.ilike.${pattern}`)
    .limit(8);
  if (error) throw new Error("Prodotti non disponibili.");
  const rows = data ?? [];
  const exact = rows.filter((row) => row.sku.toLowerCase() === needle.toLowerCase() || row.name.toLowerCase() === needle.toLowerCase());
  const pick = exact.length === 1 ? exact : rows;
  if (pick.length === 0) throw new Error(`Nessun prodotto per «${needle}».`);
  if (pick.length > 1) throw new Error(`Più prodotti per «${needle}»: ${pick.map((row) => `${row.name} (SKU ${row.sku})`).join("; ")}. Usa lo SKU.`);
  return pick[0]!;
}

function tool(name: string, description: string, properties: Record<string, unknown>, required: readonly string[], run: (input: Record<string, unknown>) => Promise<CopilotAction>, collect: (action: CopilotAction) => void): ClientTool {
  return {
    name,
    description: `${description} Non esegue: prepara una scheda che l'utente conferma con un tasto.`,
    input_schema: { type: "object", properties, required },
    run: async (raw) => {
      const action = await run(raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {});
      collect(action);
      return `Pronta per la conferma: ${action.title}. Non è ancora fatta: l'utente deve premere «Conferma» sotto la risposta.`;
    },
  };
}

/** The action tools, each preparing one card into `collect`. */
export function copilotActionTools(client: Client, organizationId: number, collect: (action: CopilotAction) => void): readonly ClientTool[] {
  return [
    tool(
      "cambia_stato_ordine",
      "Porta un ordine a uno stato: confermato, in_lavorazione, spedito (o evaso), consegnato, passando per gli stati intermedi. Non avvisa il cliente: per spedire con il codice di tracciamento usa spedisci_ordine.",
      { ordine: { type: "string", description: "Numero, es. GD-ESZGLRU5" }, stato: { type: "string", enum: Object.keys(TARGETS) }, nota: { type: "string" } },
      ["ordine", "stato"],
      async (input) => {
        const order = await findOrder(client, organizationId, input.ordine);
        const to = TARGETS[String(input.stato ?? "")];
        if (!to) throw new Error("Stato non valido: confermato, in_lavorazione, spedito, consegnato.");
        const from = order.status as OrderStep;
        if (!ORDER_STEPS.includes(from)) throw new Error(`L'ordine ${order.order_number} è ${order.status}: non si può avanzare.`);
        if (ORDER_STEPS.indexOf(to) <= ORDER_STEPS.indexOf(from)) throw new Error(`L'ordine ${order.order_number} è già ${STATUS_LABEL[from]}.`);
        if (order.payment_status !== "paid" && to !== "confirmed") throw new Error(`L'ordine ${order.order_number} non risulta pagato (${order.payment_status}).`);
        const note = typeof input.nota === "string" && input.nota.trim() ? input.nota.trim().slice(0, 1000) : null;
        return card("stato_ordine", { orderId: order.id, orderNumber: order.order_number, to, note }, `Ordine ${order.order_number}: ${STATUS_LABEL[from]} → ${STATUS_LABEL[to]}`, [
          "Nessuna email al cliente.",
          ...(note ? [`Nota: ${note}`] : []),
        ]);
      },
      collect,
    ),
    tool(
      "spedisci_ordine",
      `Salva corriere e codice di tracciamento: l'ordine diventa spedito e il cliente riceve l'email con il tracciamento. Corrieri: ${CARRIERS.map((carrier) => carrier.id).join(", ")}.`,
      { ordine: { type: "string" }, corriere: { type: "string", enum: CARRIERS.map((carrier) => carrier.id) }, codice: { type: "string" } },
      ["ordine", "corriere", "codice"],
      async (input) => {
        const order = await findOrder(client, organizationId, input.ordine);
        const carrier = carrierById(String(input.corriere ?? ""));
        if (!carrier) throw new Error("Corriere non valido.");
        const code = String(input.codice ?? "").trim().slice(0, 240);
        if (!code) throw new Error("Serve il codice di tracciamento.");
        if (order.payment_status !== "paid") throw new Error(`L'ordine ${order.order_number} non risulta pagato.`);
        return card(
          "spedisci_ordine",
          { orderId: order.id, orderNumber: order.order_number, carrierId: carrier.id, code },
          `Spedisci ${order.order_number} con ${carrier.label}`,
          [`Codice: ${code}`],
          "Il cliente riceve un'email con il tracciamento.",
        );
      },
      collect,
    ),
    tool(
      "nota_ordine",
      "Aggiunge una nota interna all'ordine (non la vede il cliente).",
      { ordine: { type: "string" }, nota: { type: "string" } },
      ["ordine", "nota"],
      async (input) => {
        const order = await findOrder(client, organizationId, input.ordine);
        const note = String(input.nota ?? "").trim().slice(0, 4000);
        if (!note) throw new Error("La nota è vuota.");
        return card("nota_ordine", { orderId: order.id, orderNumber: order.order_number, note }, `Nota interna su ${order.order_number}`, [note]);
      },
      collect,
    ),
    tool(
      "movimento_magazzino",
      "Aggiunge o toglie pezzi dalla giacenza di un prodotto: arrivi senza carico, vendite a mano o al torneo (scrivi prezzo e occasione nella nota), resi, danni, correzioni. Variazione positiva o negativa.",
      {
        prodotto: { type: "string", description: "Nome o SKU" },
        variazione: { type: "integer", description: "Es. -2 per due pezzi venduti a mano, +10 per dieci arrivati" },
        causale: { type: "string", enum: ["correzione", "reso", "danno"] },
        nota: { type: "string", description: "Il perché, con prezzo incassato se è una vendita a mano" },
      },
      ["prodotto", "variazione", "nota"],
      async (input) => {
        const product = await findProduct(client, organizationId, input.prodotto);
        const delta = Number(input.variazione);
        if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100_000) throw new Error("La variazione deve essere un numero intero diverso da zero.");
        const reason = input.causale === "reso" ? "return" : input.causale === "danno" ? "damage" : "manual_adjustment";
        const note = String(input.nota ?? "").trim().slice(0, 500);
        if (!note) throw new Error("Serve una nota che spieghi il movimento.");
        const after = product.stock_quantity + delta;
        if (after < 0) throw new Error(`${product.name} ha ${product.stock_quantity} pezzi: non se ne possono togliere ${-delta}.`);
        return card(
          "movimento_magazzino",
          { sku: product.sku, name: product.name, delta, reason, note },
          `${product.name}: ${delta > 0 ? "+" : ""}${delta} pezzi (${product.stock_quantity} → ${after})`,
          [`Causale: ${reason === "return" ? "reso" : reason === "damage" ? "danno" : "correzione"}`, `Nota: ${note}`],
          delta < 0 ? "Toglie pezzi dalla giacenza vendibile." : null,
        );
      },
      collect,
    ),
    tool(
      "cambia_prezzo",
      "Cambia il prezzo di vendita di un prodotto sul sito (in pochi minuti, anche su Stripe). I pack hanno un prezzo proprio e non si cambiano da qui.",
      { prodotto: { type: "string" }, prezzo_eur: { type: "number" } },
      ["prodotto", "prezzo_eur"],
      async (input) => {
        const product = await findProduct(client, organizationId, input.prodotto);
        const priceCents = cents(input.prezzo_eur);
        if (priceCents === null) throw new Error("Prezzo non valido.");
        if (priceCents === product.price_cents) throw new Error(`${product.name} costa già ${euro(priceCents)}.`);
        if (product.compare_at_price_cents !== null && product.compare_at_price_cents <= priceCents) {
          throw new Error(`${product.name} è in offerta con prezzo barrato ${euro(product.compare_at_price_cents)}: il nuovo prezzo deve stare sotto (l'offerta si cambia dalla scheda prodotto).`);
        }
        const cost = await client.from("inventory_valuation").select("average_cost_cents").eq("organization_id", organizationId).eq("product_id", product.id).maybeSingle();
        const average = cost.data?.average_cost_cents ?? null;
        const net = Math.round(priceCents / 1.22);
        const belowCost = average !== null && net < average;
        return card(
          "prezzo",
          { productId: product.id, name: product.name, priceCents, belowCost },
          `${product.name}: ${euro(product.price_cents)} → ${euro(priceCents)}`,
          [`Netto IVA ${euro(net)}${average !== null ? ` · costo medio ${euro(average)}` : ""}`],
          belowCost ? "Prezzo sotto il costo medio: confermando vendi sotto costo." : null,
        );
      },
      collect,
    ),
    tool(
      "imposta_costo",
      "Imposta il costo d'acquisto unitario di un prodotto (netto IVA), per margini e valore del magazzino. Solo il titolare può confermarlo.",
      { prodotto: { type: "string" }, costo_eur: { type: "number" }, motivo: { type: "string" } },
      ["prodotto", "costo_eur", "motivo"],
      async (input) => {
        const product = await findProduct(client, organizationId, input.prodotto);
        const costCents = cents(input.costo_eur);
        if (costCents === null) throw new Error("Costo non valido.");
        const reason = String(input.motivo ?? "").trim().slice(0, 500);
        if (!reason) throw new Error("Serve il motivo (es. fattura del fornitore).");
        return card("costo", { productId: product.id, name: product.name, costCents, reason }, `Costo di ${product.name}: ${euro(costCents)}`, [`Motivo: ${reason}`]);
      },
      collect,
    ),
  ];
}

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const NO_STATE = { ok: false, message: "" } as const;

/**
 * Runs a confirmed card through the panel's own server action, with the session of whoever
 * pressed the button. The card comes back from the browser, so its input is validated again here;
 * a tampered card can only ask for what that person could already do from the panel.
 */
export async function executeCopilotAction(action: CopilotAction, client: Client, organizationId: number): Promise<{ readonly ok: boolean; readonly message: string }> {
  switch (action.kind) {
    case "stato_ordine": {
      const input = inputSchemas.stato_ordine.parse(action.input);
      const current = await client.from("orders").select("status").eq("id", input.orderId).eq("organization_id", organizationId).maybeSingle();
      if (current.error || !current.data) return { ok: false, message: `Ordine ${input.orderNumber} non trovato.` };
      let at = ORDER_STEPS.indexOf(current.data.status as OrderStep);
      const target = ORDER_STEPS.indexOf(input.to);
      if (at < 0) return { ok: false, message: `L'ordine ${input.orderNumber} è ${current.data.status}: non si può avanzare.` };
      if (at >= target) return { ok: true, message: `L'ordine ${input.orderNumber} era già ${STATUS_LABEL[ORDER_STEPS[at]!]}.` };
      while (at < target) {
        const next = ORDER_STEPS[at + 1]!;
        const state = await transitionOrderAction(NO_STATE, form({ orderId: String(input.orderId), toStatus: next, note: input.note ?? "" }));
        if (!state.ok) return { ok: false, message: `${input.orderNumber}: ${state.message}` };
        at += 1;
      }
      return { ok: true, message: `Ordine ${input.orderNumber} ora ${STATUS_LABEL[input.to]}.` };
    }
    case "spedisci_ordine": {
      const input = inputSchemas.spedisci_ordine.parse(action.input);
      const state = await shipOrderAction(NO_STATE, form({ orderId: String(input.orderId), carrierId: input.carrierId, code: input.code, url: "" }));
      return { ok: state.ok, message: `${input.orderNumber}: ${state.message}` };
    }
    case "nota_ordine": {
      const input = inputSchemas.nota_ordine.parse(action.input);
      const state = await addOrderNoteAction(NO_STATE, form({ orderId: String(input.orderId), note: input.note }));
      return { ok: state.ok, message: `${input.orderNumber}: ${state.message}` };
    }
    case "movimento_magazzino": {
      const input = inputSchemas.movimento_magazzino.parse(action.input);
      const state = await adjustInventoryAction(
        { ok: false, message: "" },
        form({ sku: input.sku, delta: String(input.delta), reason: input.reason, note: input.note, ...(input.delta < 0 ? { confirmReduction: "on" } : {}) }),
      );
      return { ok: state.ok, message: `${input.name}: ${state.message}` };
    }
    case "prezzo": {
      const input = inputSchemas.prezzo.parse(action.input);
      const state = await setListPriceAction(
        { ok: false, message: "" },
        form({ productId: String(input.productId), price: (input.priceCents / 100).toFixed(2).replace(".", ","), ...(input.belowCost ? { belowCostConfirmed: "on" } : {}) }),
      );
      return { ok: state.ok, message: `${input.name}: ${state.message}` };
    }
    case "costo": {
      const input = inputSchemas.costo.parse(action.input);
      const state = await setProductCostAction(
        { ok: false, message: "" },
        form({ productId: String(input.productId), unitCost: (input.costCents / 100).toFixed(2).replace(".", ","), reason: input.reason }),
      );
      return { ok: state.ok, message: `${input.name}: ${state.message}` };
    }
  }
}
