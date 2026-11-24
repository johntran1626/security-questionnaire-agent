"use client";

import { useState } from "react";
import type { Sample } from "@/lib/knowledgeBase";
import type { ReviewRow } from "@/lib/review";
import type { AnswerResponse } from "@/types/questionnaire";
import { QuestionInput } from "./QuestionInput";
import { ReviewTable } from "./ReviewTable";

interface Props {
  samples: Sample[];
  maxQuestions: number;
  maxChars: number;
  docTitles: Record<string, string>;
}

export function Workbench({ samples, maxQuestions, maxChars, docTitles }: Props) {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ model: string; seconds: number } | null>(null);

  async function run(questions: string[]) {
    setRunning(true);
    setError(null);
    const started = Date.now();
    try {
      const res = await fetch("/api/answer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ questions }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
      const data = body as AnswerResponse;
      setRows(data.results.map((result) => ({ result, status: "pending" })));
      setMeta({ model: data.model, seconds: (Date.now() - started) / 1000 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <QuestionInput samples={samples} maxQuestions={maxQuestions} maxChars={maxChars} running={running} onRun={run} />
      {running && (
        <p role="status" className="text-sm text-slate-600">Searching the documents and drafting answers. This takes a few seconds per question...</p>
      )}
      {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {meta && !running && <p className="text-xs text-slate-500">Model: {meta.model}. Finished in {meta.seconds.toFixed(1)} s.</p>}
      {rows.length > 0 && <ReviewTable rows={rows} setRows={setRows} docTitles={docTitles} />}
    </div>
  );
}
