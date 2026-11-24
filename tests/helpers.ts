import { getKnowledgeBase } from "@/lib/knowledgeBase";

export const kb = getKnowledgeBase("kestrelbyte");

export function sectionByHeading(heading: string, docId?: string) {
  for (const doc of kb.docs) {
    if (docId && doc.id !== docId) continue;
    const s = doc.sections.find((x) => x.heading === heading);
    if (s) return { docId: doc.id, ...s };
  }
  throw new Error(`no section ${heading}`);
}
