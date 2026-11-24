import { Workbench } from "@/components/Workbench";
import { getKnowledgeBase, SAMPLES } from "@/lib/knowledgeBase";
import { LIMITS } from "@/lib/schemas";

export default function Home() {
  const kb = getKnowledgeBase();
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Draft security questionnaire answers, with sources</h1>
        <p className="max-w-3xl text-sm text-slate-600">
          The agent searches {kb.name}&apos;s security documents for each question. It drafts a Yes / No / Partial answer with a quoted source,
          or flags the question for an expert when the docs don&apos;t cover it, contradict each other, or the question asks for a commitment.
          Every quote is checked word for word against the source. You approve, edit or reject each draft, then export.
        </p>
        <p className="text-xs text-slate-500">{kb.blurb} The documents are synthetic.</p>
      </section>
      <Workbench samples={SAMPLES} maxQuestions={LIMITS.maxQuestions} maxChars={LIMITS.maxQuestionChars} docTitles={Object.fromEntries(kb.docs.map((d) => [d.id, d.title]))} />
    </div>
  );
}
