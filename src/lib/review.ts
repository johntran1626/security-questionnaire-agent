import type { AnswerValue, QuestionResult } from "@/types/questionnaire";

// Review state lives in the browser only; nothing a reviewer does is sent to the server.

export type ReviewStatus = "pending" | "approved" | "rejected";

export interface ReviewRow {
  result: QuestionResult;
  status: ReviewStatus;
  // Set when a reviewer edits the draft or writes an answer for a flagged question.
  edited?: { value: AnswerValue; explanation: string };
}

export function finalAnswer(row: ReviewRow): { value: AnswerValue | ""; explanation: string; decidedBy: "agent" | "reviewer" } {
  if (row.edited) return { ...row.edited, decidedBy: "reviewer" };
  const d = row.result.decision;
  if (d.decision === "answer") return { value: d.value, explanation: d.explanation, decidedBy: "agent" };
  return { value: "", explanation: "", decidedBy: "agent" };
}

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** CSV of approved rows only. Sources list doc/section ids and the quoted text. */
export function toCsv(rows: ReviewRow[]): string {
  const header = ["question", "answer", "explanation", "sources", "decided_by"];
  const lines = rows
    .filter((r) => r.status === "approved")
    .map((r) => {
      const a = finalAnswer(r);
      const d = r.result.decision;
      const sources = !r.edited && d.decision === "answer" ? d.citations.map((c) => `${c.docId}/${c.sectionId}: "${c.quote}"`).join(" | ") : "";
      return [r.result.question, a.value, a.explanation, sources, a.decidedBy].map(csvCell).join(",");
    });
  return [header.join(","), ...lines].join("\r\n") + "\r\n";
}
