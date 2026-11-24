// Provider-neutral interface for the agent loop. Each adapter (Gemini, Claude) translates to its own SDK and keeps
// the conversation history in the SDK's native format, so provider-specific data (thinking blocks, thought
// signatures) is passed back exactly as received.

export interface ToolSpec {
  name: string;
  description: string;
  // Plain JSON Schema object with required fields and additionalProperties: false, accepted by both providers.
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  args: unknown;
}

export interface ToolResult {
  id: string;
  name: string;
  content: string;
  isError?: boolean;
}

export type SessionInput =
  | { kind: "user"; text: string }
  | { kind: "tool_results"; results: ToolResult[]; note?: string };

export interface Usage {
  inputTokens: number; // whole prompt, including any part served from or written to the prompt cache
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface ModelTurn {
  toolCalls: ToolCall[];
  text: string;
  usage: Usage;
}

export interface ChatSession {
  send(input: SessionInput, opts: { allowedTools: string[] }): Promise<ModelTurn>;
}

export interface Provider {
  name: string;
  model: string;
  startSession(opts: { system: string; tools: ToolSpec[] }): ChatSession;
  // Single call returning text; used by the paste-everything baseline. json: ask the provider for a JSON reply.
  complete(opts: { system: string; prompt: string; json?: boolean }): Promise<{ text: string; usage: Usage }>;
}
