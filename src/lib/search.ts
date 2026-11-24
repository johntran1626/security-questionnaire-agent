import type { KnowledgeBase } from "@/types/questionnaire";

// Keyword search with BM25 scoring, written out in full so it is easy to inspect. For a knowledge base of a few
// hundred sections this is fast and needs no vector database; see the README for when embeddings would win.

const STOPWORDS = new Set(
  ("a an and are as at be by can do does for from has have how if in is it its of on or our so than that the their " +
    "them there these they this to was we were what when where which who will with you your yours us any all " +
    "please describe").split(" "),
);

// Fold common English suffixes so "encrypted", "encryption" and "encrypts" match. Applied the same way to queries
// and documents, so an imperfect stem still matches itself.
const SUFFIXES = ["ations", "ation", "ions", "ing", "ion", "ed", "es", "s"];

function stem(word: string): string {
  for (const suf of SUFFIXES) {
    if (word.endsWith(suf) && word.length - suf.length >= 4) return word.slice(0, -suf.length);
  }
  return word;
}

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => !STOPWORDS.has(t)).map(stem);
}

export interface SearchHit {
  docId: string;
  docTitle: string;
  sectionId: string;
  heading: string;
  snippet: string;
  score: number;
}

interface IndexedSection {
  docId: string;
  docTitle: string;
  sectionId: string;
  heading: string;
  text: string;
  tf: Map<string, number>;
  length: number;
}

interface Index {
  sections: IndexedSection[];
  df: Map<string, number>;
  avgLength: number;
}

const K1 = 1.2;
const B = 0.75;
const HEADING_WEIGHT = 2; // headings are short and on-topic, so their words count double
const SNIPPET_CHARS = 120;

const cache = new WeakMap<KnowledgeBase, Index>();

function buildIndex(kb: KnowledgeBase): Index {
  const sections: IndexedSection[] = [];
  const df = new Map<string, number>();
  for (const doc of kb.docs) {
    for (const s of doc.sections) {
      const tokens = [...Array(HEADING_WEIGHT).fill(tokenize(s.heading)).flat(), ...tokenize(s.text)];
      const tf = new Map<string, number>();
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
      sections.push({ docId: doc.id, docTitle: doc.title, sectionId: s.id, heading: s.heading, text: s.text, tf, length: tokens.length });
    }
  }
  const avgLength = sections.reduce((n, s) => n + s.length, 0) / Math.max(sections.length, 1);
  return { sections, df, avgLength };
}

function getIndex(kb: KnowledgeBase): Index {
  let idx = cache.get(kb);
  if (!idx) {
    idx = buildIndex(kb);
    cache.set(kb, idx);
  }
  return idx;
}

export function searchKb(kb: KnowledgeBase, query: string, k = 5): SearchHit[] {
  const idx = getIndex(kb);
  const terms = [...new Set(tokenize(query))];
  if (terms.length === 0) return [];
  const N = idx.sections.length;
  const hits: SearchHit[] = [];
  for (const s of idx.sections) {
    let score = 0;
    for (const t of terms) {
      const f = s.tf.get(t);
      if (!f) continue;
      const df = idx.df.get(t) ?? 0;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      score += (idf * f * (K1 + 1)) / (f + K1 * (1 - B + (B * s.length) / idx.avgLength));
    }
    if (score > 0) {
      const snippet = s.text.length > SNIPPET_CHARS ? `${s.text.slice(0, SNIPPET_CHARS).trimEnd()}...` : s.text;
      hits.push({ docId: s.docId, docTitle: s.docTitle, sectionId: s.sectionId, heading: s.heading, snippet, score: Math.round(score * 1000) / 1000 });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, k);
}
