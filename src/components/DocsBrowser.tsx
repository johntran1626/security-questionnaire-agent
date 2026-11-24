"use client";

import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { KbDoc, KbSection } from "@/types/questionnaire";

/** One document at a time with a document list beside it; a search box filters sections across all documents. */
export function DocsBrowser({ docs }: { docs: KbDoc[] }) {
  const [docId, setDocId] = useState(docs[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<string | null>(null);

  // Citation links open /docs#<sectionId>: show the document that holds that section and scroll to it.
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      const doc = docs.find((d) => d.sections.some((s) => s.id === id));
      if (!doc) return;
      setQuery("");
      setDocId(doc.id);
      setTarget(id);
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "center" }));
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [docs]);

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () => (q ? docs.flatMap((d) => d.sections.filter((s) => `${s.heading} ${s.text}`.toLowerCase().includes(q)).map((s) => ({ doc: d, section: s }))) : []),
    [docs, q],
  );
  const doc = docs.find((d) => d.id === docId) ?? docs[0];

  const pick = (id: string) => {
    setDocId(id);
    setQuery("");
    setTarget(null);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr] lg:gap-8">
      <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
        <label className="relative block">
          <span className="sr-only">Search all documents</span>
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all documents"
            className="w-full rounded-xl border-[2.5px] border-ink bg-white py-2 pr-3 pl-9 text-sm font-medium shadow-pop-xs outline-none focus:bg-tray"
          />
        </label>

        <label className="block lg:hidden">
          <span className="sr-only">Document</span>
          <select value={doc.id} onChange={(e) => pick(e.target.value)} className="w-full rounded-xl border-[2.5px] border-ink bg-white px-3 py-2 font-display text-base shadow-pop-xs">
            {docs.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
          </select>
        </label>

        <nav aria-label="Documents" className="hidden overflow-hidden rounded-[20px] border-[2.5px] border-ink bg-white shadow-pop-sm lg:block">
          <ul className="m-0 list-none p-0">
            {docs.map((d) => {
              const active = !q && d.id === doc.id;
              return (
                <li key={d.id} className="border-t-2 border-ink first:border-t-0">
                  <button
                    type="button"
                    data-testid="doc-link"
                    aria-current={active ? "true" : undefined}
                    onClick={() => pick(d.id)}
                    className={`flex w-full items-baseline justify-between gap-2 px-3.5 py-2.5 text-left font-display text-[15px] transition ${active ? "bg-ink text-white" : "bg-white text-ink hover:bg-sky"}`}
                  >
                    <span>{d.title}</span>
                    <span className={`text-xs tabular-nums ${active ? "text-kakao" : "text-blue"}`}>{d.sections.length}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <div className="min-w-0">
        {q ? (
          <>
            <p className="m-0 mb-4 text-sm text-neutral-600">
              {matches.length} section{matches.length === 1 ? "" : "s"} match &ldquo;{query.trim()}&rdquo;
            </p>
            <div className="space-y-3">
              {matches.map(({ doc: d, section }) => (
                <SectionCard key={section.id} section={section} docTitle={d.title} query={q} />
              ))}
            </div>
          </>
        ) : (
          <>
            <h2 className="m-0 font-display text-2xl font-normal lg:text-[28px]">{doc.title}</h2>
            <p className="m-0 mt-1 mb-4 text-sm text-neutral-500">{doc.sections.length} sections · document id {doc.id}</p>
            <div className="space-y-3">
              {doc.sections.map((s) => <SectionCard key={s.id} section={s} highlighted={s.id === target} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SectionCard({ section, docTitle, query, highlighted }: { section: KbSection; docTitle?: string; query?: string; highlighted?: boolean }) {
  return (
    <section id={section.id} className={`scroll-mt-6 rounded-2xl border-2 border-ink p-4 shadow-pop-xs ${highlighted ? "bg-kakao" : "bg-white"}`}>
      <h3 className="m-0 flex flex-wrap items-baseline gap-x-2 font-display text-lg font-normal">
        {section.heading}
        <span className="rounded-md border-2 border-ink bg-sky px-1.5 font-mono text-xs">{section.id}</span>
        {docTitle && <span className="font-sans text-xs text-neutral-600">in {docTitle}</span>}
      </h3>
      <p className="m-0 mt-2 text-sm leading-relaxed text-neutral-800">{query ? <Highlight text={section.text} query={query} /> : section.text}</p>
    </section>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return <>{parts.map((p, i) => (p.toLowerCase() === query ? <mark key={i} className="rounded bg-kakao px-0.5">{p}</mark> : p))}</>;
}
