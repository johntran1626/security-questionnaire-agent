import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Provider } from "@/lib/agent/provider";
import { call, fakeProvider } from "./fakeProvider";

// The route is tested with a scripted provider so no API key or network is needed.
const providerState: { factory: (...args: unknown[]) => ReturnType<typeof fakeProvider>["provider"] } = {
  factory: () => fakeProvider([[call("flag_for_expert", { category: "not_covered", reason: "Not in the docs." })]]).provider,
};
vi.mock("@/lib/agent", () => ({ getProvider: (...args: unknown[]) => providerState.factory(...args) }));

async function loadRoute(env: Record<string, string> = {}) {
  vi.resetModules();
  for (const k of ["QUESTIONS_PER_HOUR_PER_IP", "DAILY_QUESTION_CAP", "ENABLE_EVAL_MODES", "EVAL_KB_DIR", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) delete process.env[k];
  Object.assign(process.env, env);
  return import("@/app/api/answer/route");
}

function post(body: unknown, ip = "9.9.9.9") {
  return new Request("http://localhost/api/answer", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/answer", () => {
  beforeEach(() => {
    providerState.factory = () => fakeProvider([[call("flag_for_expert", { category: "not_covered", reason: "Not in the docs." })]]).provider;
  });

  it("answers a list of questions", async () => {
    const { POST } = await loadRoute();
    const res = await POST(post({ questions: ["Do you have a bug bounty?", "Do you have SSO?"] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(2);
    expect(body.results[0]).toMatchObject({ question: "Do you have a bug bounty?", decision: { decision: "flag_for_expert" } });
    expect(body.mode).toBe("agent");
  });

  it("runs a sample questionnaire by id", async () => {
    const { POST } = await loadRoute();
    const res = await POST(post({ sampleId: "tricky" }));
    expect(res.status).toBe(200);
    expect((await res.json()).results).toHaveLength(10);
  });

  it("returns 400 for malformed JSON, bad input and unknown samples", async () => {
    const { POST } = await loadRoute();
    expect((await POST(post("{not json"))).status).toBe(400);
    expect((await POST(post({ questions: Array(51).fill("q?") }))).status).toBe(400);
    const res = await POST(post({ sampleId: "nope" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("unknown_sample");
  });

  it("blocks evaluation baselines on the public deployment", async () => {
    const { POST } = await loadRoute();
    const res = await POST(post({ questions: ["q?"], mode: "paste_all" }));
    expect(res.status).toBe(403);
  });

  it("runs the keyword baseline without a model when eval modes are on", async () => {
    providerState.factory = () => {
      throw new Error("provider should not be needed");
    };
    const { POST } = await loadRoute({ ENABLE_EVAL_MODES: "1" });
    const res = await POST(post({ questions: ["Is customer data encrypted at rest?", "zzzz qqqq?"], mode: "keyword" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0].decision).toMatchObject({ decision: "answer", value: "Yes" });
    expect(body.results[1].decision).toMatchObject({ decision: "flag_for_expert" });
  });

  it("returns 429 once the per-IP question limit is used up", async () => {
    const { POST } = await loadRoute({ QUESTIONS_PER_HOUR_PER_IP: "2" });
    expect((await POST(post({ questions: ["a?"] }))).status).toBe(200);
    expect((await POST(post({ questions: ["a?"] }))).status).toBe(200);
    const res = await POST(post({ questions: ["a?"] }));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect((await POST(post({ questions: ["a?"] }, "8.8.8.8"))).status).toBe(200);
  });

  it("charges a run by its number of questions", async () => {
    const { POST } = await loadRoute({ QUESTIONS_PER_HOUR_PER_IP: "5" });
    expect((await POST(post({ questions: ["a?", "b?", "c?"] }))).status).toBe(200);
    expect((await POST(post({ questions: ["a?", "b?", "c?"] }))).status).toBe(429);
    expect((await POST(post({ questions: ["a?", "b?"] }))).status).toBe(200);
  });

  it("charges a sample questionnaire by its question count", async () => {
    const { POST } = await loadRoute({ QUESTIONS_PER_HOUR_PER_IP: "9" });
    expect((await POST(post({ sampleId: "tricky" }))).status).toBe(429); // 10 questions
  });

  it("lets eval mode choose the model, and rejects that on the public deployment", async () => {
    let seen: unknown;
    providerState.factory = (...args: unknown[]) => {
      seen = args;
      return fakeProvider([[call("flag_for_expert", { category: "not_covered", reason: "Not in the docs." })]]).provider;
    };
    const pub = await loadRoute();
    expect((await pub.POST(post({ questions: ["a?"], model: "claude-sonnet-5-5" }))).status).toBe(403);
    const ev = await loadRoute({ ENABLE_EVAL_MODES: "1" });
    expect((await ev.POST(post({ questions: ["a?"], provider: "anthropic", model: "claude-sonnet-5-5" }))).status).toBe(200);
    expect(seen).toEqual(["anthropic", "claude-sonnet-5-5"]);
    expect((await ev.POST(post({ questions: ["a?"], model: "bad model!" }))).status).toBe(400);
  });

  it("does not spend rate limit on invalid requests", async () => {
    const { POST } = await loadRoute({ QUESTIONS_PER_HOUR_PER_IP: "1" });
    await POST(post({ questions: [] }));
    expect((await POST(post({ questions: ["a?"] }))).status).toBe(200);
  });

  it("returns 503 when no provider is configured", async () => {
    providerState.factory = () => {
      throw new Error("GEMINI_API_KEY is not set");
    };
    const { POST } = await loadRoute();
    const res = await POST(post({ questions: ["a?"] }));
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toMatch(/GEMINI_API_KEY/);
  });

  it("serves padded knowledge bases from disk in eval mode only", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kb-"));
    const padded = {
      id: "kestrelbyte-x3",
      name: "Kestrelbyte",
      blurb: "test",
      docs: [{ id: "bb", title: "Bug bounty", sections: [{ id: "bb-1", heading: "Bug bounty programme", text: "We run a public bug bounty programme with rewards." }] }],
    };
    writeFileSync(join(dir, "kestrelbyte-x3.json"), JSON.stringify(padded));
    const body = { questions: ["Do you run a bug bounty programme?"], kbId: "kestrelbyte-x3", mode: "keyword" };

    const pub = await loadRoute({ EVAL_KB_DIR: dir });
    expect((await pub.POST(post({ questions: ["a?"], kbId: "kestrelbyte-x3" }))).status).toBe(403);

    const ev = await loadRoute({ ENABLE_EVAL_MODES: "1", EVAL_KB_DIR: dir });
    const res = await ev.POST(post(body));
    expect(res.status).toBe(200);
    // Search ran over the padded knowledge base read from disk.
    expect((await res.json()).results[0].trace[0].hits[0].sectionId).toBe("bb-1");

    const missing = await ev.POST(post({ ...body, kbId: "kestrelbyte-x7" }));
    expect(missing.status).toBe(400);
    expect((await missing.json()).error.code).toBe("unknown_kb");
    expect((await ev.POST(post({ ...body, kbId: "../../etc/passwd" }))).status).toBe(400);
  });

  it("runs the first paste-all question alone so the rest can reuse its cached prompt", async () => {
    const events: string[] = [];
    let n = 0;
    providerState.factory = () =>
      ({
        name: "fake",
        model: "fake-1",
        startSession() {
          throw new Error("not used");
        },
        async complete() {
          const id = n++;
          events.push(`start${id}`);
          await new Promise((r) => setTimeout(r, 5));
          events.push(`end${id}`);
          return {
            text: JSON.stringify({ decision: "flag_for_expert", category: "not_covered", reason: "Not covered." }),
            usage: { inputTokens: 1000, outputTokens: 10, cacheReadTokens: 900, cacheWriteTokens: 0 },
          };
        },
      }) satisfies Provider;
    const { POST } = await loadRoute({ ENABLE_EVAL_MODES: "1" });
    const res = await POST(post({ questions: ["a?", "b?", "c?"], mode: "paste_all" }));
    expect(res.status).toBe(200);
    expect(events.slice(0, 2)).toEqual(["start0", "end0"]);
    expect(events.slice(2, 4)).toEqual(["start1", "start2"]); // the rest still run in parallel
    expect((await res.json()).results[0].usage).toMatchObject({ inputTokens: 1000, cacheReadTokens: 900 });
  });
});
