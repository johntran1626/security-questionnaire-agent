import { checkDecision } from "@/lib/citations";
import { pasteAllOutputSchema } from "@/lib/schemas";
import { searchKb } from "@/lib/search";
import type { Decision, KnowledgeBase, QuestionResult } from "@/types/questionnaire";
import { questionMessage, systemPrompt } from "./agent/prompts";
import type { Provider } from "./agent/provider";

// Evaluation baselines. They exist to answer "is the agent worth it?", so they are deliberately simple.

/**
 * Baseline 1: the same model gets every document plus the question in one prompt. No tools, no citation check.
 * The documents go in the system prompt and the question last, so the provider can cache the documents once and
 * reuse them for every question; that is how this approach would be run in production, so it is how it is priced.
 */
export function kbAsText(kb: KnowledgeBase): string {
  return kb.docs
    .map((d) => d.sections.map((s) => `[docId=${d.id} sectionId=${s.id}] ${d.title} > ${s.heading}\n${s.text}`).join("\n\n"))
    .join("\n\n");
}

const JSON_INSTRUCTIONS = `You have no tools. All of the documents are below. Reply with one JSON object and nothing else, either
{"decision":"answer","value":"Yes"|"No"|"Partial","explanation":"...","confidence":"high"|"medium"|"low","citations":[{"docId":"...","sectionId":"...","quote":"..."}]}
or
{"decision":"flag_for_expert","category":"not_covered"|"contradiction"|"commitment"|"unclear","reason":"..."}`;

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw);
}

export async function runPasteAll(question: string, kb: KnowledgeBase, provider: Provider): Promise<QuestionResult> {
  const started = Date.now();
  const usage = { inputTokens: 0, outputTokens: 0, modelCalls: 0, toolCalls: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const trace: QuestionResult["trace"] = [];
  const system = `${systemPrompt(kb, 0)}\n\n${JSON_INSTRUCTIONS}\n\nDocuments:\n\n${kbAsText(kb)}`;
  let decision: Decision | undefined;

  for (let attempt = 0; attempt < 2 && !decision; attempt++) {
    try {
      const res = await provider.complete({ system, prompt: questionMessage(question), json: true });
      usage.modelCalls++;
      usage.inputTokens += res.usage.inputTokens;
      usage.outputTokens += res.usage.outputTokens;
      usage.cacheReadTokens += res.usage.cacheReadTokens ?? 0;
      usage.cacheWriteTokens += res.usage.cacheWriteTokens ?? 0;
      const parsed = pasteAllOutputSchema.safeParse(extractJson(res.text));
      if (parsed.success) decision = parsed.data as Decision;
      else trace.push({ type: "invalid_decision", tool: "json", error: parsed.error.issues[0]?.message ?? "invalid" });
    } catch (err) {
      trace.push({ type: "provider_error", message: (err instanceof Error ? err.message : String(err)).slice(0, 300) });
    }
  }
  decision ??= { decision: "flag_for_expert", category: "could_not_process", reason: "No valid JSON decision after one retry." };
  if (decision.decision === "answer") {
    // Recorded for the eval only; this baseline does not act on it.
    const check = checkDecision(kb, decision);
    trace.push({ type: "citation_check", ok: check.ok, problems: check.problems, downgraded: false });
  }
  return { question, decision, trace, usage, latencyMs: Date.now() - started };
}

/**
 * Baseline 2: search alone, no model. If the top section scores above a threshold, answer "Yes" and quote its first
 * sentence; otherwise flag. Shows what plain search gets you, including the false promises it makes.
 */
export const KEYWORD_THRESHOLD = Number(process.env.KEYWORD_THRESHOLD) || 4;

export function runKeyword(question: string, kb: KnowledgeBase, threshold = KEYWORD_THRESHOLD): QuestionResult {
  const started = Date.now();
  const hits = searchKb(kb, question, 5);
  const trace: QuestionResult["trace"] = [
    { type: "search", query: question, hits: hits.map((h) => ({ docId: h.docId, sectionId: h.sectionId, heading: h.heading, score: h.score })) },
  ];
  let decision: Decision;
  const top = hits[0];
  if (top && top.score >= threshold) {
    const text = kb.docs.find((d) => d.id === top.docId)!.sections.find((s) => s.id === top.sectionId)!.text;
    const firstSentence = text.match(/^.*?[.!?](\s|$)/)?.[0].trim() ?? text;
    decision = {
      decision: "answer",
      value: "Yes",
      explanation: firstSentence,
      confidence: "low",
      citations: [{ docId: top.docId, sectionId: top.sectionId, quote: firstSentence }],
    };
  } else {
    decision = { decision: "flag_for_expert", category: "not_covered", reason: "No section matched strongly enough." };
  }
  if (decision.decision === "answer") {
    const check = checkDecision(kb, decision);
    trace.push({ type: "citation_check", ok: check.ok, problems: check.problems, downgraded: false });
  }
  return { question, decision, trace, usage: { inputTokens: 0, outputTokens: 0, modelCalls: 0, toolCalls: 1 }, latencyMs: Date.now() - started };
}
