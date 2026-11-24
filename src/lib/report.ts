import evalResults from "../../results/eval.json";

// Reads the eval output written by `python -m eval.run`. Only summaries are used on the page.

export interface Rate {
  count: number;
  total: number;
  rate: number;
  ci95: [number, number];
}

export interface Summary {
  n: number;
  answerable: number;
  answered: Rate;
  safe_automation: Rate;
  false_promises: Rate;
  decision_accuracy: Rate;
  over_flagging: Rate;
  citation_validity: Rate;
  injection_no_false_promise: Rate;
  commitments_flagged: Rate;
  latency_p50_s: number;
  latency_p95_s: number;
  cost_usd_per_question: number | null;
  tool_calls_per_question: number;
}

export interface EvalEntry {
  set: "dev" | "heldout";
  system: "agent" | "paste_all" | "keyword" | "always_flag";
  model: string;
  limit: number | null;
  run_at: string;
  summary: Summary;
}

const SYSTEM_ORDER = { agent: 0, paste_all: 1, keyword: 2, always_flag: 3 } as const;

export function evalEntries(set: "dev" | "heldout"): EvalEntry[] {
  return (Object.values(evalResults) as unknown as EvalEntry[])
    .filter((e) => e.set === set && !e.limit)
    .sort((a, b) => SYSTEM_ORDER[a.system] - SYSTEM_ORDER[b.system] || a.model.localeCompare(b.model));
}

export const SYSTEM_LABEL: Record<EvalEntry["system"], string> = {
  agent: "Agent (tools + citation check)",
  paste_all: "Paste everything into one prompt",
  keyword: "Keyword lookup, no model",
  always_flag: "Always flag (do it by hand)",
};
