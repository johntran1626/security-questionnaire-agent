"use client";

import { Check, Download, Pencil, X } from "lucide-react";
import { useState } from "react";
import { toCsv, type ReviewRow } from "@/lib/review";
import type { AnswerValue, FlagCategory } from "@/types/questionnaire";
import { AgentTrace } from "./AgentTrace";
import { CitationView } from "./CitationView";

const FLAG_LABEL: Record<FlagCategory, string> = {
  not_covered: "Not in docs",
  contradiction: "Docs disagree",
  commitment: "Asks for a commitment",
  unclear: "Unclear question",
  citation_failed: "Source not verified",
  could_not_process: "Could not process",
};

const VALUE_STYLE: Record<AnswerValue, string> = {
  Yes: "bg-mint",
  Partial: "bg-kakao",
  No: "bg-white",
};

function Chip({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-lg border-2 border-ink px-2 py-0.5 font-display text-sm whitespace-nowrap ${className}`}>{children}</span>;
}

function StatusChip({ row }: { row: ReviewRow }) {
  if (row.edited) return <Chip className={VALUE_STYLE[row.edited.value]}>{row.edited.value} (edited)</Chip>;
  const d = row.result.decision;
  if (d.decision === "answer") return <Chip className={VALUE_STYLE[d.value]}>{d.value}</Chip>;
  return <Chip className="bg-blush">Flagged: {FLAG_LABEL[d.category]}</Chip>;
}

/** Caption above each part of a card, so a first-time reader knows what each box is. */
function Part({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="m-0 mb-1 font-display text-sm text-blue">{label}</p>
      {children}
    </div>
  );
}

const smallBtn = "inline-flex items-center gap-1.5 rounded-xl border-2 border-ink px-3 py-1 font-display text-sm shadow-pop-xs transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-40";

function Editor({ row, onSave, onCancel }: { row: ReviewRow; onSave: (v: AnswerValue, e: string) => void; onCancel: () => void }) {
  const d = row.result.decision;
  const [value, setValue] = useState<AnswerValue>(row.edited?.value ?? (d.decision === "answer" ? d.value : "No"));
  const [text, setText] = useState(row.edited?.explanation ?? (d.decision === "answer" ? d.explanation : ""));
  return (
    <div className="space-y-3 rounded-2xl border-2 border-ink bg-tray p-3">
      <div role="radiogroup" aria-label="Answer" className="inline-flex overflow-hidden rounded-xl border-2 border-ink">
        {(["Yes", "Partial", "No"] as AnswerValue[]).map((v, i) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => setValue(v)}
            className={`px-3 py-1 font-display text-sm ${i > 0 ? "border-l-2 border-ink" : ""} ${value === v ? "bg-ink text-white" : "bg-white hover:bg-sky"}`}
          >
            {v}
          </button>
        ))}
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} aria-label="Answer text" className="block w-full rounded-xl border-2 border-ink bg-white p-2.5 text-sm outline-none focus:shadow-pop-xs" />
      <div className="flex gap-2">
        <button type="button" disabled={!text.trim()} onClick={() => onSave(value, text.trim())} className={`${smallBtn} bg-blue text-white`}>Save and approve</button>
        <button type="button" onClick={onCancel} className={`${smallBtn} bg-white hover:bg-sky`}>Cancel</button>
      </div>
    </div>
  );
}

interface TableProps {
  rows: ReviewRow[];
  setRows: (r: ReviewRow[]) => void;
  docTitles: Record<string, string>;
  meta?: { model: string; seconds: number } | null;
}

export function ReviewTable({ rows, setRows, docTitles, meta }: TableProps) {
  const [editing, setEditing] = useState<number | null>(null);
  const update = (i: number, patch: Partial<ReviewRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const answered = rows.filter((r) => r.result.decision.decision === "answer").length;
  const approved = rows.filter((r) => r.status === "approved").length;

  const download = () => {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "questionnaire-answers.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="m-0 text-sm text-neutral-700" data-testid="summary">
          <strong>{answered}</strong> drafted, <strong>{rows.length - answered}</strong> flagged for an expert, <strong>{approved}</strong> approved.
          {meta && <span className="text-neutral-500"> {meta.model}, {meta.seconds.toFixed(1)} s.</span>}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setRows(rows.map((r) => (r.result.decision.decision === "answer" && r.status === "pending" ? { ...r, status: "approved" } : r)))}
            className="rounded-xl border-[2.5px] border-ink bg-white px-3.5 py-2 font-display text-base shadow-pop-sm transition hover:-translate-y-px hover:bg-sky"
          >
            Approve all drafts
          </button>
          <button
            type="button"
            disabled={approved === 0}
            onClick={download}
            className="inline-flex items-center gap-2 rounded-xl border-[2.5px] border-ink bg-blue px-3.5 py-2 font-display text-base text-white shadow-pop-sm transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            <Download size={18} strokeWidth={2.5} aria-hidden /> Export CSV ({approved})
          </button>
        </div>
      </div>

      <ul className="m-0 list-none space-y-4 p-0">
        {rows.map((row, i) => {
          const d = row.result.decision;
          const isAnswer = d.decision === "answer";
          const tone = row.status === "approved" ? "bg-[#f1fcf5]" : row.status === "rejected" ? "bg-neutral-50 opacity-60" : "bg-white";
          return (
            <li key={i} data-testid="review-row" className={`rounded-[20px] border-[2.5px] border-ink p-4 shadow-pop-sm lg:p-5 ${tone}`}>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-6">
                <div className="min-w-0 flex-1 space-y-3">
                  <p className="m-0 text-base font-semibold lg:text-[17px]">
                    <span className="mr-1.5 font-display text-blue">{i + 1}.</span>
                    {row.result.question}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip row={row} />
                    {isAnswer && !row.edited && <span className="text-xs font-medium text-neutral-600">confidence: {d.confidence}</span>}
                    {row.status !== "pending" && (
                      <span className={`text-xs font-semibold uppercase tracking-wide ${row.status === "approved" ? "text-green-700" : "text-red-700"}`}>{row.status}</span>
                    )}
                  </div>
                  {editing === i ? (
                    <Editor row={row} onCancel={() => setEditing(null)} onSave={(value, explanation) => { update(i, { edited: { value, explanation }, status: "approved" }); setEditing(null); }} />
                  ) : row.edited ? (
                    <Part label="Your answer"><p className="m-0 text-sm leading-relaxed text-neutral-800">{row.edited.explanation}</p></Part>
                  ) : isAnswer ? (
                    <>
                      <Part label="Draft answer"><p className="m-0 text-sm leading-relaxed text-neutral-800">{d.explanation}</p></Part>
                      {d.citations.length > 0 && <Part label="Source from the docs"><CitationView citations={d.citations} docTitles={docTitles} /></Part>}
                    </>
                  ) : (
                    <Part label="Why it needs an expert"><p className="m-0 text-sm leading-relaxed text-neutral-800">{d.reason}</p></Part>
                  )}
                  <AgentTrace trace={row.result.trace} usage={row.result.usage} latencyMs={row.result.latencyMs} />
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {(isAnswer || row.edited) && (
                    <button type="button" onClick={() => update(i, { status: "approved" })} className={`${smallBtn} ${row.status === "approved" ? "bg-mint" : "bg-white hover:bg-mint"}`}>
                      <Check size={16} strokeWidth={3} aria-hidden /> Approve
                    </button>
                  )}
                  <button type="button" onClick={() => setEditing(i)} className={`${smallBtn} bg-white hover:bg-sky`}>
                    <Pencil size={14} strokeWidth={2.5} aria-hidden /> {isAnswer || row.edited ? "Edit" : "Write answer"}
                  </button>
                  <button type="button" onClick={() => update(i, { status: "rejected" })} className={`${smallBtn} ${row.status === "rejected" ? "bg-blush" : "bg-white hover:bg-blush"}`}>
                    <X size={16} strokeWidth={3} aria-hidden /> Reject
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
