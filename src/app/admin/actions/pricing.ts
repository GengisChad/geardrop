"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { parseEuroCents } from "@/lib/admin/warehouse";
import { requireStaffRole, requireUser } from "@/lib/auth/guards";
import type { StaffRole } from "@/lib/auth/roles";
import { claudeApiKey, ClaudeApiError, createClaudeClient } from "@/lib/ai/claude-api";
import { askCopilot, type CopilotTurn } from "@/lib/ai/copilot";
import { runPricingAgent } from "@/lib/ai/pricing-agent";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { STOREFRONT_CACHE_TAGS } from "@/lib/storefront/cache";

export type PricingActionState = { readonly ok: boolean; readonly message: string };
export type CopilotState = { readonly turns: readonly CopilotTurn[]; readonly error: string | null };

const MANAGERS: readonly StaffRole[] = ["owner", "admin"];
const OWNERS: readonly StaffRole[] = ["owner"];

async function authorized(roles: readonly StaffRole[]) {
  const client = await createSupabaseServerClient();
  await requireUser(client);
  const principal = await requireStaffRole(client, roles);
  return { client, organization: principal.organization };
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function detail(error: unknown): string {
  if (error instanceof ClaudeApiError) {
    if (error.status === 401) return "La chiave Anthropic non è valida.";
    if (error.status === 429) return "Limite di richieste Anthropic raggiunto: riprova tra qualche minuto.";
    if (error.status === 529 || error.status >= 500) return "Il servizio Anthropic non risponde: riprova più tardi.";
    return error.message;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("GD_AGENT_ALREADY_RUNNING")) return "Un'analisi è già in corso per questa azienda.";
  if (message.includes("42501") || message.includes("MANAGER_REQUIRED") || message.includes("OWNER_REQUIRED")) {
    return "Il tuo ruolo non può eseguire questa operazione in questa azienda.";
  }
  return message.slice(0, 300);
}

function refreshPricing(): void {
  revalidatePath("/admin/prezzi");
  revalidatePath("/admin/prezzi/fonti");
  revalidatePath("/admin/prezzi/osservazioni");
}

// ---------------------------------------------------------------------------------------
// Sources and policy
// ---------------------------------------------------------------------------------------

const sourceSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  kind: z.enum(["competitor", "marketplace", "release_calendar", "other"]),
  name: z.string().trim().min(1).max(120),
  domain: z.string().trim().toLowerCase()
    .transform((value) => value.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""))
    .pipe(z.string().regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/).max(253))
    .refine((value) => !/(^|\.)amazon\./.test(value), { message: "Amazon è escluso per decisione dei soci." }),
  notes: z.string().trim().max(1000).transform((value) => value || null),
  active: z.boolean(),
});

export async function saveMarketSourceAction(_previous: PricingActionState, formData: FormData): Promise<PricingActionState> {
  const rawId = text(formData, "id");
  const parsed = sourceSchema.safeParse({
    ...(rawId ? { id: rawId } : {}),
    kind: text(formData, "kind"),
    name: text(formData, "name"),
    domain: text(formData, "domain"),
    notes: text(formData, "notes"),
    active: rawId ? formData.get("active") === "on" : true,
  });
  if (!parsed.success) {
    const amazon = parsed.error.issues.some((issue) => issue.message.includes("Amazon"));
    return { ok: false, message: amazon ? "Amazon è escluso per decisione dei soci." : "Controlla nome e dominio (es. negozio.it)." };
  }
  try {
    const { client, organization } = await authorized(MANAGERS);
    const input = parsed.data;
    const record = { organization_id: organization.id, kind: input.kind, name: input.name, domain: input.domain, notes: input.notes, active: input.active };
    const result = input.id
      ? await client.from("market_sources").update(record).eq("id", input.id).eq("organization_id", organization.id)
      : await client.from("market_sources").insert(record);
    if (result.error) {
      return { ok: false, message: result.error.code === "23505" ? "Questo dominio è già tra le fonti." : "Fonte non salvata." };
    }
    refreshPricing();
    return { ok: true, message: input.id ? "Fonte aggiornata." : "Fonte approvata." };
  } catch (error) {
    return { ok: false, message: detail(error) };
  }
}

export async function deleteMarketSourceAction(formData: FormData): Promise<void> {
  const id = Number(text(formData, "id"));
  if (!Number.isSafeInteger(id) || id <= 0) return;
  const { client, organization } = await authorized(MANAGERS);
  await client.from("market_sources").delete().eq("id", id).eq("organization_id", organization.id);
  refreshPricing();
}

const policySchema = z.object({
  minMarginPct: z.number().min(0).max(90),
  maxChangePct: z.number().min(1).max(100),
  cooldownDays: z.number().int().min(0).max(365),
  rounding: z.enum(["none", "cents_90", "cents_99", "cents_50"]),
  productsPerRun: z.number().int().min(1).max(40),
});

const numberFrom = (value: string) => Number(value.replace(",", "."));

export async function savePricingPolicyAction(_previous: PricingActionState, formData: FormData): Promise<PricingActionState> {
  const parsed = policySchema.safeParse({
    minMarginPct: numberFrom(text(formData, "minMargin")),
    maxChangePct: numberFrom(text(formData, "maxChange")),
    cooldownDays: numberFrom(text(formData, "cooldownDays")),
    rounding: text(formData, "rounding"),
    productsPerRun: numberFrom(text(formData, "productsPerRun")),
  });
  if (!parsed.success) return { ok: false, message: "Margine 0–90%, variazione 1–100%, attesa 0–365 giorni, 1–40 prodotti per analisi." };
  try {
    const { client, organization } = await authorized(OWNERS);
    const { error } = await client.rpc("save_pricing_policy", {
      p_organization_id: organization.id,
      p_policy: {
        min_margin_bp: Math.round(parsed.data.minMarginPct * 100),
        max_change_bp: Math.round(parsed.data.maxChangePct * 100),
        cooldown_days: parsed.data.cooldownDays,
        rounding: parsed.data.rounding,
        products_per_run: parsed.data.productsPerRun,
      },
    });
    if (error) return { ok: false, message: detail(error) };
    refreshPricing();
    return { ok: true, message: "Politica prezzi salvata." };
  } catch (error) {
    return { ok: false, message: detail(error) };
  }
}

// ---------------------------------------------------------------------------------------
// The agent
// ---------------------------------------------------------------------------------------

export async function runPricingAgentAction(_previous: PricingActionState, _formData: FormData): Promise<PricingActionState> {
  const apiKey = claudeApiKey();
  if (!apiKey) return { ok: false, message: "Agente non configurato: manca ANTHROPIC_API_KEY sul server." };
  try {
    const { client, organization } = await authorized(MANAGERS);
    const result = await runPricingAgent(client, createClaudeClient(apiKey), organization);
    refreshPricing();
    return {
      ok: true,
      message: `Analisi completata: ${result.products} prodotti, ${result.observations} prezzi osservati, ${result.proposals} proposte. Costo stimato $${result.dollars.toFixed(2)}.`,
    };
  } catch (error) {
    refreshPricing();
    return { ok: false, message: `Analisi non completata: ${detail(error)}` };
  }
}

const decisionSchema = z.object({
  proposalId: z.coerce.number().int().positive(),
  decision: z.enum(["approve", "reject"]),
  priceCents: z.number().int().min(1).max(100_000_000).nullable(),
  note: z.string().trim().max(1000),
});

export async function decideProposalAction(_previous: PricingActionState, formData: FormData): Promise<PricingActionState> {
  const priceText = text(formData, "price").trim();
  const parsed = decisionSchema.safeParse({
    proposalId: text(formData, "proposalId"),
    decision: text(formData, "decision"),
    priceCents: priceText ? parseEuroCents(priceText) ?? Number.NaN : null,
    note: text(formData, "note"),
  });
  if (!parsed.success) return { ok: false, message: "Controlla il prezzo (es. 15,90)." };
  try {
    const { client } = await authorized(MANAGERS);
    const { data, error } = await client.rpc("decide_pricing_proposal", {
      p_proposal_id: parsed.data.proposalId,
      p_decision: parsed.data.decision,
      ...(parsed.data.priceCents !== null ? { p_price_cents: parsed.data.priceCents } : {}),
      ...(parsed.data.note ? { p_note: parsed.data.note } : {}),
    });
    if (error) {
      return { ok: false, message: error.message.includes("GD_PROPOSAL_ALREADY_DECIDED") ? "La proposta è già stata decisa o sostituita." : detail(error) };
    }
    refreshPricing();
    if (parsed.data.decision === "approve") {
      // The new price is live: the shop and the admin read it again.
      revalidateTag(STOREFRONT_CACHE_TAGS.products, { expire: 0 });
      revalidateTag("products", "max");
      revalidatePath("/admin/prodotti");
      return { ok: true, message: `Prezzo applicato: €${((data ?? 0) / 100).toFixed(2).replace(".", ",")}.` };
    }
    return { ok: true, message: "Proposta rifiutata." };
  } catch (error) {
    return { ok: false, message: detail(error) };
  }
}

// ---------------------------------------------------------------------------------------
// The assistant
// ---------------------------------------------------------------------------------------

const turnSchema = z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(20_000) })).max(40);

export async function askCopilotAction(previous: CopilotState, formData: FormData): Promise<CopilotState> {
  const question = text(formData, "question").trim().slice(0, 2000);
  if (!question) return previous;
  const apiKey = claudeApiKey();
  if (!apiKey) return { turns: previous.turns, error: "Assistente non configurato: manca ANTHROPIC_API_KEY sul server." };
  const history = turnSchema.safeParse(previous.turns);
  const turns = history.success ? history.data : [];
  try {
    const { client, organization } = await authorized(MANAGERS);
    const answer = await askCopilot(client, createClaudeClient(apiKey), organization, turns, question);
    return { turns: [...turns, { role: "user", text: question }, { role: "assistant", text: answer.answer }], error: null };
  } catch (error) {
    return { turns: [...turns, { role: "user", text: question }], error: detail(error) };
  }
}
