import kestrelbyte from "@/data/kb/kestrelbyte.json";
import tidemark from "@/data/kb/tidemark.json";
import samples from "@/data/samples/samples.json";
import type { KbSection, KnowledgeBase } from "@/types/questionnaire";

// Both knowledge bases are synthetic and bundled at build time, so there is no file I/O at request time.
// kestrelbyte is the demo company (and the dev eval set); tidemark backs the held-out eval set.
const KBS: Record<string, KnowledgeBase> = { kestrelbyte, tidemark };

export const KB_IDS = ["kestrelbyte", "tidemark"] as const;
export type KbId = (typeof KB_IDS)[number];
export const DEFAULT_KB: KbId = "kestrelbyte";

export function getKnowledgeBase(id: KbId = DEFAULT_KB): KnowledgeBase {
  return KBS[id];
}

export function getSection(kb: KnowledgeBase, docId: string, sectionId: string): (KbSection & { docTitle: string }) | null {
  const doc = kb.docs.find((d) => d.id === docId);
  const section = doc?.sections.find((s) => s.id === sectionId);
  return doc && section ? { ...section, docTitle: doc.title } : null;
}

export interface Sample {
  id: string;
  title: string;
  description: string;
  questions: string[];
}

export const SAMPLES: Sample[] = samples;

export function getSample(id: string): Sample | undefined {
  return SAMPLES.find((s) => s.id === id);
}
