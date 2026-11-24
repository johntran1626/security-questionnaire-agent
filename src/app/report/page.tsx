import { RoiCalculator } from "@/components/RoiCalculator";
import { evalEntries, SYSTEM_LABEL, type EvalEntry, type Rate } from "@/lib/report";

export const metadata = { title: "Pilot report | Security Questionnaire Agent" };

function pct(r: Rate) {
  return r.total ? `${r.count}/${r.total} (${Math.round(r.rate * 100)}%)` : "n/a";
}

function ci(r: Rate) {
  return r.total ? `${Math.round(r.ci95[0] * 100)}–${Math.round(r.ci95[1] * 100)}%` : "";
}

function ResultsTable({ entries }: { entries: EvalEntry[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="min-w-[860px] w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="p-3">System</th>
            <th className="p-3">Safe automation</th>
            <th className="p-3">False promises</th>
            <th className="p-3">Over-flagging</th>
            <th className="p-3">Injections resisted</th>
            <th className="p-3">Latency p50</th>
            <th className="p-3">Cost / question</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={`${e.system}-${e.model}`} className="border-t border-slate-100 align-top">
              <td className="p-3"><div className="font-medium">{SYSTEM_LABEL[e.system]}</div><div className="text-xs text-slate-500">{e.model}</div></td>
              <td className="p-3">{pct(e.summary.safe_automation)}<div className="text-xs text-slate-500">{ci(e.summary.safe_automation)}</div></td>
              <td className="p-3">{pct(e.summary.false_promises)}<div className="text-xs text-slate-500">upper bound {Math.round(e.summary.false_promises.ci95[1] * 1000) / 10}%</div></td>
              <td className="p-3">{pct(e.summary.over_flagging)}</td>
              <td className="p-3">{pct(e.summary.injection_no_false_promise)}</td>
              <td className="p-3">{e.summary.latency_p50_s}s</td>
              <td className="p-3">{e.summary.cost_usd_per_question == null ? "n/a" : `$${e.summary.cost_usd_per_question.toFixed(4)}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const LIMITS = [
  "Synthetic data. The documents and questions were generated from a grid of controls and states, so labels are known by construction, not checked by a real security team. Real questionnaires are messier.",
  "Labels can be imperfect. A grid label says whether the control is in place; a few reworded questions ask about a narrower detail than the label covers.",
  "It only knows the documents. If the docs are out of date, the answers are too. A real rollout needs an owner for the knowledge base.",
  "The citation check proves a quote exists, not that it supports the answer. Support is measured in the eval, not guaranteed at run time.",
  "Small samples. Every rate has a wide interval; zero false promises in about 150 questions still allows a true rate of a few percent.",
  "Keyword search has no synonyms. The agent compensates by searching again with other words; a large knowledge base would likely need embeddings or hybrid search.",
];

export default function ReportPage() {
  const heldout = evalEntries("heldout");
  const dev = evalEntries("dev");
  const agent = heldout.find((e) => e.system === "agent") ?? dev.find((e) => e.system === "agent");

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Pilot report</h1>
        <p className="max-w-3xl text-sm text-slate-600">
          Goal: take routine security questions off the team without making false promises. Success metric: <strong>safe automation</strong>,
          the share of questions answered with the correct value and a verified quote from the correct section. Safety metric, target zero:
          <strong> false promises</strong>, answers that claim more than the documents support, or that answer a request for a commitment.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Held-out results</h2>
        <p className="max-w-3xl text-sm text-slate-600">
          A second fictional company with different documents and different question writers, generated once and frozen before any tuning.
        </p>
        {heldout.length ? <ResultsTable entries={heldout} /> : <p className="text-sm text-slate-500">Not run yet.</p>}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Dev results (used for tuning)</h2>
        {dev.length ? <ResultsTable entries={dev} /> : <p className="text-sm text-slate-500">Not run yet.</p>}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">ROI estimate</h2>
        <RoiCalculator
          safeAutomation={agent?.summary.safe_automation.rate ?? 0.5}
          answered={agent?.summary.answered?.rate ?? 0.6}
          costPerQuestion={agent?.summary.cost_usd_per_question ?? 0}
          source={agent ? `the agent's ${agent.set} result` : "a placeholder until the eval is run"}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Limitations</h2>
        <ul className="max-w-3xl list-disc space-y-1 pl-5 text-sm text-slate-700">
          {LIMITS.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </section>
    </div>
  );
}
