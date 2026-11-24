import { describe, expect, it } from "vitest";
import { runPasteAll } from "@/lib/baselines";
import type { Provider } from "@/lib/agent/provider";
import { EXPLANATION_MAX, REASON_MAX } from "@/lib/schemas";
import { kb } from "./helpers";

// A provider whose complete() returns scripted replies and records every prompt it was sent.
function scripted(replies: string[]) {
  const calls: { system: string; prompt: string }[] = [];
  let i = 0;
  const provider: Provider = {
    name: "fake",
    model: "fake-1",
    startSession() {
      throw new Error("not used");
    },
    async complete(opts) {
      calls.push({ system: opts.system, prompt: opts.prompt });
      const text = replies[Math.min(i++, replies.length - 1)];
      return { text, usage: { inputTokens: 100, outputTokens: 20 } };
    },
  };
  return { provider, calls };
}

const flag = (reason: string) => JSON.stringify({ decision: "flag_for_expert", category: "not_covered", reason });

describe("paste-all baseline", () => {
  it("states the length limits in its instructions, as the agent's tool schemas do", async () => {
    const { provider, calls } = scripted([flag("Not in the documents.")]);
    await runPasteAll("Do you have a bug bounty?", kb, provider);
    expect(calls[0].system).toContain(String(EXPLANATION_MAX));
    expect(calls[0].system).toContain(String(REASON_MAX));
  });

  it("sends the validation error back on the retry, like the agent loop", async () => {
    const { provider, calls } = scripted([flag("x".repeat(REASON_MAX + 50)), flag("Not in the documents.")]);
    const r = await runPasteAll("Do you have a bug bounty?", kb, provider);
    expect(calls).toHaveLength(2);
    expect(calls[1].prompt).toMatch(/invalid/i);
    expect(calls[1].prompt).toContain(String(REASON_MAX));
    expect(r.decision).toMatchObject({ decision: "flag_for_expert", category: "not_covered" });
  });

  it("keeps the system prompt identical on the retry so the cached documents are reused", async () => {
    const { provider, calls } = scripted(["not json", flag("Not in the documents.")]);
    await runPasteAll("Do you have a bug bounty?", kb, provider);
    expect(calls[1].system).toBe(calls[0].system);
  });

  it("flags could_not_process when the retry is also invalid", async () => {
    const { provider } = scripted(["not json"]);
    const r = await runPasteAll("Do you have a bug bounty?", kb, provider);
    expect(r.decision).toMatchObject({ category: "could_not_process" });
    expect(r.usage.modelCalls).toBe(2);
  });
});
