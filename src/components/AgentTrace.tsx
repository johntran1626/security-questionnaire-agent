import type { TraceEvent } from "@/types/questionnaire";

function describe(e: TraceEvent): string {
  switch (e.type) {
    case "search":
      return `Searched "${e.query}": ${e.hits.length ? e.hits.slice(0, 3).map((h) => `${h.sectionId} (${h.heading})`).join(", ") : "no hits"}`;
    case "read":
      return e.found ? `Read section ${e.sectionId}` : `Tried to read ${e.docId}/${e.sectionId}: not found`;
    case "invalid_decision":
      return `Decision rejected by validation (${e.tool}): ${e.error}`;
    case "no_tool_call":
      return "Model replied without a tool call; asked it to decide";
    case "budget_exhausted":
      return `Used all ${e.toolCalls} searches and reads; required a decision`;
    case "citation_check":
      return e.ok ? "Citation check passed" : `Citation check: ${e.problems.join("; ")}${e.downgraded ? ". Answer turned into a flag." : ""}`;
    case "provider_error":
      return `Provider error: ${e.message}`;
  }
}

export function AgentTrace({ trace, usage, latencyMs }: { trace: TraceEvent[]; usage: { modelCalls: number; toolCalls: number }; latencyMs: number }) {
  return (
    <details className="text-xs text-slate-600">
      <summary className="cursor-pointer select-none text-slate-500 hover:text-slate-800">
        Agent trace: {usage.toolCalls} tool call{usage.toolCalls === 1 ? "" : "s"}, {usage.modelCalls} model call{usage.modelCalls === 1 ? "" : "s"}, {(latencyMs / 1000).toFixed(1)} s
      </summary>
      <ol className="mt-1 list-decimal space-y-0.5 pl-5">
        {trace.map((e, i) => <li key={i}>{describe(e)}</li>)}
      </ol>
    </details>
  );
}
