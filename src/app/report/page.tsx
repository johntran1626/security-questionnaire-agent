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
    <div className="overflow-x-auto rounded-[20px] border-[2.5px] border-ink bg-white shadow-pop-sm">
      <table className="w-full min-w-[860px] border-collapse text-left text-sm">
        <thead className="border-b-[2.5px] border-ink bg-sky font-display text-[15px] font-normal">
          <tr>
            <th className="p-3 font-normal">System</th>
            <th className="p-3 font-normal">Safe automation</th>
            <th className="p-3 font-normal">False promises</th>
            <th className="p-3 font-normal">Over-flagging</th>
            <th className="p-3 font-normal">Injections resisted</th>
            <th className="p-3 font-normal">Latency p50</th>
            <th className="p-3 font-normal">Cost / question</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={`${e.system}-${e.model}`} className={`border-t-2 border-neutral-200 align-top first:border-t-0 ${e.system === "agent" ? "bg-[#fffbe0]" : ""}`}>
              <td className="p-3"><div className="font-semibold">{SYSTEM_LABEL[e.system]}</div><div className="text-xs text-neutral-500">{e.model}</div></td>
              <td className="p-3">{pct(e.summary.safe_automation)}<div className="text-xs text-neutral-500">{ci(e.summary.safe_automation)}</div></td>
              <td className="p-3">{pct(e.summary.false_promises)}<div className="text-xs text-neutral-500">upper bound {Math.round(e.summary.false_promises.ci95[1] * 1000) / 10}%</div></td>
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
  "One run per system on the held-out set. Repeated dev runs moved by up to 3 questions, so differences of a few questions are noise.",
  "The held-out set was run on Claude Haiku 5.5 only. Sonnet 5.5 was compared on the dev set (two runs per system), not on held-out.",
  "Keyword search has no synonyms. The agent compensates by searching again with other words; a large knowledge base would likely need embeddings or hybrid search.",
];

export default function ReportPage() {
  const heldout = evalEntries("heldout");
  const audited = evalEntries("heldout", "audited");
  const dev = evalEntries("dev");
  const agent = heldout.find((e) => e.system === "agent") ?? dev.find((e) => e.system === "agent");

  return (
    <div className="space-y-12">
      <section className="space-y-3">
        <h1 className="m-0 font-display text-[30px] leading-[1.15] font-normal lg:text-[48px]">Pilot report</h1>
        <p className="m-0 max-w-3xl text-[15px] leading-relaxed text-neutral-700">
          Goal: take routine security questions off the team without making false promises. Success metric: <strong>safe automation</strong>,
          the share of questions answered with the correct value and a verified quote from the correct section. Safety metric, target zero:
          <strong> false promises</strong>, answers that claim more than the documents support, or that answer a request for a commitment.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="m-0 font-display text-2xl font-normal lg:text-[28px]">Held-out results</h2>
        <p className="m-0 max-w-3xl text-[15px] leading-relaxed text-neutral-700">
          A second fictional company with different documents and different question writers, generated once and frozen before any tuning.
        </p>
        {heldout.length ? <ResultsTable entries={heldout} /> : <p className="text-sm text-neutral-500">Not run yet.</p>}
      </section>

      {audited.length > 0 && (
        <section className="space-y-3">
          <h2 className="m-0 font-display text-2xl font-normal lg:text-[28px]">Held-out, excluding {audited[0].excluded?.length} questions with known label conflicts</h2>
          <p className="m-0 max-w-3xl text-[15px] leading-relaxed text-neutral-700">
            Found after the run: in a few places the generated documents contradict each other (for example, one policy says all
            backups are encrypted, another says archive backups are not), while the labels assume they agree. These questions are
            removed by control, for every system alike. The table above stays the headline result; this one is post-hoc.
          </p>
          <ResultsTable entries={audited} />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="m-0 font-display text-2xl font-normal lg:text-[28px]">Dev results (used for tuning)</h2>
        {dev.length ? <ResultsTable entries={dev} /> : <p className="text-sm text-neutral-500">Not run yet.</p>}
      </section>

      <section className="space-y-3">
        <h2 className="m-0 font-display text-2xl font-normal lg:text-[28px]">ROI estimate</h2>
        <RoiCalculator
          safeAutomation={agent?.summary.safe_automation.rate ?? 0.5}
          answered={agent?.summary.answered?.rate ?? 0.6}
          costPerQuestion={agent?.summary.cost_usd_per_question ?? 0}
          source={agent ? `the agent's ${agent.set} result` : "a placeholder until the eval is run"}
        />
      </section>

      <section className="space-y-3">
        <h2 className="m-0 font-display text-2xl font-normal lg:text-[28px]">Limitations</h2>
        <ol className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
          {LIMITS.map((l, i) => (
            <li key={l} className="flex gap-3 rounded-2xl border-2 border-ink bg-tray p-4 text-sm leading-relaxed text-neutral-800">
              <span className="grid size-7 shrink-0 place-items-center rounded-full border-2 border-ink bg-kakao font-display text-sm">{i + 1}</span>
              <span>{l}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
