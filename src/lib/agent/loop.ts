import { checkDecision } from "@/lib/citations";
import { answerArgsSchema, flagArgsSchema, LIMITS } from "@/lib/schemas";
import type { Decision, FlagDecision, KnowledgeBase, QuestionResult, TraceEvent } from "@/types/questionnaire";
import { BUDGET_NOTE, NUDGE_TEXT, questionMessage, systemPrompt } from "./prompts";
import type { Provider, SessionInput, ToolResult } from "./provider";
import { DECISION_TOOLS, LOOKUP_TOOLS, runRead, runSearch, TOOL_SPECS } from "./tools";

// The agent loop: the model asks for a tool, our code runs it and sends the result back, until the model calls one
// of the two decision tools. Code, not the model, enforces the limits: a tool-call budget, one retry for a malformed
// decision, one nudge for a plain-text reply, and a hard cap on model calls.

export interface RunOptions {
  question: string;
  kb: KnowledgeBase;
  provider: Provider;
  maxToolCalls?: number;
}

const ALL_TOOLS = [...LOOKUP_TOOLS, ...DECISION_TOOLS];

function couldNotProcess(reason: string): FlagDecision {
  return { decision: "flag_for_expert", category: "could_not_process", reason };
}

function parseDecision(name: string, args: unknown): { decision?: Decision; error?: string } {
  if (name === "answer") {
    const r = answerArgsSchema.safeParse(args);
    return r.success ? { decision: { decision: "answer", ...r.data } } : { error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  const r = flagArgsSchema.safeParse(args);
  return r.success ? { decision: { decision: "flag_for_expert", ...r.data } } : { error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
}

export async function runAgent({ question, kb, provider, maxToolCalls = LIMITS.maxToolCalls }: RunOptions): Promise<QuestionResult> {
  const started = Date.now();
  const trace: TraceEvent[] = [];
  const usage = { inputTokens: 0, outputTokens: 0, modelCalls: 0, toolCalls: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const maxModelCalls = maxToolCalls + 4; // room for the decision, one retry and one nudge

  const finish = (decision: Decision): QuestionResult => {
    let final = decision;
    if (decision.decision === "answer") {
      const check = checkDecision(kb, decision);
      trace.push({ type: "citation_check", ok: check.ok, problems: check.problems, downgraded: check.downgraded });
      final = check.decision;
    }
    return { question, decision: final, trace, usage, latencyMs: Date.now() - started };
  };

  const session = provider.startSession({ system: systemPrompt(kb, maxToolCalls), tools: TOOL_SPECS });
  let input: SessionInput = { kind: "user", text: questionMessage(question) };
  let decisionFailures = 0;
  let nudges = 0;

  while (usage.modelCalls < maxModelCalls) {
    const budgetLeft = usage.toolCalls < maxToolCalls;
    let turn;
    try {
      turn = await session.send(input, { allowedTools: budgetLeft ? ALL_TOOLS : [...DECISION_TOOLS] });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      trace.push({ type: "provider_error", message: message.slice(0, 300) });
      return finish(couldNotProcess("The AI provider returned an error, so this question was not processed."));
    }
    usage.modelCalls++;
    usage.inputTokens += turn.usage.inputTokens;
    usage.outputTokens += turn.usage.outputTokens;
    usage.cacheReadTokens += turn.usage.cacheReadTokens ?? 0;
    usage.cacheWriteTokens += turn.usage.cacheWriteTokens ?? 0;

    if (turn.toolCalls.length === 0) {
      trace.push({ type: "no_tool_call", text: turn.text.slice(0, 300) });
      if (nudges++ >= 1) return finish(couldNotProcess("The model did not return a decision."));
      input = { kind: "user", text: NUDGE_TEXT };
      continue;
    }

    const results: ToolResult[] = [];
    let decided: Decision | undefined;
    let invalid = false;

    for (const call of turn.toolCalls) {
      if ((DECISION_TOOLS as readonly string[]).includes(call.name)) {
        const { decision, error } = parseDecision(call.name, call.args);
        if (decision) {
          decided ??= decision;
          results.push({ id: call.id, name: call.name, content: "Recorded." });
        } else {
          invalid = true;
          trace.push({ type: "invalid_decision", tool: call.name, error: error ?? "invalid" });
          results.push({ id: call.id, name: call.name, content: `Invalid arguments: ${error}. Call ${call.name} again with valid arguments.`, isError: true });
        }
      } else if ((LOOKUP_TOOLS as readonly string[]).includes(call.name)) {
        if (usage.toolCalls >= maxToolCalls) {
          results.push({ id: call.id, name: call.name, content: BUDGET_NOTE, isError: true });
          continue;
        }
        usage.toolCalls++;
        if (call.name === "search_docs") {
          const r = runSearch(kb, call.args);
          trace.push({
            type: "search",
            query: r.query ?? "",
            hits: (r.ok && r.hits ? r.hits : []).map((h) => ({ docId: h.docId, sectionId: h.sectionId, heading: h.heading, score: h.score })),
          });
          results.push({ id: call.id, name: call.name, content: r.content, isError: !r.ok });
        } else {
          const r = runRead(kb, call.args);
          trace.push({ type: "read", docId: r.docId ?? "", sectionId: r.sectionId ?? "", found: r.ok });
          results.push({ id: call.id, name: call.name, content: r.content, isError: !r.ok });
        }
      } else {
        results.push({ id: call.id, name: call.name, content: `Unknown tool ${call.name}.`, isError: true });
      }
    }

    if (decided) return finish(decided);

    if (invalid && ++decisionFailures >= 2) {
      return finish(couldNotProcess("The model's decision failed validation twice."));
    }

    let note: string | undefined;
    if (usage.toolCalls >= maxToolCalls) {
      if (!trace.some((t) => t.type === "budget_exhausted")) trace.push({ type: "budget_exhausted", toolCalls: usage.toolCalls });
      note = BUDGET_NOTE;
    }
    input = { kind: "tool_results", results, note };
  }

  return finish(couldNotProcess("The model did not reach a decision within the step limit."));
}
