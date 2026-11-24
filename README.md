# Security Questionnaire Agent

An AI agent that drafts answers to the security questionnaires customers send before they buy software
("Do you encrypt data at rest?", "Do you support SSO?", "How fast do you report a breach?"). For each question it
searches the vendor's own security documents and either drafts an answer (Yes / No / Partial, a short explanation
and an exact quoted source passage) for a human to approve, or flags the question for an expert when the documents
don't cover it, contradict each other, or the question asks for a contractual commitment.

**Status: in progress.** The agent, API, review UI and evaluation harness are built. Held-out results, the hosted
demo and the full pilot write-up are not done yet; this README will carry the final numbers.

## Why

Almost every B2B software sale goes through a security review: a spreadsheet of 50-300 questions that someone on
the vendor side answers by digging through policies and old answers. It is slow, and a wrong "Yes" is worse than
slow, because it becomes a promise in a sales contract. So the design goal is not "answer everything" but
"automate what the documents clearly support, and never claim more than they say".

## How it works

```
Browser: paste questions -> review table (approve / edit / reject, cited passage, agent trace) -> CSV export
POST /api/answer
  1. validate input (zod)                      400 on bad input
  2. rate limit by question count (Upstash)    429 when over
  3. per question, an agent loop (max 6 lookups):
       search_docs(query)  read_section(docId, sectionId)  ->  answer(...) | flag_for_expert(reason)
  4. validate the decision; retry once; otherwise flag
  5. citation check: every quote must appear word for word in the cited section;
     Yes / Partial without a valid quote becomes a flag
```

- **The model proposes, code checks.** The final decision is itself a tool call, so it is schema-validated, and the
  citation check runs after the model regardless of what it said.
- **Questions are untrusted input.** Tools are read-only, questions are delimited, and the evaluation includes
  prompt-injected questions.
- **Search** is BM25 keyword ranking in plain TypeScript (`src/lib/search.ts`), no vector database.
- **Providers:** Claude (Haiku 5.5 for the demo, Sonnet 5.5 for comparison) behind one adapter interface; a
  Gemini adapter is included but not evaluated.

## Evaluation

All data is synthetic and generated from a grid (`eval/generate.py`): control area x company state (in place,
partly, not in place, undocumented, contradicted) x question style (direct, reworded, compound, commitment request,
prompt injection). The correct decision, value and source section follow from the grid, so nothing is hand-labelled.

- **Split by source:** the dev set (80 questions) uses one fictional company and is used for tuning. The held-out
  set (148 questions) uses a different company, different documents and different question wording; it is frozen
  by hash before tuning.
- **Baselines:** paste every document into one prompt; keyword search alone; flag everything.
- **Primary metric:** safe automation, meaning the right decision, the right value and a valid citation to the
  right section.
- **Safety metric:** false promises, meaning any answer that claims more than the documents support. Reported with a
  95% Wilson upper bound, since zero in a small sample is not proof of zero.
- **Scale test:** the knowledge base padded to 10x, 50x and 100x with unrelated company documents
  (`eval/distractors.py`), to measure what changes when the documents no longer fit comfortably in one prompt.

Current dev-set numbers are in [`results/eval.md`](results/eval.md). They are tuning numbers, not the reported
results.

## Run it locally

Requires Node 22 and Python 3.13.

```bash
npm install
cp .env.local.example .env.local   # add an ANTHROPIC_API_KEY
npm run dev                        # http://localhost:3000
npm test                           # unit and route tests (no API key needed)
python3 -m unittest discover eval  # eval metric and data tests
```

Evaluation (calls the local API; costs API credits):

```bash
ENABLE_EVAL_MODES=1 QUESTIONS_PER_HOUR_PER_IP=100000 DAILY_QUESTION_CAP=100000 npm run dev
python -m eval.run --set dev --systems agent,paste_all,keyword,always_flag --model claude-haiku-5-5
```

## Limitations (so far)

- The knowledge base and questions are synthetic. Labels come from the generator, not from a real security team.
- The system only knows its documents. If they are out of date, so are the answers.
- The citation check proves a quote exists, not that it supports the answer; that is measured, not guaranteed.

## License

MIT. All documents and questions are original synthetic content.
