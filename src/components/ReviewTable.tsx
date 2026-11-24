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
  Yes: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Partial: "bg-amber-100 text-amber-800 border-amber-200",
  No: "bg-slate-200 text-slate-800 border-slate-300",
};

function Chip({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}>{children}</span>;
}

function StatusChip({ row }: { row: ReviewRow }) {
  if (row.edited) return <Chip className={VALUE_STYLE[row.edited.value]}>{row.edited.value} (edited)</Chip>;
  const d = row.result.decision;
  if (d.decision === "answer") return <Chip className={VALUE_STYLE[d.value]}>{d.value}</Chip>;
  return <Chip className="border-violet-200 bg-violet-100 text-violet-800">Flag: {FLAG_LABEL[d.category]}</Chip>;
}

function Editor({ row, onSave, onCancel }: { row: ReviewRow; onSave: (v: AnswerValue, e: string) => void; onCancel: () => void }) {
  const d = row.result.decision;
  const [value, setValue] = useState<AnswerValue>(row.edited?.value ?? (d.decision === "answer" ? d.value : "No"));
  const [text, setText] = useState(row.edited?.explanation ?? (d.decision === "answer" ? d.explanation : ""));
  return (
    <div className="space-y-2 rounded-md border border-slate-300 bg-slate-50 p-2">
      <div className="flex gap-2">
        {(["Yes", "Partial", "No"] as AnswerValue[]).map((v) => (
          <button key={v} type="button" onClick={() => setValue(v)} className={`rounded border px-2 py-0.5 text-xs ${value === v ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white"}`}>{v}</button>
        ))}
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} aria-label="Answer text" className="w-full rounded border border-slate-300 p-2 text-sm" />
      <div className="flex gap-2">
        <button type="button" disabled={!text.trim()} onClick={() => onSave(value, text.trim())} className="rounded bg-slate-900 px-3 py-1 text-xs text-white disabled:bg-slate-400">Save and approve</button>
        <button type="button" onClick={onCancel} className="rounded border border-slate-300 px-3 py-1 text-xs">Cancel</button>
      </div>
    </div>
  );
}

export function ReviewTable({ rows, setRows, docTitles }: { rows: ReviewRow[]; setRows: (r: ReviewRow[]) => void; docTitles: Record<string, string> }) {
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
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-700" data-testid="summary">
          <strong>{answered}</strong> drafted, <strong>{rows.length - answered}</strong> flagged for an expert, <strong>{approved}</strong> approved.
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setRows(rows.map((r) => (r.result.decision.decision === "answer" && r.status === "pending" ? { ...r, status: "approved" } : r)))} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:border-slate-500">
            Approve all drafts
          </button>
          <button type="button" disabled={approved === 0} onClick={download} className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white disabled:bg-slate-400">
            <Download size={14} aria-hidden /> Export CSV ({approved})
          </button>
        </div>
      </div>

      <ul className="space-y-3">
        {rows.map((row, i) => {
          const d = row.result.decision;
          return (
            <li key={i} data-testid="review-row" className={`rounded-lg border bg-white p-4 shadow-sm ${row.status === "approved" ? "border-emerald-300" : row.status === "rejected" ? "border-red-200 opacity-60" : "border-slate-200"}`}>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="font-medium text-slate-900">{i + 1}. {row.result.question}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip row={row} />
                    {d.decision === "answer" && !row.edited && <span className="text-xs text-slate-500">confidence: {d.confidence}</span>}
                    {row.status !== "pending" && <span className={`text-xs font-medium ${row.status === "approved" ? "text-emerald-700" : "text-red-700"}`}>{row.status}</span>}
                  </div>
                  {editing === i ? (
                    <Editor row={row} onCancel={() => setEditing(null)} onSave={(value, explanation) => { update(i, { edited: { value, explanation }, status: "approved" }); setEditing(null); }} />
                  ) : row.edited ? (
                    <p className="text-sm text-slate-700">{row.edited.explanation}</p>
                  ) : d.decision === "answer" ? (
                    <>
                      <p className="text-sm text-slate-700">{d.explanation}</p>
                      <CitationView citations={d.citations} docTitles={docTitles} />
                    </>
                  ) : (
                    <p className="text-sm text-slate-700">{d.reason}</p>
                  )}
                  <AgentTrace trace={row.result.trace} usage={row.result.usage} latencyMs={row.result.latencyMs} />
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" aria-label="Approve" title="Approve" disabled={d.decision !== "answer" && !row.edited} onClick={() => update(i, { status: "approved" })} className="rounded-md border border-slate-300 p-1.5 text-emerald-700 hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-30"><Check size={16} /></button>
                  <button type="button" aria-label={d.decision === "answer" ? "Edit" : "Write answer"} title={d.decision === "answer" ? "Edit" : "Write answer"} onClick={() => setEditing(i)} className="rounded-md border border-slate-300 p-1.5 text-slate-700 hover:border-slate-500"><Pencil size={16} /></button>
                  <button type="button" aria-label="Reject" title="Reject" onClick={() => update(i, { status: "rejected" })} className="rounded-md border border-slate-300 p-1.5 text-red-700 hover:border-red-500"><X size={16} /></button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
