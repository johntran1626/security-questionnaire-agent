import { describe, expect, it } from "vitest";
import { answerArgsSchema, flagArgsSchema, requestSchema, searchArgsSchema } from "@/lib/schemas";

describe("tool argument schemas", () => {
  it("accepts a well-formed answer", () => {
    const r = answerArgsSchema.safeParse({
      value: "Yes", explanation: "Encrypted.", confidence: "high",
      citations: [{ docId: "isp", sectionId: "isp-3", quote: "All customer data at rest is encrypted." }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown value", () => {
    expect(answerArgsSchema.safeParse({ value: "Maybe", explanation: "x", confidence: "high", citations: [] }).success).toBe(false);
  });

  it("rejects a flag with an unknown category or empty reason", () => {
    expect(flagArgsSchema.safeParse({ category: "other", reason: "x" }).success).toBe(false);
    expect(flagArgsSchema.safeParse({ category: "not_covered", reason: "" }).success).toBe(false);
  });

  it("does not let the model pick the internal flag categories", () => {
    expect(flagArgsSchema.safeParse({ category: "citation_failed", reason: "x" }).success).toBe(false);
  });

  it("bounds search query length", () => {
    expect(searchArgsSchema.safeParse({ query: "a".repeat(201) }).success).toBe(false);
  });
});

describe("request schema", () => {
  it("accepts questions or a sample id", () => {
    expect(requestSchema.safeParse({ questions: ["Do you have SSO?"] }).success).toBe(true);
    expect(requestSchema.safeParse({ sampleId: "quick-review" }).success).toBe(true);
  });

  it("rejects more than 50 questions, over-long questions and empty input", () => {
    expect(requestSchema.safeParse({ questions: Array(51).fill("q?") }).success).toBe(false);
    expect(requestSchema.safeParse({ questions: ["x".repeat(301)] }).success).toBe(false);
    expect(requestSchema.safeParse({ questions: ["   "] }).success).toBe(false);
    expect(requestSchema.safeParse({}).success).toBe(false);
  });

  it("rejects unknown knowledge bases and modes", () => {
    expect(requestSchema.safeParse({ questions: ["q?"], kbId: "acme" }).success).toBe(false);
    expect(requestSchema.safeParse({ questions: ["q?"], mode: "yolo" }).success).toBe(false);
  });
});
