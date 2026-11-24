import { z } from "zod";
import { KB_IDS } from "@/lib/knowledgeBase";

// Padded copies of a knowledge base for the scale test, e.g. "kestrelbyte-x50". Eval mode only; the strict pattern
// also keeps the id safe to use as a file name.
export const PADDED_KB_ID = /^(kestrelbyte|tidemark)-x\d{1,3}$/;

// Parse, don't trust: everything that crosses a boundary (HTTP body, model tool arguments) is validated here.

export const LIMITS = {
  maxQuestions: 50, // bounds cost and run time per request
  maxQuestionChars: 300,
  maxToolCalls: 6, // searches + reads per question before the agent must decide
} as const;

export const requestSchema = z
  .object({
    questions: z
      .array(z.string().trim().min(1, "empty question").max(LIMITS.maxQuestionChars))
      .min(1)
      .max(LIMITS.maxQuestions)
      .optional(),
    sampleId: z.string().max(64).optional(),
    kbId: z.union([z.enum(KB_IDS), z.string().regex(PADDED_KB_ID, "unknown knowledge base")]).default("kestrelbyte"),
    mode: z.enum(["agent", "paste_all", "keyword"]).default("agent"),
    provider: z.enum(["google", "anthropic"]).optional(),
    // Model override for local evaluation only (the route rejects it on the public deployment).
    model: z.string().regex(/^[a-z0-9][a-z0-9.-]{0,63}$/, "invalid model id").optional(),
  })
  .refine((b) => (b.questions ? 1 : 0) + (b.sampleId ? 1 : 0) === 1, {
    message: "send either questions or sampleId",
  });

export type AnswerRequest = z.infer<typeof requestSchema>;

export const searchArgsSchema = z.object({ query: z.string().trim().min(1).max(200) });
export const readArgsSchema = z.object({ docId: z.string().min(1).max(40), sectionId: z.string().min(1).max(40) });

const citationSchema = z.object({
  docId: z.string().min(1).max(40),
  sectionId: z.string().min(1).max(40),
  quote: z.string().min(1).max(600),
});

export const answerArgsSchema = z.object({
  value: z.enum(["Yes", "No", "Partial"]),
  explanation: z.string().trim().min(1).max(700),
  confidence: z.enum(["high", "medium", "low"]),
  citations: z.array(citationSchema).max(5),
});

// The model may only choose these. "citation_failed" and "could_not_process" are set by code, never by the model.
export const MODEL_FLAG_CATEGORIES = ["not_covered", "contradiction", "commitment", "unclear"] as const;

export const flagArgsSchema = z.object({
  category: z.enum(MODEL_FLAG_CATEGORIES),
  reason: z.string().trim().min(1).max(500),
});

// Output of the paste-everything baseline, which answers in one JSON message instead of tool calls.
export const pasteAllOutputSchema = z.discriminatedUnion("decision", [
  answerArgsSchema.extend({ decision: z.literal("answer") }),
  flagArgsSchema.extend({ decision: z.literal("flag_for_expert") }),
]);
