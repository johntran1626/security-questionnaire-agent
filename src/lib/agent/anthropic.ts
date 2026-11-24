import Anthropic from "@anthropic-ai/sdk";
import type { ChatSession, Provider, ToolSpec } from "./provider";

// Claude adapter (tool use). Current Claude models reject forced tool choice, so the request uses tool_choice
// "auto" and the loop enforces "always end with a decision" (one nudge, then flag). strict: true makes the API
// guarantee tool arguments match the schema. The tool list stays the same for the whole conversation, because
// earlier turns reference those tools; the budget rule is enforced by the loop instead.

const DEFAULT_MODEL = "claude-haiku-5-5"; // public demo model: lowest cost per question
const MAX_TOKENS = 4000; // a decision is a few hundred tokens; this leaves room for thinking

type Effort = "low" | "medium" | "high";

export function anthropicProvider(apiKey = process.env.ANTHROPIC_API_KEY, model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL): Provider {
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey, maxRetries: 2 });
  const effort = (process.env.ANTHROPIC_EFFORT as Effort) || "low";

  // On a safety-classifier refusal, Sonnet and larger models can retry on a fallback model inside the same call.
  // Haiku has no server-side fallback, so there a refusal ends the question as a flag (handled by the loop).
  const serverFallback = !model.startsWith("claude-haiku");
  const common = {
    model,
    max_tokens: MAX_TOKENS,
    output_config: { effort },
    ...(serverFallback ? { betas: ["server-side-fallback-2026-07-01"] as Anthropic.Beta.AnthropicBeta[], fallbacks: "default" as const } : {}),
  };

  function textOf(content: Anthropic.Beta.BetaContentBlock[]): string {
    return content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
  }

  function usageOf(res: Anthropic.Beta.BetaMessage) {
    const cacheReadTokens = res.usage.cache_read_input_tokens ?? 0;
    const cacheWriteTokens = res.usage.cache_creation_input_tokens ?? 0;
    return { inputTokens: res.usage.input_tokens + cacheReadTokens + cacheWriteTokens, outputTokens: res.usage.output_tokens, cacheReadTokens, cacheWriteTokens };
  }

  return {
    name: "anthropic",
    model,
    startSession({ system, tools }: { system: string; tools: ToolSpec[] }): ChatSession {
      const messages: Anthropic.Beta.BetaMessageParam[] = [];
      const toolDefs: Anthropic.Beta.BetaTool[] = tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as Anthropic.Beta.BetaTool.InputSchema,
        strict: true,
      }));

      return {
        async send(input) {
          if (input.kind === "user") {
            messages.push({ role: "user", content: input.text });
          } else {
            const blocks: Anthropic.Beta.BetaContentBlockParam[] = input.results.map((r) => ({
              type: "tool_result",
              tool_use_id: r.id,
              content: r.content,
              ...(r.isError ? { is_error: true } : {}),
            }));
            if (input.note) blocks.push({ type: "text", text: input.note });
            messages.push({ role: "user", content: blocks });
          }

          const res = await client.beta.messages.create({
            ...common,
            system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
            tools: toolDefs,
            tool_choice: { type: "auto" },
            messages,
          });

          if (res.stop_reason === "refusal") throw new Error("The model declined this request (refusal).");
          // Append the full content (including thinking blocks) so the next request carries them back unchanged.
          messages.push({ role: "assistant", content: res.content });

          const toolCalls = res.content.flatMap((b) => (b.type === "tool_use" ? [{ id: b.id, name: b.name, args: b.input }] : []));
          return { toolCalls, text: textOf(res.content), usage: usageOf(res) };
        },
      };
    },

    async complete({ system, prompt }) {
      const res = await client.beta.messages.create({
        ...common,
        // The system prompt carries the whole knowledge base in paste-everything mode; caching it means each later
        // question pays the cache-read rate for the documents instead of the full input rate.
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: prompt }],
      });
      if (res.stop_reason === "refusal") throw new Error("The model declined this request (refusal).");
      return { text: textOf(res.content), usage: usageOf(res) };
    },
  };
}
