import { describe, expect, it } from "vitest";
import { selectEntries, SYSTEM_LABEL } from "@/lib/report";

function entry(set: string, system: string, model: string, extra: Record<string, unknown> = {}) {
  return { set, system, model, limit: null, scale: 1, run_at: "2026-01-01 00:00", summary: {}, ...extra };
}

const RESULTS = {
  a: entry("dev", "agent", "claude-haiku-5-5"),
  b: entry("dev", "agent", "claude-haiku-5-5", { scale: 10 }),
  c: entry("dev", "paste_all", "claude-haiku-5-5"),
  d: entry("dev", "paste_all+check", "claude-haiku-5-5"),
  e: entry("dev", "keyword", "keyword-search"),
  f: entry("dev", "always_flag", "none"),
  g: entry("dev", "agent", "claude-haiku-5-5", { limit: 3 }),
  h: entry("heldout", "agent", "claude-haiku-5-5"),
  i: entry("dev", "agent", "claude-sonnet-5-5"),
  j: { ...entry("dev", "paste_all", "claude-sonnet-5-5"), scale: undefined },
  k: entry("heldout", "agent", "claude-haiku-5-5", { subset: "audited" }),
};

describe("selectEntries", () => {
  it("keeps only full runs on the unpadded knowledge base, one row per system and model", () => {
    const rows = selectEntries(RESULTS, "dev");
    expect(rows.map((r) => `${r.system}/${r.model}`)).toEqual([
      "agent/claude-haiku-5-5",
      "agent/claude-sonnet-5-5",
      "paste_all/claude-haiku-5-5",
      "paste_all/claude-sonnet-5-5",
      "keyword/keyword-search",
      "always_flag/none",
    ]);
  });

  it("filters by set", () => {
    expect(selectEntries(RESULTS, "heldout").map((r) => r.system)).toEqual(["agent"]);
  });

  it("keeps the audited subset apart from the headline rows", () => {
    expect(selectEntries(RESULTS, "heldout")).toHaveLength(1);
    expect(selectEntries(RESULTS, "heldout", "audited").map((r) => r.subset)).toEqual(["audited"]);
  });

  it("has a label for every system it returns", () => {
    for (const r of selectEntries(RESULTS, "dev")) expect(SYSTEM_LABEL[r.system]).toBeTruthy();
  });
});
