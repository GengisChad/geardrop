import {
  addUsage,
  type ClaudeClient,
  type ContentBlock,
  type MessageParam,
  type ServerToolDefinition,
  type ToolResultBlock,
  type ToolUseBlock,
  type UsageTotals,
} from "./claude-api";

/** A tool the agent may call; it runs here, on the server, with the partner's rights. */
export type ClientTool = {
  readonly name: string;
  readonly description: string;
  readonly input_schema: Readonly<Record<string, unknown>>;
  run(input: unknown): Promise<unknown>;
};

export type AgentOptions = {
  readonly model: string;
  readonly system: string;
  readonly messages: readonly MessageParam[];
  readonly tools?: readonly ClientTool[];
  readonly serverTools?: readonly ServerToolDefinition[];
  readonly maxTokens?: number;
  /** Model calls before the loop gives up: a bound on what a run can spend. */
  readonly maxTurns?: number;
};

export type AgentResult = {
  readonly text: string;
  readonly turns: number;
  readonly stopReason: string;
  readonly toolCalls: number;
};

function isToolUse(block: ContentBlock): block is ToolUseBlock {
  return block.type === "tool_use";
}

function textOf(content: readonly ContentBlock[]): string {
  return content
    .filter((block): block is { type: "text"; text: string } => block.type === "text" && typeof (block as { text?: unknown }).text === "string")
    .map((block) => block.text)
    .join("")
    .trim();
}

/**
 * The tool loop: call the model, run the tools it asks for, send the results back, until it
 * answers. Server tools (web search and fetch) run at Anthropic: a long one returns pause_turn
 * and the conversation simply continues. A tool that throws answers with is_error, so the model
 * can recover instead of the run failing.
 */
export async function runAgent(client: ClaudeClient, usage: UsageTotals, options: AgentOptions): Promise<AgentResult> {
  const tools = options.tools ?? [];
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const messages: MessageParam[] = [...options.messages];
  const maxTurns = options.maxTurns ?? 12;
  let toolCalls = 0;
  let lastText = "";

  for (let turn = 1; turn <= maxTurns; turn += 1) {
    const response = await client.createMessage({
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      system: options.system,
      messages,
      tools: [
        ...(options.serverTools ?? []),
        ...tools.map(({ name, description, input_schema }) => ({ name, description, input_schema })),
      ],
    });
    addUsage(usage, response.model || options.model, response.usage);
    messages.push({ role: "assistant", content: response.content });
    const text = textOf(response.content);
    if (text) lastText = text;

    if (response.stop_reason === "pause_turn") continue;
    if (response.stop_reason !== "tool_use") {
      return { text: lastText, turns: turn, stopReason: response.stop_reason, toolCalls };
    }

    const results: ToolResultBlock[] = [];
    for (const block of response.content.filter(isToolUse)) {
      const tool = byName.get(block.name);
      toolCalls += 1;
      if (!tool) {
        results.push({ type: "tool_result", tool_use_id: block.id, content: `Strumento sconosciuto: ${block.name}`, is_error: true });
        continue;
      }
      try {
        const output = await tool.run(block.input);
        results.push({ type: "tool_result", tool_use_id: block.id, content: typeof output === "string" ? output : JSON.stringify(output) });
      } catch (error) {
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: error instanceof Error ? error.message : String(error),
          is_error: true,
        });
      }
    }
    // Only server tools were used: the API resumes on its own with the next call.
    if (results.length > 0) messages.push({ role: "user", content: results });
  }
  return { text: lastText, turns: maxTurns, stopReason: "max_turns", toolCalls };
}
