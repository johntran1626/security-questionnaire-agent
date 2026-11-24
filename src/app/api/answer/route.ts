import { getProvider } from "@/lib/agent";
import { runAgent } from "@/lib/agent/loop";
import type { Provider } from "@/lib/agent/provider";
import { runKeyword, runPasteAll } from "@/lib/baselines";
import { loadPaddedKb } from "@/lib/evalKnowledgeBase";
import { getKnowledgeBase, getSample, KB_IDS, type KbId } from "@/lib/knowledgeBase";
import { getRateLimiter } from "@/lib/rateLimit";
import { requestSchema } from "@/lib/schemas";
import type { AnswerResponse, QuestionResult } from "@/types/questionnaire";

// A full 50-question run makes a few hundred model calls; allow the platform maximum for one request.
export const maxDuration = 300;

const CONCURRENCY = 5; // questions in flight at once; bounded to stay under provider rate limits

function error(status: number, code: string, message: string, extra: Record<string, unknown> = {}, headers: HeadersInit = {}) {
  return Response.json({ error: { code, message, ...extra } }, { status, headers });
}

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

// warmFirst: run the first item alone before the rest, so a shared prompt it caches is reused by the others
// instead of being written to the cache once per parallel worker.
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>, warmFirst = false): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  if (warmFirst && items.length > 1) out[next++] = await fn(items[0]);
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error(400, "invalid_json", "Request body must be JSON.");
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return error(400, "invalid_request", "Request failed validation.", {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const { kbId, mode, provider: providerName, model: modelName } = parsed.data;

  let questions = parsed.data.questions;
  if (parsed.data.sampleId) {
    const sample = getSample(parsed.data.sampleId);
    if (!sample) return error(400, "unknown_sample", "No sample questionnaire with that id.");
    questions = sample.questions;
  }

  // Baselines and provider/model switching are for local evaluation only; the public demo runs one fixed model.
  const evalModes = process.env.ENABLE_EVAL_MODES === "1";
  const padded = !(KB_IDS as readonly string[]).includes(kbId);
  if (!evalModes && (mode !== "agent" || providerName || modelName || padded)) {
    return error(403, "eval_only", "Baseline modes and provider selection are disabled on this deployment.");
  }

  const kb = padded ? await loadPaddedKb(kbId) : getKnowledgeBase(kbId as KbId);
  if (!kb) return error(400, "unknown_kb", "No knowledge base with that id. Generate it with eval/distractors.py.");

  const limit = await getRateLimiter().check(clientIp(req), questions!.length);
  if (!limit.ok) {
    const message = limit.scope === "ip" ? "Too many questions from your network this hour. Please try again later." : "The demo has reached its daily limit. Please try again tomorrow.";
    return error(429, "rate_limited", message, { scope: limit.scope }, { "retry-after": String(limit.retryAfterSec) });
  }

  let provider: Provider | undefined;
  if (mode !== "keyword") {
    try {
      provider = getProvider(providerName, modelName);
    } catch {
      return error(503, "provider_not_configured", "The AI provider is not configured on this server.");
    }
  }

  const results: QuestionResult[] = await mapPool(questions!, CONCURRENCY, async (q) => {
    if (mode === "keyword") return runKeyword(q, kb);
    if (mode === "paste_all") return runPasteAll(q, kb, provider!);
    return runAgent({ question: q, kb, provider: provider! });
  }, mode === "paste_all");

  const response: AnswerResponse = {
    kbId,
    provider: provider?.name ?? "none",
    model: provider?.model ?? "keyword-search",
    mode,
    results,
  };
  return Response.json(response);
}
