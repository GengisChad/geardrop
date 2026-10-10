import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { runAgent } from "@/lib/ai/agent-loop";
import {
  addUsage,
  CLAUDE_MODELS,
  ClaudeApiError,
  claudeApiKey,
  createClaudeClient,
  emptyUsage,
  type ClaudeClient,
  type MessageRequest,
  type MessageResponse,
} from "@/lib/ai/claude-api";
import { copilotTools } from "@/lib/ai/copilot";
import { observationTool, proposalTool, type ProductContext } from "@/lib/ai/pricing-agent";

const usage = { input_tokens: 1000, output_tokens: 200 };

function scripted(responses: readonly Partial<MessageResponse>[]) {
  const requests: MessageRequest[] = [];
  const client: ClaudeClient = {
    async createMessage(request) {
      // Snapshot: the loop keeps appending to its own array.
      requests.push(JSON.parse(JSON.stringify(request)) as MessageRequest);
      const next = responses[requests.length - 1];
      if (!next) throw new Error("no scripted response");
      return { id: `msg_${requests.length}`, model: request.model, content: [], stop_reason: "end_turn", usage, ...next } as MessageResponse;
    },
  };
  return { client, requests };
}

describe("createClaudeClient", () => {
  it("posts to the Messages API with the key, version and JSON body", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "m", model: "x", content: [], stop_reason: "end_turn", usage }), { status: 200 }));
    const client = createClaudeClient("sk-ant-test", fetchMock as unknown as typeof fetch);
    await client.createMessage({ model: CLAUDE_MODELS.worker, max_tokens: 10, messages: [{ role: "user", content: "ciao" }] });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers).toMatchObject({ "x-api-key": "sk-ant-test", "anthropic-version": "2023-06-01", "content-type": "application/json" });
    expect(JSON.parse(String(init.body))).toMatchObject({ model: "claude-sonnet-5", max_tokens: 10 });
  });

  it("turns an API error into a ClaudeApiError with its status", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { message: "invalid x-api-key" } }), { status: 401 }));
    const client = createClaudeClient("bad", fetchMock as unknown as typeof fetch);
    await expect(client.createMessage({ model: "m", max_tokens: 1, messages: [] })).rejects.toMatchObject({ status: 401 });
    await expect(client.createMessage({ model: "m", max_tokens: 1, messages: [] })).rejects.toBeInstanceOf(ClaudeApiError);
  });

  it("stays off without a key", () => {
    expect(claudeApiKey({})).toBeNull();
    expect(claudeApiKey({ ANTHROPIC_API_KEY: "  " })).toBeNull();
    expect(claudeApiKey({ ANTHROPIC_API_KEY: "sk-ant" })).toBe("sk-ant");
  });
});

describe("usage and cost", () => {
  it("prices tokens per model and web searches", () => {
    const totals = emptyUsage();
    addUsage(totals, CLAUDE_MODELS.orchestrator, { input_tokens: 1_000_000, output_tokens: 100_000 });
    addUsage(totals, CLAUDE_MODELS.worker, { input_tokens: 500_000, output_tokens: 0, server_tool_use: { web_search_requests: 10 } });
    expect(totals.inputTokens).toBe(1_500_000);
    expect(totals.outputTokens).toBe(100_000);
    expect(totals.webSearches).toBe(10);
    // 4 + 2 (opus) + 1 (sonnet) + 0.10 (searches)
    expect(totals.dollars).toBeCloseTo(7.1, 6);
  });
});

describe("runAgent", () => {
  it("runs the tools the model asks for and returns its final answer", async () => {
    const { client, requests } = scripted([
      { stop_reason: "tool_use", content: [{ type: "text", text: "Controllo." }, { type: "tool_use", id: "t1", name: "somma", input: { a: 2, b: 3 } }] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Fa 5." }] },
    ]);
    const totals = emptyUsage();
    const result = await runAgent(client, totals, {
      model: "m", system: "s", messages: [{ role: "user", content: "2+3?" }],
      tools: [{
        name: "somma", description: "d", input_schema: {},
        run: async (input) => {
          const { a, b } = input as { a: number; b: number };
          return { risultato: a + b };
        },
      }],
    });
    expect(result).toMatchObject({ text: "Fa 5.", turns: 2, toolCalls: 1, stopReason: "end_turn" });
    expect(requests[1]?.messages.at(-1)).toEqual({ role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "{\"risultato\":5}" }] });
    expect(totals.inputTokens).toBe(2000);
  });

  it("reports a failing or unknown tool to the model instead of failing the run", async () => {
    const { client, requests } = scripted([
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "a", name: "rompe", input: {} }, { type: "tool_use", id: "b", name: "inesistente", input: {} }] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Ok" }] },
    ]);
    await runAgent(client, emptyUsage(), {
      model: "m", system: "s", messages: [{ role: "user", content: "x" }],
      tools: [{ name: "rompe", description: "d", input_schema: {}, run: async () => { throw new Error("Dominio non approvato"); } }],
    });
    expect(requests[1]?.messages.at(-1)).toEqual({
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "a", content: "Dominio non approvato", is_error: true },
        { type: "tool_result", tool_use_id: "b", content: "Strumento sconosciuto: inesistente", is_error: true },
      ],
    });
  });

  it("continues a paused server tool turn and stops at the turn limit", async () => {
    const { client, requests } = scripted([
      { stop_reason: "pause_turn", content: [{ type: "server_tool_use", id: "s1", name: "web_search", input: { query: "x" } }] },
      { stop_reason: "pause_turn", content: [] },
      { stop_reason: "pause_turn", content: [] },
    ]);
    const result = await runAgent(client, emptyUsage(), { model: "m", system: "s", messages: [{ role: "user", content: "x" }], maxTurns: 3 });
    expect(result.stopReason).toBe("max_turns");
    expect(requests[1]?.messages.at(-1)?.role).toBe("assistant");
  });
});

const products: readonly ProductContext[] = [{
  id: 7, sku: "COURAGE-DRAN", name: "Courage Dran", priceCents: 1450, averageCostCents: 650, stock: 10, unlimitedStock: false,
  sold7: 3, sold30: 10, sold90: 20, dailyRate: 0.6, daysOfCover: 16, trend: 1.2,
}];

function rpcClient(result: { data?: unknown; error?: { message: string } | null } = {}) {
  const rpc = vi.fn(async () => ({ data: result.data ?? 1, error: result.error ?? null }));
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq"]) chain[method] = () => chain;
  chain["maybeSingle"] = async () => ({ data: { proposed_price_cents: 1590, out_of_policy: false, policy_notes: [] }, error: null });
  return { client: { rpc, from: () => chain } as never, rpc };
}

describe("pricing agent tools", () => {
  it("records an observation in cents, for a listed product only", async () => {
    const { client, rpc } = rpcClient({ data: 11 });
    const counter = { observations: 0 };
    const tool = observationTool(client, 5, products, counter);
    expect(await tool.run({ sku: "courage-dran", url: "https://shop.example/p", titolo: "Courage Dran", prezzo_eur: 16.9, disponibilita: "in_stock" }))
      .toEqual({ registrata: true, id: 11 });
    expect(rpc).toHaveBeenCalledWith("record_market_observation", {
      p_run_id: 5,
      p_observation: expect.objectContaining({ product_id: 7, price_cents: 1690, availability: "in_stock", item_condition: "unknown" }),
    });
    expect(counter.observations).toBe(1);
    await expect(tool.run({ sku: "ALTRO", url: "https://shop.example/p", titolo: "x" })).rejects.toThrow("non è tra i prodotti");
    await expect(tool.run({ sku: "COURAGE-DRAN", url: "javascript:alert(1)", titolo: "x" })).rejects.toThrow("non validi");
  });

  it("explains a refused domain to the model", async () => {
    const { client } = rpcClient({ error: { message: "GD_MARKET_SOURCE_NOT_APPROVED" } });
    await expect(observationTool(client, 5, products, { observations: 0 }).run({ sku: "COURAGE-DRAN", url: "https://amazon.it/x", titolo: "x" }))
      .rejects.toThrow("Dominio non approvato");
  });

  it("proposes a price in cents and reports the rounded result", async () => {
    const { client, rpc } = rpcClient({ data: 3 });
    const counter = { proposals: 0 };
    const tool = proposalTool(client, 1, 5, products, counter);
    expect(await tool.run({ sku: "COURAGE-DRAN", prezzo_proposto_eur: 16, motivazione: "Concorrenti a 16,90 e copertura bassa.", evidenze: ["https://shop.example/p"], confidenza: 0.7 }))
      .toEqual({ registrata: true, prezzo_arrotondato_eur: 15.9, fuori_politica: false, note_politica: [] });
    expect(rpc).toHaveBeenCalledWith("propose_price", expect.objectContaining({ p_run_id: 5, p_product_id: 7, p_proposed_price_cents: 1600, p_confidence: 0.7 }));
    expect(counter.proposals).toBe(1);
    await expect(tool.run({ sku: "COURAGE-DRAN", prezzo_proposto_eur: 16, motivazione: "corta", confidenza: 2 })).rejects.toThrow("Proposta non valida");
  });
});

describe("copilot tools", () => {
  it("are read-only and never read customers' personal data", async () => {
    const calls: string[] = [];
    const chain: Record<string, unknown> = {};
    const record = (name: string) => (...args: unknown[]) => {
      calls.push(`${name}:${args.map(String).join(",")}`);
      return chain;
    };
    for (const method of ["select", "eq", "gte", "order", "in", "or"]) chain[method] = record(method);
    chain["limit"] = () => Promise.resolve({ data: [], error: null });
    const tools = copilotTools({ rpc: vi.fn(), from: record("from") } as never, 1);
    expect(tools.map((tool) => tool.name)).toEqual(["panoramica_magazzino", "previsioni", "ordini_recenti", "prodotto", "mercato", "proposte_prezzo"]);
    await tools.find((tool) => tool.name === "ordini_recenti")?.run({});
    const selects = calls.filter((call) => call.startsWith("select:")).join(" ");
    expect(selects).toContain("order_number");
    expect(selects).not.toMatch(/email|phone|address|snapshot|customer/);
  });
});
