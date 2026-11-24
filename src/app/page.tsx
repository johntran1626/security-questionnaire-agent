import { Workbench } from "@/components/Workbench";
import { getKnowledgeBase, SAMPLES } from "@/lib/knowledgeBase";
import { LIMITS } from "@/lib/schemas";

export default function Home() {
  const kb = getKnowledgeBase();
  return (
    <Workbench
      samples={SAMPLES}
      maxQuestions={LIMITS.maxQuestions}
      maxChars={LIMITS.maxQuestionChars}
      kbName={kb.name}
      docTitles={Object.fromEntries(kb.docs.map((d) => [d.id, d.title]))}
    />
  );
}
