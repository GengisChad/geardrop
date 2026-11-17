/**
 * Minimal Claude Messages API client, dependency-free like the Stripe one: the agent needs one
 * endpoint and a tool loop, not an SDK. It needs the secret key, so it only ever runs on the
 * server. Model ids, server tool versions and prices were checked against the API documentation
 * in September 2026; they live here so a change is one edit.
 */

const CLAUDE_API = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

export const CLAUDE_MODELS = {
  /** Decisions: prices, answers to the partners. */
  orchestrator: "claude-opus-5-5",
  /** Bulk research and extraction: reading competitor pages. */
  worker: "claude-sonnet-5",
} as const;

export const WEB_SEARCH_TOOL_TYPE = "web_search_20260318";
export const WEB_FETCH_TOOL_TYPE = "web_fetch_20260318";

/** US dollars per million tokens, and per web search. */
const PRICES: Readonly<Record<string, { readonly input: number; readonly output: number }>> = {
  [CLAUDE_MODELS.orchestrator]: { input: 4, output: 20 },
  [CLAUDE_MODELS.worker]: { input: 2, output: 10 },
};
const WEB_SEARCH_DOLLARS = 0.01;

export type TextBlock = { readonly type: "text"; readonly text: string };
export type ToolUseBlock = { readonly type: "tool_use"; readonly id: string; readonly name: string; readonly input: unknown };
/** Server tool calls and results (web search, web fetch) are passed back to the API untouched. */
export type OtherBlock = { readonly type: string; readonly [key: string]: unknown };
export type ContentBlock = TextBlock | ToolUseBlock | OtherBlock;

export type ToolResultBlock = {
  readonly type: "tool_result";
  readonly tool_use_id: string;
  readonly content: string;
  readonly is_error?: boolean;
};

export type MessageParam = {
  readonly role: "user" | "assistant";
  readonly content: string | readonly (ContentBlock | ToolResultBlock)[];
};

export type ToolDefinition = {
  readonly name: string;
  readonly description: string;
  readonly input_schema: Readonly<Record<string, unknown>>;
};

export type ServerToolDefinition = Readonly<Record<string, unknown>> & { readonly type: string; readonly name: string };

export type Usage = {
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cache_read_input_tokens?: number;
  readonly cache_creation_input_tokens?: number;
  readonly server_tool_use?: { readonly web_search_requests?: number; readonly web_fetch_requests?: number };
};

export type MessageRequest = {
  readonly model: string;
  readonly max_tokens: number;
  readonly system?: string;
  readonly messages: readonly MessageParam[];
  readonly tools?: readonly (ToolDefinition | ServerToolDefinition)[];
};

export type MessageResponse = {
  readonly id: string;
  readonly model: string;
  readonly content: readonly ContentBlock[];
  readonly stop_reason: "end_turn" | "tool_use" | "pause_turn" | "max_tokens" | "stop_sequence" | "refusal" | string;
  readonly usage: Usage;
};

export type ClaudeClient = { createMessage(request: MessageRequest): Promise<MessageResponse> };

export class ClaudeApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "ClaudeApiError";
  }
}

export function createClaudeClient(apiKey: string, fetchImpl: typeof fetch = fetch): ClaudeClient {
  return {
    async createMessage(request) {
      const response = await fetchImpl(CLAUDE_API, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": API_VERSION,
          "content-type": "application/json",
        },
        body: JSON.stringify(request),
        cache: "no-store",
        signal: AbortSignal.timeout(180_000),
      });
      const payload = (await response.json().catch(() => null)) as
        | (MessageResponse & { readonly error?: { readonly message?: string } })
        | null;
      if (!response.ok || !payload) {
        // The API never echoes the key, so its message is safe to show and log.
        throw new ClaudeApiError(response.status, `Claude API ${response.status}: ${payload?.error?.message ?? "risposta non leggibile"}`);
      }
      return payload;
    },
  };
}

/** Running totals of a run, across models. */
export type UsageTotals = {
  inputTokens: number;
  outputTokens: number;
  webSearches: number;
  dollars: number;
};

export function emptyUsage(): UsageTotals {
  return { inputTokens: 0, outputTokens: 0, webSearches: 0, dollars: 0 };
}

export function addUsage(totals: UsageTotals, model: string, usage: Usage): void {
  const price = PRICES[model] ?? PRICES[CLAUDE_MODELS.orchestrator]!;
  const input = usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
  const searches = usage.server_tool_use?.web_search_requests ?? 0;
  totals.inputTokens += input;
  totals.outputTokens += usage.output_tokens;
  totals.webSearches += searches;
  totals.dollars += (input * price.input + usage.output_tokens * price.output) / 1_000_000 + searches * WEB_SEARCH_DOLLARS;
}

/** The API key, or null when the agent is not configured on this deployment. */
export function claudeApiKey(env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  return env["ANTHROPIC_API_KEY"]?.trim() || null;
}
