import type { Citation } from "@/types/questionnaire";

export function CitationView({ citations, docTitles }: { citations: Citation[]; docTitles: Record<string, string> }) {
  if (citations.length === 0) return null;
  return (
    <div className="space-y-2">
      {citations.map((c, i) => (
        <figure key={i} className="border-l-2 border-emerald-500 bg-emerald-50/60 py-1 pl-3 pr-2">
          <blockquote className="text-sm text-slate-800">&ldquo;{c.quote}&rdquo;</blockquote>
          <figcaption className="mt-1 text-xs text-slate-500">
            <a href={`/docs#${c.sectionId}`} target="_blank" rel="noreferrer" className="underline decoration-slate-300 hover:text-slate-800">
              {docTitles[c.docId] ?? c.docId}, section {c.sectionId}
            </a>
            {" "}(verified word for word)
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
