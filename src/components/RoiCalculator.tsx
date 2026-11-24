"use client";

import { useState } from "react";

interface Props {
  safeAutomation: number; // share of questions answered correctly with a valid source
  answered: number; // share of questions the system drafted (correct or not)
  costPerQuestion: number;
  source: string;
}

function Field({ label, value, onChange, step = 1, suffix }: { label: string; value: number; onChange: (v: number) => void; step?: number; suffix?: string }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="font-medium text-neutral-800">{label}</span>
      <span className="flex items-center gap-1">
        <input type="number" min={0} step={step} value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value)))} className="w-24 rounded-lg border-2 border-ink bg-white px-2 py-1 text-right font-medium outline-none focus:shadow-pop-xs" />
        <span className="w-10 text-xs text-neutral-500">{suffix}</span>
      </span>
    </label>
  );
}

export function RoiCalculator({ safeAutomation, answered, costPerQuestion, source }: Props) {
  const [perMonth, setPerMonth] = useState(8);
  const [questions, setQuestions] = useState(120);
  const [manualMin, setManualMin] = useState(6);
  const [reviewMin, setReviewMin] = useState(1.5);
  const [hourly, setHourly] = useState(90);
  const [auto, setAuto] = useState(Math.round(safeAutomation * 100));

  const a = auto / 100;
  const wrongDrafts = Math.max(0, answered - safeAutomation); // drafted but wrong: reviewed, then redone by hand
  const total = perMonth * questions;
  const manualHours = (total * manualMin) / 60;
  const agentHours = (total * (a * reviewMin + wrongDrafts * (reviewMin + manualMin) + Math.max(0, 1 - a - wrongDrafts) * manualMin)) / 60;
  const saved = manualHours - agentHours;
  const apiCost = total * costPerQuestion;
  const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <div className="grid gap-6 rounded-[20px] border-[2.5px] border-ink bg-white p-5 shadow-pop-sm md:grid-cols-2 lg:p-6">
      <div className="space-y-2.5">
        <Field label="Questionnaires per month" value={perMonth} onChange={setPerMonth} />
        <Field label="Questions per questionnaire" value={questions} onChange={setQuestions} />
        <Field label="Minutes per question by hand" value={manualMin} onChange={setManualMin} step={0.5} suffix="min" />
        <Field label="Minutes to review a draft" value={reviewMin} onChange={setReviewMin} step={0.5} suffix="min" />
        <Field label="Loaded cost per hour" value={hourly} onChange={setHourly} suffix="USD" />
        <Field label="Safe automation rate" value={auto} onChange={(v) => setAuto(Math.min(100, v))} suffix="%" />
        <p className="m-0 pt-1 text-xs leading-relaxed text-neutral-500">
          Defaults are assumptions to replace with a customer&apos;s own numbers. Automation rate defaults to {source}. Wrong drafts
          ({(wrongDrafts * 100).toFixed(0)}% of questions) are charged review time plus doing them by hand.
        </p>
      </div>
      <dl className="m-0 grid grid-cols-2 gap-3 self-start">
        {[
          ["Hours by hand / month", manualHours.toFixed(0)],
          ["Hours with agent / month", agentHours.toFixed(0)],
          ["Hours saved / month", saved.toFixed(0)],
          ["Value of time saved", money(saved * hourly)],
          ["Model API cost / month", costPerQuestion ? money(apiCost) : "n/a"],
          ["Net / month", money(saved * hourly - apiCost)],
        ].map(([k, v], i, all) => (
          <div key={k} className={`rounded-2xl border-2 border-ink p-3 ${i === all.length - 1 ? "bg-kakao" : "bg-tray"}`}>
            <dt className="text-xs font-medium text-neutral-600">{k}</dt>
            <dd className="m-0 font-display text-xl lg:text-2xl">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
