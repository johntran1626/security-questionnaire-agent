import { describe, expect, it } from "vitest";
import { checkDecision, normalizeText } from "@/lib/citations";
import type { AnswerDecision } from "@/types/questionnaire";
import { kb, sectionByHeading } from "./helpers";

const enc = sectionByHeading("Encryption at rest", "isp");

function answer(over: Partial<AnswerDecision> = {}): AnswerDecision {
  return {
    decision: "answer",
    value: "Yes",
    explanation: "Data at rest is encrypted.",
    confidence: "high",
    citations: [{ docId: "isp", sectionId: enc.id, quote: "All customer data at rest is encrypted with AES-256." }],
    ...over,
  };
}

describe("normalizeText", () => {
  it("folds case, whitespace and curly quotes", () => {
    expect(normalizeText("  It’s   “Encrypted”\n")).toBe(`it's "encrypted"`);
  });
});

describe("checkDecision", () => {
  it("accepts a quote that appears word for word", () => {
    const r = checkDecision(kb, answer());
    expect(r.ok).toBe(true);
    expect(r.decision.decision).toBe("answer");
  });

  it("tolerates whitespace and case differences", () => {
    const r = checkDecision(kb, answer({ citations: [{ docId: "isp", sectionId: enc.id, quote: "all customer data  at rest is ENCRYPTED with AES-256" }] }));
    expect(r.ok).toBe(true);
  });

  it("turns a Yes with a made-up quote into a flag", () => {
    const r = checkDecision(kb, answer({ citations: [{ docId: "isp", sectionId: enc.id, quote: "All data is encrypted with quantum keys." }] }));
    expect(r.ok).toBe(false);
    expect(r.decision).toMatchObject({ decision: "flag_for_expert", category: "citation_failed" });
    expect(r.problems[0]).toMatch(/not found/);
  });

  it("rejects a real quote cited to the wrong section", () => {
    const other = sectionByHeading("Encryption in transit", "isp");
    const r = checkDecision(kb, answer({ citations: [{ docId: "isp", sectionId: other.id, quote: "All customer data at rest is encrypted with AES-256." }] }));
    expect(r.decision.decision).toBe("flag_for_expert");
  });

  it("rejects unknown documents and sections", () => {
    const r = checkDecision(kb, answer({ citations: [{ docId: "nope", sectionId: "x-1", quote: "All customer data at rest is encrypted." }] }));
    expect(r.problems[0]).toMatch(/unknown/);
    expect(r.decision.decision).toBe("flag_for_expert");
  });

  it("rejects quotes too short to prove anything", () => {
    const r = checkDecision(kb, answer({ citations: [{ docId: "isp", sectionId: enc.id, quote: "AES-256" }] }));
    expect(r.decision.decision).toBe("flag_for_expert");
  });

  it("turns a Partial with no citations into a flag", () => {
    const r = checkDecision(kb, answer({ value: "Partial", citations: [] }));
    expect(r.decision.decision).toBe("flag_for_expert");
  });

  it("keeps a No without citations (not a promise) but reports it", () => {
    const r = checkDecision(kb, answer({ value: "No", citations: [] }));
    expect(r.decision.decision).toBe("answer");
    expect(r.ok).toBe(false);
  });

  it("drops bad citations but keeps the answer when a valid one remains", () => {
    const good = answer().citations[0];
    const r = checkDecision(kb, answer({ citations: [good, { ...good, quote: "This sentence is invented for the test." }] }));
    expect(r.decision.decision).toBe("answer");
    expect((r.decision as AnswerDecision).citations).toHaveLength(1);
    expect(r.problems).toHaveLength(1);
  });

  it("passes flags through unchanged", () => {
    const flag = { decision: "flag_for_expert" as const, category: "commitment" as const, reason: "Asks for a contract term." };
    expect(checkDecision(kb, flag).decision).toEqual(flag);
  });
});
