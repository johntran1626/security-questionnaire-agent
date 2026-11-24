import { FunctionCallingConfigMode, GoogleGenAI, ThinkingLevel, type Content, type Part } from "@google/genai";
import type { ChatSession, Provider, ToolSpec } from "./provider";
import { withRetry } from "./retry";

// Gemini adapter (function calling). Gemini supports forcing a tool call (mode ANY) and narrowing the callable
// functions per request, so the "decide now" rule is enforced by the API as well as by the loop.

const DEFAULT_MODEL = "gemini-3.8-flash";

function thinkingLevel(): ThinkingLevel | undefined {
  const v = (process.env.GEMINI_THINKING ?? "low").toUpperCase();
  return v === "OFF" ? undefined : (ThinkingLevel as Record<string, ThinkingLevel>)[v];
}

export function geminiProvider(apiKey = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL || DEFAULT_MODEL): Provider {
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const ai = new GoogleGenAI({ apiKey });
  const level = thinkingLevel();
  const thinkingConfig = level ? { thinkingLevel: level } : undefined;

  return {
    name: "google",
    model,
    startSession({ system, tools }: { system: string; tools: ToolSpec[] }): ChatSession {
      const contents: Content[] = [];
      const declarations = tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters }));
      const generatedIds = new Set<string>();
      let counter = 0;

      return {
        async send(input, { allowedTools }) {
          if (input.kind === "user") {
            contents.push({ role: "user", parts: [{ text: input.text }] });
          } else {
            const parts: Part[] = input.results.map((r, i) => ({
              functionResponse: {
                // Only echo ids Gemini gave us; ids we generated ourselves are matched by name and order.
                ...(generatedIds.has(r.id) ? {} : { id: r.id }),
                name: r.name,
                response: {
                  [r.isError ? "error" : "output"]: r.content,
                  ...(input.note && i === input.results.length - 1 ? { note: input.note } : {}),
                },
              },
            }));
            contents.push({ role: "user", parts });
          }

          const res = await withRetry(() => ai.models.generateContent({
            model,
            contents,
            config: {
              systemInstruction: system,
              tools: [{ functionDeclarations: declarations }],
              toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY, allowedFunctionNames: allowedTools } },
              ...(thinkingConfig ? { thinkingConfig } : {}),
            },
          }));

          // Keep the model's turn exactly as returned (it can carry thought signatures that must be sent back).
          const turn = res.candidates?.[0]?.content;
          if (turn) contents.push(turn);

          const toolCalls = (res.functionCalls ?? []).map((fc) => {
            let id = fc.id;
            if (!id) {
              id = `gemini_call_${++counter}`;
              generatedIds.add(id);
            }
            return { id, name: fc.name ?? "", args: fc.args ?? {} };
          });
          const u = res.usageMetadata;
          return {
            toolCalls,
            text: res.text ?? "",
            usage: { inputTokens: u?.promptTokenCount ?? 0, outputTokens: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0), cacheReadTokens: u?.cachedContentTokenCount ?? 0 },
          };
        },
      };
    },

    async complete({ system, prompt, json }) {
      const res = await withRetry(() => ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { systemInstruction: system, ...(json ? { responseMimeType: "application/json" } : {}), ...(thinkingConfig ? { thinkingConfig } : {}) },
      }));
      const u = res.usageMetadata;
      return { text: res.text ?? "", usage: { inputTokens: u?.promptTokenCount ?? 0, outputTokens: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0), cacheReadTokens: u?.cachedContentTokenCount ?? 0 } };
    },
  };
}
