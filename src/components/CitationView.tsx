import { ShieldCheck } from "lucide-react";
import type { Citation } from "@/types/questionnaire";

export function CitationView({ citations, docTitles }: { citations: Citation[]; docTitles: Record<string, string> }) {
  if (citations.length === 0) return null;
  return (
    <div className="space-y-2">
      {citations.map((c, i) => (
        <figure key={i} className="m-0 rounded-xl border-2 border-ink bg-tray px-3 py-2">
          <blockquote className="m-0 text-sm leading-relaxed text-neutral-900">&ldquo;{c.quote}&rdquo;</blockquote>
          <figcaption className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-600">
            <a href={`/docs#${c.sectionId}`} target="_blank" rel="noreferrer" className="font-semibold text-blue underline decoration-2 underline-offset-2">
              {docTitles[c.docId] ?? c.docId}, section {c.sectionId}
            </a>
            <span className="inline-flex items-center gap-1 rounded-md bg-mint px-1.5 py-0.5 font-medium text-neutral-800">
              <ShieldCheck size={13} strokeWidth={2.5} aria-hidden /> verified word for word
            </span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
