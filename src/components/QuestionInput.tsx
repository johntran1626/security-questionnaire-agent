"use client";

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

// Sample titles carry their question count in parentheses; the chip shows the count separately.
const shortTitle = (t: string) => t.replace(/\s*\(.*\)\s*$/, "");

const pill = "rounded-xl border-[2.5px] border-ink px-3 py-1.5 font-display text-sm shadow-pop-xs transition lg:text-base";

export function QuestionInput({ samples, maxQuestions, maxChars, running, onRun }: Props) {
  const [text, setText] = useState(samples[0]?.questions.join("\n") ?? "");
  const [selected, setSelected] = useState(samples[0]?.id ?? "custom");
  const questions = parseQuestions(text);
  const tooLong = questions.filter((q) => q.length > maxChars);
  const problem =
    questions.length === 0 ? "Add at least one question." :
    questions.length > maxQuestions ? `Up to ${maxQuestions} questions per run (you have ${questions.length}).` :
    tooLong.length ? `${tooLong.length} question(s) are over ${maxChars} characters.` : null;
  const description = samples.find((s) => s.id === selected)?.description;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Sample questionnaires">
        {samples.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={selected === s.id}
            onClick={() => { setSelected(s.id); setText(s.questions.join("\n")); }}
            className={`${pill} ${selected === s.id ? "bg-ink text-white" : "bg-white text-ink hover:bg-sky"}`}
          >
            {shortTitle(s.title)} <span className={selected === s.id ? "text-kakao" : "text-blue"}>{s.questions.length}</span>
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={selected === "custom"}
          onClick={() => { setSelected("custom"); setText(""); }}
          className={`${pill} ${selected === "custom" ? "bg-ink text-white" : "bg-white text-ink hover:bg-sky"}`}
        >
          Paste your own
        </button>
      </div>

      <div className="rounded-[20px] border-[2.5px] border-ink bg-white shadow-pop lg:rounded-3xl lg:shadow-pop-lg">
        <div className="px-4 pt-4 pb-2 lg:px-[22px] lg:pt-5">
          <label htmlFor="questions" className="block font-display text-lg">
            Questions <span className="font-sans text-sm text-neutral-600">one per line, edit freely</span>
          </label>
          {description && <span className="mt-0.5 block text-[13px] font-medium text-neutral-600 lg:text-sm">{description}</span>}
          <textarea
            id="questions"
            value={text}
            onChange={(e) => { setText(e.target.value); setSelected("custom"); }}
            rows={9}
            placeholder="One question per line, e.g. Do you support SSO?"
            className="ruled mt-2 block h-[252px] w-full resize-y bg-transparent bg-local p-0 text-[15px] leading-[28px] font-medium text-ink outline-none placeholder:text-[#767676] lg:text-base lg:leading-[28px]"
          />
        </div>
        <div className="flex items-center gap-3 rounded-b-[17.5px] border-t-[2.5px] border-ink bg-tray px-4 py-2.5 lg:rounded-b-[21.5px] lg:px-[22px] lg:py-3">
          <span className={`text-xs font-medium lg:text-sm ${problem ? "text-red-700" : "text-neutral-700"}`}>
            {problem ?? `${questions.length} question${questions.length === 1 ? "" : "s"}`}
          </span>
          <span className="ml-auto text-xs text-neutral-500 lg:text-sm">max {maxQuestions}, {maxChars} chars each</span>
        </div>
      </div>

      <button
        type="button"
        disabled={!!problem || running}
        onClick={() => onRun(questions)}
        className="flex h-[62px] items-center justify-center gap-2.5 rounded-[18px] border-[2.5px] border-ink bg-blue font-display text-[26px] text-white shadow-pop transition-[transform,box-shadow] hover:-translate-y-px active:translate-x-[3px] active:translate-y-[3px] active:shadow-pop-xs disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 lg:h-[70px] lg:rounded-[20px] lg:text-[30px] lg:shadow-pop-lg"
      >
        {running ? "Running..." : "Run agent"}
        {!running && (
          <svg className="size-[22px] lg:size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14" />
            <path d="m13 6 6 6-6 6" />
          </svg>
        )}
      </button>
    </div>
  );
}
