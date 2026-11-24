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
  kbName: string;
  docTitles: Record<string, string>;
}

const STEPS = [
  ["Search", "For each question the agent searches the security docs and reads the matching sections."],
  ["Draft or flag", "It drafts Yes / No / Partial with a quote, or flags it: not covered, docs disagree, or asks for a promise."],
  ["Check and review", "Code checks every quote word for word. You approve, edit or reject each row, then export CSV."],
] as const;

function StepHeading({ n, id, title, hint }: { n: number; id?: string; title: string; hint: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full border-[2.5px] border-ink bg-kakao font-display text-lg">{n}</span>
      <div>
        <h2 id={id} className="m-0 font-display text-2xl font-normal lg:text-[28px]">{title}</h2>
        <p className="m-0 mt-1 text-[15px] leading-relaxed text-neutral-700">{hint}</p>
      </div>
    </div>
  );
}

export function Workbench({ samples, maxQuestions, maxChars, kbName, docTitles }: Props) {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [running, setRunning] = useState(0); // number of questions in flight; 0 when idle
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ model: string; seconds: number } | null>(null);

  async function run(questions: string[]) {
    setRunning(questions.length);
    setError(null);
    const started = Date.now();
    try {
      const res = await fetch("/api/answer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ questions }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
      const data = body as AnswerResponse;
      setRows(data.results.map((result) => ({ result, status: "pending" })));
      setMeta({ model: data.model, seconds: (Date.now() - started) / 1000 });
      requestAnimationFrame(() => document.getElementById("review")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setRunning(0);
    }
  }

  return (
    <div className="mx-auto max-w-[920px] space-y-12">
      <h1 className="sr-only">Security questionnaire agent</h1>

      <section className="space-y-5">
        <StepHeading
          n={1}
          title="Choose the questions"
          hint={<>Pick a sample or paste your own, one per line. The agent answers only from the security documents of {kbName}, a fictional software company.</>}
        />
        <QuestionInput samples={samples} maxQuestions={maxQuestions} maxChars={maxChars} running={running > 0} onRun={run} />
        {error && <p role="alert" className="m-0 rounded-2xl border-[2.5px] border-ink bg-blush px-4 py-3 text-sm font-medium shadow-pop-xs">{error}</p>}
      </section>

      {running > 0 ? (
        <div role="status" className="flex items-center gap-3 rounded-[20px] border-[2.5px] border-ink bg-kakao px-5 py-5 font-display text-xl shadow-pop-sm">
          <span aria-hidden="true" className="spin size-6 shrink-0 rounded-full border-[3px] border-ink border-t-transparent" />
          Reading the docs for {running} question{running === 1 ? "" : "s"}... a few seconds each.
        </div>
      ) : rows.length > 0 ? (
        <section id="review" className="scroll-mt-6 space-y-5" aria-labelledby="review-heading">
          <StepHeading n={2} id="review-heading" title="Review the drafts" hint="Each card is one question. Check the answer against its source, then approve, edit or reject it." />
          <ReviewTable rows={rows} setRows={setRows} docTitles={docTitles} meta={meta} />
        </section>
      ) : (
        <section aria-labelledby="how" className="space-y-5">
          <h2 id="how" className="m-0 text-center font-display text-2xl font-normal lg:text-3xl">How it works</h2>
          <ol className="m-0 grid list-none gap-4 p-0 md:grid-cols-3">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="rounded-[20px] border-[2.5px] border-ink bg-tray p-5 shadow-pop-sm">
                <span className="grid size-9 place-items-center rounded-full border-[2.5px] border-ink bg-kakao font-display text-lg">{i + 1}</span>
                <h3 className="mt-3 mb-1 font-display text-xl font-normal">{title}</h3>
                <p className="m-0 text-sm leading-relaxed text-neutral-700">{body}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
