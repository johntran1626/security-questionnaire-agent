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
    <details className="group text-xs text-neutral-700">
      <summary className="inline-block cursor-pointer rounded-lg border-2 border-dashed border-neutral-400 px-2 py-0.5 font-medium text-neutral-600 select-none hover:border-ink hover:text-ink group-open:border-solid group-open:border-ink group-open:bg-sky">
        Agent steps: {usage.toolCalls} search{usage.toolCalls === 1 ? "" : "es"} and reads, {(latencyMs / 1000).toFixed(1)} s
      </summary>
      <ol className="mt-2 mb-0 list-decimal space-y-1 pl-5 marker:font-display marker:text-blue">
        {trace.map((e, i) => <li key={i}>{describe(e)}</li>)}
      </ol>
    </details>
  );
}
