import { describe, expect, it } from "vitest";
import { toCsv, type ReviewRow } from "@/lib/review";
import type { QuestionResult } from "@/types/questionnaire";

const base = { trace: [], usage: { inputTokens: 0, outputTokens: 0, modelCalls: 1, toolCalls: 1 }, latencyMs: 1 };
const answered: QuestionResult = {
  ...base,
  question: 'Do you encrypt "data", at rest?',
  decision: { decision: "answer", value: "Yes", explanation: "Yes, with AES-256.", confidence: "high", citations: [{ docId: "isp", sectionId: "isp-3", quote: "All data is encrypted." }] },
};
const flagged: QuestionResult = { ...base, question: "Will you sign our DPA?", decision: { decision: "flag_for_expert", category: "commitment", reason: "Contract term." } };

describe("toCsv", () => {
  it("exports only approved rows, escaping quotes and commas", () => {
    const rows: ReviewRow[] = [
      { result: answered, status: "approved" },
      { result: flagged, status: "pending" },
    ];
    const csv = toCsv(rows).split("\r\n");
    expect(csv[0]).toBe("question,answer,explanation,sources,decided_by");
    expect(csv[1]).toBe('"Do you encrypt ""data"", at rest?",Yes,"Yes, with AES-256.","isp/isp-3: ""All data is encrypted.""",agent');
    expect(csv).toHaveLength(3); // header, one row, trailing empty
  });

  it("uses the reviewer's answer for an edited or flagged row", () => {
    const rows: ReviewRow[] = [{ result: flagged, status: "approved", edited: { value: "No", explanation: "We use our own DPA." } }];
    expect(toCsv(rows).split("\r\n")[1]).toBe("Will you sign our DPA?,No,We use our own DPA.,,reviewer");
  });
});
