// Shared types for the knowledge base, the agent's decisions and the API response.

export interface KbSection {
  id: string;
  heading: string;
  text: string;
}

export interface KbDoc {
  id: string;
  title: string;
  sections: KbSection[];
}

export interface KnowledgeBase {
  id: string;
  name: string;
  blurb: string;
  docs: KbDoc[];
}

export type AnswerValue = "Yes" | "No" | "Partial";

export interface Citation {
  docId: string;
  sectionId: string;
  quote: string;
}

export interface AnswerDecision {
  decision: "answer";
  value: AnswerValue;
  explanation: string;
  confidence: "high" | "medium" | "low";
  citations: Citation[];
}

export type FlagCategory =
  | "not_covered"
  | "contradiction"
  | "commitment"
  | "unclear"
  | "citation_failed"
  | "could_not_process";

export interface FlagDecision {
  decision: "flag_for_expert";
  category: FlagCategory;
  reason: string;
}

export type Decision = AnswerDecision | FlagDecision;

export type TraceEvent =
  | { type: "search"; query: string; hits: { docId: string; sectionId: string; heading: string; score: number }[] }
  | { type: "read"; docId: string; sectionId: string; found: boolean }
  | { type: "invalid_decision"; tool: string; error: string }
  | { type: "no_tool_call"; text: string }
  | { type: "budget_exhausted"; toolCalls: number }
  | { type: "citation_check"; ok: boolean; problems: string[]; downgraded: boolean }
  | { type: "provider_error"; message: string };

export interface QuestionResult {
  question: string;
  decision: Decision;
  trace: TraceEvent[];
  // cacheRead/WriteTokens are the parts of inputTokens billed at prompt-cache rates.
  usage: { inputTokens: number; outputTokens: number; modelCalls: number; toolCalls: number; cacheReadTokens?: number; cacheWriteTokens?: number };
  latencyMs: number;
}

export interface AnswerResponse {
  kbId: string;
  provider: string;
  model: string;
  mode: Mode;
  results: QuestionResult[];
}

// "agent" is the product. The other two are evaluation baselines and are disabled on the public deployment.
export type Mode = "agent" | "paste_all" | "keyword";
