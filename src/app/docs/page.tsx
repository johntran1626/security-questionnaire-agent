import { getKnowledgeBase } from "@/lib/knowledgeBase";

export const metadata = { title: "Knowledge base | Security Questionnaire Agent" };

export default function DocsPage() {
  const kb = getKnowledgeBase();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{kb.name} security documents</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          {kb.blurb} These synthetic documents are everything the agent can see. Some topics are deliberately missing, partly in place, or
          contradicted by an older FAQ, to test when the agent should flag instead of answer.
        </p>
      </div>
      {kb.docs.map((doc) => (
        <section key={doc.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold">{doc.title} <span className="font-mono text-xs font-normal text-slate-500">({doc.id})</span></h2>
          <dl className="mt-3 space-y-3">
            {doc.sections.map((s) => (
              <div key={s.id} id={s.id} className="scroll-mt-4 target:rounded target:bg-amber-50 target:p-2">
                <dt className="text-sm font-medium text-slate-800">{s.heading} <span className="font-mono text-xs font-normal text-slate-500">{s.id}</span></dt>
                <dd className="text-sm text-slate-700">{s.text}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
