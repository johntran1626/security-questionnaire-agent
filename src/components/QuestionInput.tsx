"use client";

import { Play } from "lucide-react";
import { useState } from "react";
import type { Sample } from "@/lib/knowledgeBase";

interface Props {
  samples: Sample[];
  maxQuestions: number;
  maxChars: number;
  running: boolean;
  onRun: (questions: string[]) => void;
}

export function parseQuestions(text: string): string[] {
  return text.split("\n").map((l) => l.trim()).filter(Boolean);
}

export function QuestionInput({ samples, maxQuestions, maxChars, running, onRun }: Props) {
  const [text, setText] = useState(samples[0]?.questions.join("\n") ?? "");
  const [selected, setSelected] = useState(samples[0]?.id ?? "custom");
  const questions = parseQuestions(text);
  const tooLong = questions.filter((q) => q.length > maxChars);
  const problem =
    questions.length === 0 ? "Add at least one question." :
    questions.length > maxQuestions ? `Up to ${maxQuestions} questions per run (you have ${questions.length}).` :
    tooLong.length ? `${tooLong.length} question(s) are over ${maxChars} characters.` : null;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Sample questionnaires">
        {samples.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={selected === s.id}
            onClick={() => { setSelected(s.id); setText(s.questions.join("\n")); }}
            className={`rounded-full border px-3 py-1 text-sm ${selected === s.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700 hover:border-slate-500"}`}
          >
            {s.title}
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={selected === "custom"}
          onClick={() => { setSelected("custom"); setText(""); }}
          className={`rounded-full border px-3 py-1 text-sm ${selected === "custom" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700 hover:border-slate-500"}`}
        >
          Paste your own
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">{samples.find((s) => s.id === selected)?.description ?? "One question per line."}</p>
      <label htmlFor="questions" className="sr-only">Questions, one per line</label>
      <textarea
        id="questions"
        value={text}
        onChange={(e) => { setText(e.target.value); setSelected("custom"); }}
        rows={8}
        placeholder="One question per line, e.g. Do you support SSO?"
        className="mt-3 w-full rounded-md border border-slate-300 p-3 font-mono text-sm focus:border-slate-500 focus:outline-none"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <span className={`text-xs ${problem ? "text-red-600" : "text-slate-500"}`}>
          {problem ?? `${questions.length} question${questions.length === 1 ? "" : "s"}, max ${maxQuestions} per run, ${maxChars} characters each.`}
        </span>
        <button
          type="button"
          disabled={!!problem || running}
          onClick={() => onRun(questions)}
          className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          <Play size={16} aria-hidden /> {running ? "Running..." : "Run agent"}
        </button>
      </div>
    </section>
  );
}
