import { DocsBrowser } from "@/components/DocsBrowser";
import { getKnowledgeBase } from "@/lib/knowledgeBase";

export const metadata = { title: "Knowledge base | Security Questionnaire Agent" };

export default function DocsPage() {
  const kb = getKnowledgeBase();
  return (
    <div className="space-y-8">
      <div>
        <h1 className="m-0 font-display text-[30px] leading-[1.15] font-normal lg:text-[48px]">{kb.name} security documents</h1>
        <p className="mt-3 mb-0 max-w-3xl text-[15px] leading-relaxed text-neutral-700">
          Everything the agent can see. These documents are synthetic, and some topics are deliberately missing, partly in place, or
          contradicted by an older FAQ, to test when the agent should flag instead of answer.
        </p>
      </div>
      <DocsBrowser docs={kb.docs} />
    </div>
  );
}
