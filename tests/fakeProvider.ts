import type { ChatSession, ModelTurn, Provider, SessionInput, ToolCall } from "@/lib/agent/provider";

type Step = ToolCall[] | string | Error;

// A scripted stand-in for a model: each send() returns the next step. Lets the loop be tested without an API key.
export function fakeProvider(steps: Step[]) {
  const inputs: SessionInput[] = [];
  const allowed: string[][] = [];
  let systemPrompt = "";
  let i = 0;
  const session: ChatSession = {
    async send(input, opts): Promise<ModelTurn> {
      inputs.push(input);
      allowed.push(opts.allowedTools);
      const step = steps[Math.min(i++, steps.length - 1)];
      if (step instanceof Error) throw step;
      const usage = { inputTokens: 100, outputTokens: 20, cacheReadTokens: 60, cacheWriteTokens: 30 };
      if (typeof step === "string") return { toolCalls: [], text: step, usage };
      return { toolCalls: step, text: "", usage };
    },
  };
  const provider: Provider = {
    name: "fake",
    model: "fake-1",
    startSession({ system }) {
      systemPrompt = system;
      return session;
    },
    async complete() {
      throw new Error("not used");
    },
  };
  return { provider, inputs, allowed, system: () => systemPrompt };
}

let n = 0;
export const call = (name: string, args: unknown): ToolCall => ({ id: `call_${++n}`, name, args });
