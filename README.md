# Security Questionnaire Agent

An AI agent that drafts answers to the security questionnaires customers send before they buy software
("Do you encrypt data at rest?", "Do you support SSO?", "How fast do you report a breach?"). For each question it
searches the vendor's own security documents and either drafts an answer (Yes / No / Partial, a short explanation
and an exact quoted source passage) for a human to approve, or flags the question for an expert when the documents
don't cover it, contradict each other, or the question asks for a contractual commitment.

It is built and written up as a customer pilot: a scoped problem, a success metric, an evaluation on a held-out
set against three baselines, an ROI estimate with stated assumptions, and the limits.

**Live demo:** _link added after deploy_. No signup. It uses a fictional company's synthetic security documents.

## The problem

Almost every B2B software sale goes through a security review: a spreadsheet of 50-300 questions that someone on
the vendor side, often the Solutions Engineer, answers by digging through policies and old answers. It is slow and
it delays deals. A wrong "Yes" is worse than slow, because it becomes a promise in a sales contract.

So the pilot is scoped around two numbers:

- **Success metric, safe automation:** the share of questions answered with the right decision, the right value
  and a verified quote from the right section. That is the work taken off the team.
- **Safety metric, false promises (target 0):** answers that claim more than the documents support (Yes when the
  truth is Partial or No; Yes or Partial when the topic is undocumented or the documents contradict each other) or
  that answer a request for a commitment.

## Results (held-out set, Claude Haiku 5.5, 148 questions, one run)

| System | Safe automation | False promises | Over-flagging | Injections resisted | Latency p50 | Cost / question |
|---|---|---|---|---|---|---|
| **Agent** (search tools + citation check) | 63/148 (43%, 35-51) | 4/148 (upper bound 6.7%) | 12/91 | 19/20 | 4.2 s | $0.0006 |
| Paste every document into one prompt | 67/148 (45%, 37-53) | 8/148 (upper bound 10.3%) | 7/91 | 18/20 | 1.2 s | $0.0002 |
| Keyword search, no model | 31/148 (21%, 15-28) | 95/148 | 2/91 | 2/20 | 0 s | $0 |
| Always flag (do it all by hand) | 0/148 | 0/148 (upper bound 2.5%) | 91/91 | 20/20 | 0 s | $0 |

Ranges are 95% Wilson intervals. 91 of the 148 questions are answerable from the documents; the other 57 should be
flagged (undocumented, contradicted, or a commitment request), so the ceiling for safe automation is 91/148 (61%).
Full tables, including decision accuracy and citation validity, are in [`results/eval.md`](results/eval.md).

What the numbers say:

- **The agent does not automate more than pasting everything.** 63 vs 67 safe answers, well inside each other's
  intervals. On a knowledge base this small (37 sections, about 2.5K tokens) the whole thing fits in one prompt,
  and the simple approach is as accurate.
- **Where they differ is contradictions.** All 8 of paste-all's false promises are on the 15 questions where the
  documents contradict each other (for example, a current policy against an old sales FAQ): it picked one side and
  answered. The agent made 0 false promises on those 15 and flagged them. Its 4 false promises are elsewhere: two
  "breach notification" questions answered Yes where the truth is Partial, one No answered as Partial, and one half
  of a two-part question.
- **The safety gap is consistent but not proven on held-out alone.** 4 vs 8 in 148 is not a significant difference
  by itself. It points the same way as every other comparison on Haiku: dev 1 vs 9 in 80, and the scale test 2 vs
  29 in 320.
- **Search alone is unsafe.** The keyword baseline answers almost everything and makes 95 false promises in 148.
  The model's judgment is what turns retrieval into something a vendor could send.
- **Both systems flagged all 20 commitment requests**, and the agent resisted 19 of 20 prompt-injected questions.
  Its one miss (question 134) is the same Yes-instead-of-Partial error it made on the non-injected version of that
  question, so it looks like a misjudgment rather than the injection working.
- **The citation check never had to fire on held-out:** every quote either system made was real (81/81 and 92/92).
  The check is a backstop against fabricated quotes; it cannot catch a wrong conclusion drawn from a real quote.

### Label audit (found after the run)

Reading the errors showed two places where the data generator wrote documents that contradict each other across
controls while the labels assume they agree. One policy says all data at rest is encrypted "including backups";
the backup plan says document archive backups are stored unencrypted. And a legacy FAQ saying there is no incident
response program undercuts questions labelled a plain Yes about incident response testing. On these questions the
agent's "documents contradict" flag is defensible, and paste-all's "Yes, all customer data is encrypted at rest" is
arguably a real false promise that the labels counted as correct.

The held-out files stay frozen and the table above is the headline. As a post-hoc check, every question touching
the three affected controls (15 questions) was removed for all systems alike (`python -m eval.audit`, no model
calls):

| System (133 questions) | Safe automation | False promises | Over-flagging |
|---|---|---|---|
| Agent | 60/133 (45%, 37-54) | 4/133 | 2/77 |
| Paste everything | 58/133 (44%, 35-52) | 7/133 | 4/77 |

The two systems are still tied on accuracy. Most of the agent's over-flagging (10 of 12) was these 15 questions.

### Scale test, dev set (Claude Haiku 5.5, 80 questions, one run per cell)

The real objection to "paste everything" is that a real company has hundreds of pages, not 37 sections. To test
that, the dev knowledge base was padded to 10x, 50x and 100x its size with unrelated company documents (release
notes, runbooks, HR handbook; `eval/distractors.py`), with the original sections and labels untouched.

| KB size (tokens) | Agent: safe automation | Agent: false promises | Agent: cost / question | Paste-all: safe automation | Paste-all: false promises | Paste-all: cost / question |
|---|---|---|---|---|---|---|
| 1x (2.5K) | 41/80 | 1/80 | $0.0010 | 45/80 | 9/80 | $0.0002 |
| 10x (23K) | 42/80 | 0/80 | $0.0006 | 44/80 | 4/80 | $0.0004 |
| 50x (112K) | 42/80 | 0/80 | $0.0005 | 43/80 | 7/80 | $0.0074 |
| 100x (224K) | 39/80 | 1/80 | $0.0006 | 40/80 | 9/80 | $0.0140 |

Both systems use prompt caching except the 1x agent run, which predates it. Paste-all reads 98-99% of its input
from the cache; without the cache, the 100x paste-all would cost about 8 times more (~$0.12 per question).

- **Accuracy still does not separate the two.** Paste-all drifted from 45 to 40 as the documents grew, inside the
  noise, and did not collapse at 224K tokens on this model.
- **Safety does.** Pooled over the four sizes: agent 2/320 false promises (95% interval 0.2-2.2%), paste-all 29/320
  (6.4-12.7%). These reuse the same 80 questions at four sizes, so they are not independent samples.
- **Cost grows with the documents for paste-all, not for the agent.** The agent reads about 7.7K tokens per
  question whatever the size; at 100x paste-all costs 23x more per question, and its latency would grow with it.

### Model comparison (dev set only)

On the 80 dev questions, Claude Sonnet 5.5 (two runs per system) scored 44-47 safe with 1 false promise as the
agent and 48 safe with 0 false promises pasting everything, at about 17x Haiku's cost per question. Sonnet was not
run on the held-out set, so this comparison is weaker than the Haiku numbers above. The demo uses Haiku.

## What this means for a customer

- **For a small, consistent document set, the simplest design is enough.** Pasting everything into a strong model
  is as accurate, faster and cheaper, as long as a human approves every draft.
- **The agent earns its complexity when documents grow, or contradict each other.** Its cost stays flat as the
  knowledge base grows, and in every Haiku comparison it made fewer false promises, mainly by flagging conflicting
  documents instead of picking a side. A real company's 500 pages of policies, old FAQs and wiki pages will have
  conflicts.
- **About 43% of questions came back as a verified, cited draft** that needs only a review. Everything else goes to
  a person, with the reason attached.

### ROI estimate (assumptions to replace with a customer's own)

8 questionnaires a month x 120 questions, 6 minutes per question by hand, 1.5 minutes to review a draft, $90 per
loaded hour, 43% safe automation (held-out result), wrong drafts charged review time plus doing them by hand:
**96 hours a month by hand vs 68 with the agent, about 28 hours (~$2,500) saved per month**, for about $1 a month
in model cost. The calculator on the report page lets a customer change every assumption. The biggest lever is not
the model but the documents: a well-maintained, consistent knowledge base raises the automation ceiling.

## How it works

```
Browser: paste questions -> review table (approve / edit / reject, cited passage, agent trace) -> CSV export
POST /api/answer
  1. validate input (zod: up to 50 questions, 300 characters each)   400 on bad input
  2. rate limit by question count (Upstash; in-memory locally)        429 when over
  3. per question, an agent loop (max 6 tool calls):
       search_docs(query)  read_section(docId, sectionId)  ->  answer(...) | flag_for_expert(reason)
  4. validate the decision; retry once with the validation error; otherwise flag "could not process"
  5. citation check: every quote must appear word for word in the cited section;
     Yes / Partial without a valid quote becomes a flag
```

- **The model proposes, code checks.** The final decision is itself a tool call, so it is schema-validated, and the
  citation check runs after the model whatever it said.
- **Questions are untrusted input.** Tools are read-only, questions are delimited in the prompt, and the evaluation
  includes 20 prompt-injected questions.
- **Search** is BM25 keyword ranking in plain TypeScript (`src/lib/search.ts`), no vector database.
- **Providers:** Claude (Haiku 5.5 in the demo) behind one adapter interface; a Gemini adapter is included but was
  not evaluated.

## Evaluation method

All data is synthetic and generated from a grid (`eval/generate.py`): control area (28 controls: encryption,
access and SSO, logging, backups, incident response, vendors, retention, training, ...) x company state (in place,
partly, not in place, undocumented, contradicted) x question style (direct, reworded, compound, commitment request,
prompt injection). The correct decision, value and source section follow from the grid, so nothing is
hand-labelled.

- **Split by source:** the dev set (80 questions) uses one fictional company and was used for tuning. The held-out
  set (148 questions) uses a different company, different documents and different question wording. It was
  generated once and frozen by hash (`eval/data/heldout.sha256`); the runner refuses to run if any file changed.
- **Baselines:** paste every document into one prompt (same model, same output format, same retry); keyword search
  alone; flag everything.
- **Intervals:** every rate is reported as a count with a 95% Wilson interval; zero false promises is reported with
  its upper bound, since 0 in a small sample is not proof of 0.

## Running a public demo safely

- Limits count questions, not requests: 100 questions per IP per hour, 300 per day overall (about $0.30 a day at
  most at the measured cost), plus a monthly spend limit in the provider console.
- Model calls happen only when a visitor presses Run. There are no scheduled jobs.
- Nothing is stored: requests are not logged beyond rate-limit counters on a hashed IP that expire.
- Baseline modes and model selection are evaluation-only and return 403 on the public deployment.

## Limitations

- **Synthetic data.** Documents and questions come from a generator, so labels are known by construction, not
  checked by a real security team. Real questionnaires are messier. The generator itself had a bug (see the label
  audit), which is exactly the kind of error real labels have too.
- **One run per system on held-out, Haiku only.** Repeated dev runs moved by up to 3 questions, so differences of
  a few questions are noise. Sonnet was compared on the dev set only. The scale test was run on the dev set only.
- **It only knows its documents.** If they are out of date, so are the answers. A rollout needs an owner for the
  knowledge base.
- **The citation check proves a quote exists, not that it supports the answer.** Support is measured in the eval,
  not guaranteed at run time; that is why every draft goes to a human.
- **Keyword search has no synonyms.** The agent compensates by searching again with other words. A large real
  knowledge base would likely need hybrid (keyword + embedding) search.

## What a production rollout would need

- Connectors to where the documents actually live (Confluence, Google Drive, the trust portal), with a sync
  schedule and an owner who keeps them current.
- Hybrid search and section-level chunking for hundreds of pages; re-run the scale test on the customer's own
  documents.
- A labelled sample of the customer's past questionnaires (with approved answers) as the real evaluation set, and
  sign-off criteria agreed up front, e.g. "zero false promises on 300 questions, at least 40% safe automation".
- Reviewer feedback (edits and rejections) logged and fed back into the documents and the evaluation set.
- SSO, audit logs and data-retention settings for the vendor's own team, since questionnaires can be confidential.

## Run it locally

Requires Node 22 and Python 3.13.

```bash
npm install
cp .env.local.example .env.local   # add an ANTHROPIC_API_KEY
npm run dev                        # http://localhost:3000
npm test                           # unit and route tests (no API key needed)
python3 -m unittest discover eval  # eval metric and data tests
node scripts/ui-check.mjs --mock   # headless Chrome check at desktop and phone width (needs the app running)
```

Evaluation (calls the local API; costs API credits):

```bash
npm run build
ENABLE_EVAL_MODES=1 QUESTIONS_PER_HOUR_PER_IP=100000 DAILY_QUESTION_CAP=100000 npx next start
python -m eval.run --set heldout --systems agent,paste_all,keyword,always_flag --model claude-haiku-5-5
python -m eval.audit               # post-hoc label audit, no model calls
```

## License

MIT. All documents and questions are original synthetic content.
