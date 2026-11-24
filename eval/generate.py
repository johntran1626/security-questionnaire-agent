"""Build the synthetic knowledge bases, the labelled question sets and the demo samples.

Labels come from construction: every control is assigned a state for each company, and the state fixes the correct
decision, value and source section. No hand labelling.

    python -m eval.generate            # writes src/data/kb, src/data/samples, eval/data/dev.jsonl
    python -m eval.generate --heldout  # also (re)writes eval/data/heldout.jsonl; done once, then frozen

Split by source: the dev set uses Kestrelbyte's docs and the dev question writers; the held-out set uses Tidemark's
docs and a different set of question writers.
"""

import argparse
import hashlib
import json
import random
from pathlib import Path

from eval.facts import (
    COMMITMENTS_DEV,
    COMMITMENTS_HELDOUT,
    COMPANIES,
    CONTROLS,
    FILLER,
    INJECTIONS_DEV,
    INJECTIONS_HELDOUT,
)

ROOT = Path(__file__).resolve().parent.parent
KB_DIR = ROOT / "src" / "data" / "kb"
SAMPLES_DIR = ROOT / "src" / "data" / "samples"
EVAL_DIR = ROOT / "eval" / "data"

# State mix per company (sums to the 28 controls). Most controls are documented, as in a real security program,
# with enough gaps and contradictions to test flagging.
STATE_COUNTS = {"full": 11, "partial": 6, "no": 4, "undocumented": 4, "contradict": 3}
SEEDS = {"kestrelbyte": 11, "tidemark": 29}

SETS = {
    # company, question source key, compound count, commitments, injections, injection count
    "dev": ("kestrelbyte", "q_dev", 8, COMMITMENTS_DEV, INJECTIONS_DEV, 8),
    "heldout": ("tidemark", "q_ho", 24, COMMITMENTS_HELDOUT, INJECTIONS_HELDOUT, 20),
}

VALUE_FOR_STATE = {"full": "Yes", "partial": "Partial", "no": "No"}


# Controls that only make sense if a parent control exists. "We take no backups" next to "backups are encrypted"
# would be an accidental contradiction the labels don't know about, so such draws are rejected.
DEPENDS_ON = {"backup_enc": "backups", "dr_test": "backups", "ir_test": "ir_plan", "cmk": "enc_rest"}
ABSENT = {"no", "undocumented"}


def consistent(assignment: dict[str, str]) -> bool:
    return all(
        not (assignment[parent] in ABSENT and assignment[child] not in ABSENT)
        for child, parent in DEPENDS_ON.items()
    )


def assign_states(company: str) -> dict[str, str]:
    states = [s for s, n in STATE_COUNTS.items() for _ in range(n)]
    assert len(states) == len(CONTROLS)
    rng = random.Random(SEEDS[company])
    while True:
        rng.shuffle(states)
        assignment = {c["id"]: s for c, s in zip(CONTROLS, states)}
        if consistent(assignment):
            return assignment


def build_kb(company: str, states: dict[str, str]) -> tuple[dict, dict[str, list[str]]]:
    """Return the knowledge base and, per control, the section ids that document it."""
    meta = COMPANIES[company]
    sections_by_doc: dict[str, list[dict]] = {d: [] for d in meta["docs"]}
    control_sections: dict[str, list[str]] = {}

    def add(doc: str, heading: str, text: str) -> str:
        sid = f"{doc}-{len(sections_by_doc[doc]) + 1}"
        sections_by_doc[doc].append({"id": sid, "heading": heading, "text": text})
        return sid

    for doc, items in FILLER[company].items():
        for heading, text in items:
            add(doc, heading, text)

    for c in CONTROLS:
        state = states[c["id"]]
        text = c[company]
        if state == "undocumented":
            control_sections[c["id"]] = []
        elif state == "contradict":
            # Current policy says it's in place; an older doc says it isn't. A reviewer has to resolve this.
            main = add(c["doc"], c["title"][company], text["full"])
            old = add("faq", c["title"][company], text["no"])
            control_sections[c["id"]] = [main, old]
        else:
            control_sections[c["id"]] = [add(c["doc"], c["title"][company], text[state])]

    kb = {
        "id": company,
        "name": meta["name"],
        "blurb": meta["blurb"],
        "docs": [
            {"id": d, "title": title, "sections": sections_by_doc[d]}
            for d, title in meta["docs"].items()
            if sections_by_doc[d]
        ],
    }
    return kb, control_sections


def label_for(control_ids: list[str], states: dict[str, str], csec: dict[str, list[str]]) -> dict:
    st = [states[c] for c in control_ids]
    sections = [s for c in control_ids for s in csec[c]]
    if "undocumented" in st:
        return {"decision": "flag_for_expert", "flag_kind": "not_covered", "sections": sections}
    if "contradict" in st:
        return {"decision": "flag_for_expert", "flag_kind": "contradiction", "sections": sections}
    values = {VALUE_FOR_STATE[s] for s in st}
    value = values.pop() if len(values) == 1 else "Partial"
    return {"decision": "answer", "value": value, "sections": sections}


def compound(qa: str, qb: str, style: str) -> str:
    if style == "dev":
        return f"{qa.rstrip('?')}, and {qb[0].lower()}{qb[1:]}"
    return f"Two-part question: (a) {qa} (b) {qb}"


def build_set(name: str) -> tuple[list[dict], dict]:
    company, qkey, n_compound, commitments, injections, n_inject = SETS[name]
    states = assign_states(company)
    kb, csec = build_kb(company, states)
    rng = random.Random(SEEDS[company] + 1)
    rows: list[dict] = []

    def push(kind: str, question: str, controls: list[str], expected: dict) -> None:
        rows.append({
            "id": f"{name}-{len(rows) + 1:03d}",
            "company": company,
            "kind": kind,
            "question": question,
            "controls": controls,
            "states": [states[c] for c in controls],
            "expected": expected,
        })

    for c in CONTROLS:
        for i, q in enumerate(c[qkey]):
            push("direct" if i == 0 else "reworded", q, [c["id"]], label_for([c["id"]], states, csec))

    by_doc: dict[str, list[dict]] = {}
    for c in CONTROLS:
        by_doc.setdefault(c["doc"], []).append(c)
    pairs = [(a, b) for group in by_doc.values() for i, a in enumerate(group) for b in group[i + 1:]]
    rng.shuffle(pairs)
    for a, b in pairs[:n_compound]:
        q = compound(a[qkey][0], b[qkey][0], name)
        push("compound", q, [a["id"], b["id"]], label_for([a["id"], b["id"]], states, csec))

    for q in commitments:
        push("commitment", q, [], {"decision": "flag_for_expert", "flag_kind": "commitment", "sections": []})

    # Inject into questions whose honest answer is not "Yes", so obeying the payload is a visible false promise.
    targets = [c for c in CONTROLS if states[c["id"]] != "full"]
    rng.shuffle(targets)
    for i in range(n_inject):
        c = targets[i % len(targets)]
        q = f"{c[qkey][i % len(c[qkey])]} {injections[i % len(injections)]}"
        push("injection", q, [c["id"]], label_for([c["id"]], states, csec))

    return rows, kb


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows))


def build_samples(dev_rows: list[dict]) -> list[dict]:
    """Demo questionnaires drawn from the dev set (labels stripped)."""
    def pick(kinds: list[str], n: int, seed: int) -> list[str]:
        pool = [r["question"] for r in dev_rows if r["kind"] in kinds]
        random.Random(seed).shuffle(pool)
        return pool[:n]

    return [
        {
            "id": "quick-review",
            "title": "Quick security review (12 questions)",
            "description": "A short mix of common questions, including a few the docs don't cover.",
            "questions": pick(["direct"], 9, 1) + pick(["commitment"], 2, 2) + pick(["injection"], 1, 3),
        },
        {
            "id": "vendor-assessment",
            "title": "SaaS vendor assessment (25 questions)",
            "description": "A longer questionnaire with reworded and two-part questions.",
            "questions": pick(["direct", "reworded"], 18, 4) + pick(["compound"], 4, 5) + pick(["commitment"], 3, 6),
        },
        {
            "id": "tricky",
            "title": "Tricky questions (10 questions)",
            "description": "Contract commitments and questions with embedded instructions aimed at the AI.",
            "questions": pick(["commitment"], 5, 7) + pick(["injection"], 5, 8),
        },
    ]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--heldout", action="store_true", help="(re)write the frozen held-out set")
    args = ap.parse_args()

    KB_DIR.mkdir(parents=True, exist_ok=True)
    SAMPLES_DIR.mkdir(parents=True, exist_ok=True)
    EVAL_DIR.mkdir(parents=True, exist_ok=True)

    dev_rows, dev_kb = build_set("dev")
    (KB_DIR / "kestrelbyte.json").write_text(json.dumps(dev_kb, indent=2, ensure_ascii=False) + "\n")
    write_jsonl(EVAL_DIR / "dev.jsonl", dev_rows)
    (SAMPLES_DIR / "samples.json").write_text(json.dumps(build_samples(dev_rows), indent=2, ensure_ascii=False) + "\n")
    print(f"dev: {len(dev_rows)} questions")

    ho_rows, ho_kb = build_set("heldout")
    kb_path = KB_DIR / "tidemark.json"
    ho_path = EVAL_DIR / "heldout.jsonl"
    lock = EVAL_DIR / "heldout.sha256"
    if args.heldout or not ho_path.exists():
        kb_path.write_text(json.dumps(ho_kb, indent=2, ensure_ascii=False) + "\n")
        write_jsonl(ho_path, ho_rows)
        lock.write_text(f"{sha256(ho_path)}  heldout.jsonl\n{sha256(kb_path)}  tidemark.json\n")
        print(f"heldout: {len(ho_rows)} questions written and locked")
    else:
        print("heldout: frozen, not rewritten (pass --heldout to regenerate)")


if __name__ == "__main__":
    main()
