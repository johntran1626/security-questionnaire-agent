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
  scale?: number;
  subset?: "audited";
  excluded?: string[];
  run_at: string;
  summary: Summary;
}

const SYSTEM_ORDER = { agent: 0, paste_all: 1, keyword: 2, always_flag: 3 } as const;

// The page shows full runs on the unpadded knowledge base only. Scale-test rows (padded KBs) and the
// paste_all+check variant live in results/eval.md; smoke runs (limit) are left out everywhere. The audited subset
// (questions with known label conflicts removed, eval/audit.py) is selected separately so it never mixes with the
// headline rows.
export function selectEntries(results: Record<string, unknown>, set: "dev" | "heldout", subset?: "audited"): EvalEntry[] {
  return (Object.values(results) as EvalEntry[])
    .filter((e) => e.set === set && !e.limit && (e.scale ?? 1) === 1 && e.system in SYSTEM_ORDER && e.subset === subset)
    .sort((a, b) => SYSTEM_ORDER[a.system] - SYSTEM_ORDER[b.system] || a.model.localeCompare(b.model));
}

export function evalEntries(set: "dev" | "heldout", subset?: "audited"): EvalEntry[] {
  return selectEntries(evalResults as Record<string, unknown>, set, subset);
}

export const SYSTEM_LABEL: Record<EvalEntry["system"], string> = {
  agent: "Agent (tools + citation check)",
  paste_all: "Paste everything into one prompt",
  keyword: "Keyword lookup, no model",
  always_flag: "Always flag (do it by hand)",
};
