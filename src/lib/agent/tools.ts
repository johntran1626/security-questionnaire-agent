import { getSection } from "@/lib/knowledgeBase";
import { readArgsSchema, searchArgsSchema } from "@/lib/schemas";
import { searchKb, type SearchHit } from "@/lib/search";
import type { KnowledgeBase } from "@/types/questionnaire";
import type { ToolSpec } from "./provider";

// Least privilege: the agent's only tools read the knowledge base. Nothing it calls can write, send or fetch, so a
// prompt-injected question can at worst produce a bad draft, which the citation check and a human review then catch.

export const LOOKUP_TOOLS = ["search_docs", "read_section"] as const;
export const DECISION_TOOLS = ["answer", "flag_for_expert"] as const;

const str = (description: string) => ({ type: "string", description });

export const TOOL_SPECS: ToolSpec[] = [
  {
    name: "search_docs",
    description:
      "Keyword search over the company's security documents. Returns up to 5 sections with a short snippet each. " +
      "Snippets are cut off: read a section before quoting it.",
    parameters: {
      type: "object",
      properties: { query: str("A few keywords, e.g. 'encryption at rest'. Try other words if nothing relevant comes back.") },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "read_section",
    description: "Return the full text of one document section, for quoting.",
    parameters: {
      type: "object",
      properties: { docId: str("Document id from a search hit, e.g. 'isp'."), sectionId: str("Section id, e.g. 'isp-3'.") },
      required: ["docId", "sectionId"],
      additionalProperties: false,
    },
  },
  {
    name: "answer",
    description:
      "Final decision: answer the question from the documents. Only use when a section you read directly addresses " +
      "the question. Every citation quote must be copied exactly from the section text.",
    parameters: {
      type: "object",
      properties: {
        value: { type: "string", enum: ["Yes", "No", "Partial"], description: "Yes = fully in place as asked. Partial = only part of it is in place. No = the documents say it is not in place." },
        explanation: str("1-3 plain sentences for the customer, based only on the cited text."),
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        citations: {
          type: "array",
          description: "1-3 supporting passages.",
          items: {
            type: "object",
            properties: { docId: str("Document id."), sectionId: str("Section id."), quote: str("One or two full sentences copied word for word.") },
            required: ["docId", "sectionId", "quote"],
            additionalProperties: false,
          },
        },
      },
      required: ["value", "explanation", "confidence", "citations"],
      additionalProperties: false,
    },
  },
  {
    name: "flag_for_expert",
    description: "Final decision: send the question to a human security expert instead of answering.",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["not_covered", "contradiction", "commitment", "unclear"],
          description:
            "not_covered = no section addresses this exact question. contradiction = sections disagree. " +
            "commitment = asks for a promise, agreement, guarantee or contract term. unclear = cannot tell what is asked.",
        },
        reason: str("One or two sentences for the expert, naming the sections you checked."),
      },
      required: ["category", "reason"],
      additionalProperties: false,
    },
  },
];

export type LookupResult =
  | { ok: true; content: string; hits?: SearchHit[] }
  | { ok: false; content: string };

export function runSearch(kb: KnowledgeBase, args: unknown): LookupResult & { query?: string } {
  const parsed = searchArgsSchema.safeParse(args);
  if (!parsed.success) return { ok: false, content: "Invalid arguments: query must be a non-empty string up to 200 characters." };
  const hits = searchKb(kb, parsed.data.query);
  const body = hits.length
    ? hits.map((h) => ({ docId: h.docId, sectionId: h.sectionId, document: h.docTitle, heading: h.heading, snippet: h.snippet }))
    : "No matching sections. Try different keywords, or flag the question if the topic is not documented.";
  return { ok: true, content: JSON.stringify(body), hits, query: parsed.data.query };
}

export function runRead(kb: KnowledgeBase, args: unknown): LookupResult & { docId?: string; sectionId?: string } {
  const parsed = readArgsSchema.safeParse(args);
  if (!parsed.success) return { ok: false, content: "Invalid arguments: docId and sectionId are required strings." };
  const { docId, sectionId } = parsed.data;
  const s = getSection(kb, docId, sectionId);
  if (!s) return { ok: false, content: `No section ${sectionId} in document ${docId}. Use ids from search results.`, docId, sectionId };
  return { ok: true, content: JSON.stringify({ docId, sectionId, document: s.docTitle, heading: s.heading, text: s.text }), docId, sectionId };
}
