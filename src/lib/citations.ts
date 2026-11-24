import { getSection } from "@/lib/knowledgeBase";
import type { AnswerDecision, Citation, Decision, KnowledgeBase } from "@/types/questionnaire";

// The model proposes, code checks. Every quote must appear word for word in the section it cites. A Yes or Partial
// without at least one valid citation becomes a flag, because an unsupported "Yes" is a false promise in a contract.
// Whether a valid quote actually *supports* the answer is a judgment call; that is measured in the eval instead.

const MIN_QUOTE_CHARS = 15; // shorter quotes ("AES-256", "yes") match almost anywhere and prove nothing

export function normalizeText(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function stripEdgePunctuation(s: string): string {
  return s.replace(/^[\s"'.,;:]+|[\s"'.,;:]+$/g, "");
}

export function checkCitation(kb: KnowledgeBase, c: Citation): string | null {
  const section = getSection(kb, c.docId, c.sectionId);
  if (!section) return `unknown section ${c.docId}/${c.sectionId}`;
  const quote = stripEdgePunctuation(normalizeText(c.quote));
  if (quote.length < MIN_QUOTE_CHARS) return `quote too short in ${c.sectionId}`;
  if (!normalizeText(section.text).includes(quote)) return `quote not found in ${c.sectionId}`;
  return null;
}

export interface CheckResult {
  ok: boolean;
  problems: string[];
  decision: Decision;
  downgraded: boolean;
}

export function checkDecision(kb: KnowledgeBase, decision: Decision): CheckResult {
  if (decision.decision === "flag_for_expert") return { ok: true, problems: [], decision, downgraded: false };

  const problems: string[] = [];
  const valid: Citation[] = [];
  for (const c of decision.citations) {
    const p = checkCitation(kb, c);
    if (p) problems.push(p);
    else valid.push(c);
  }

  if (valid.length === 0) {
    if (decision.value === "No") {
      // A "No" isn't a promise, so it stands, but the missing source is reported.
      problems.push("no valid citation");
      return { ok: false, problems, decision: { ...decision, citations: [] }, downgraded: false };
    }
    return {
      ok: false,
      problems: problems.length ? problems : ["no citation given"],
      decision: {
        decision: "flag_for_expert",
        category: "citation_failed",
        reason: `The draft answer was "${decision.value}", but no quote could be verified in the documents, so it needs a human check.`,
      },
      downgraded: true,
    };
  }

  const checked: AnswerDecision = { ...decision, citations: valid };
  return { ok: problems.length === 0, problems, decision: checked, downgraded: false };
}
