import { describe, expect, it } from "vitest";
import { searchKb, tokenize } from "@/lib/search";
import { kb, sectionByHeading } from "./helpers";

describe("tokenize", () => {
  it("lowercases, drops stopwords and folds simple suffixes", () => {
    expect(tokenize("Do you ENCRYPT the backups?")).toEqual(["encrypt", "backup"]);
    expect(tokenize("encrypted encryption encrypts")).toEqual(["encrypt", "encrypt", "encrypt"]);
  });
});

describe("searchKb", () => {
  it("ranks the matching section first", () => {
    const target = sectionByHeading("Encryption at rest", "isp");
    const hits = searchKb(kb, "Is customer data encrypted at rest?");
    expect(hits[0].sectionId).toBe(target.id);
    expect(hits[0].docId).toBe("isp");
  });

  it("finds single sign-on in the top 3 from a reworded query", () => {
    // Keyword search has no synonyms: "identity provider" also appears in the offboarding section, so the right
    // section is not always first. The agent can search again with other words.
    const hits = searchKb(kb, "Can staff log in with SAML through our identity provider?", 3);
    expect(hits.map((h) => h.heading)).toContain("Single sign-on");
  });

  it("returns scores in descending order and respects k", () => {
    const hits = searchKb(kb, "backup encryption", 3);
    expect(hits.length).toBe(3);
    for (let i = 1; i < hits.length; i++) expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score);
  });

  it("returns nothing for a query with no content words", () => {
    expect(searchKb(kb, "do you the and?")).toEqual([]);
  });

  it("returns a short snippet rather than the whole section", () => {
    const hits = searchKb(kb, "penetration test");
    expect(hits[0].snippet.length).toBeLessThanOrEqual(123);
  });
});
