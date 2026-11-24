"""Run the questionnaire eval against the local API and write results/eval.json and results/eval.md.

Start the server with baseline modes on and limits raised, then run:

    ENABLE_EVAL_MODES=1 QUESTIONS_PER_HOUR_PER_IP=100000 DAILY_QUESTION_CAP=100000 npm run start
    python -m eval.run --set dev --systems keyword,always_flag
    python -m eval.run --set dev --systems agent,paste_all --model claude-haiku-5-5
    python -m eval.run --set heldout --systems agent,paste_all,keyword,always_flag --model claude-sonnet-5-5
    python -m eval.run --set dev --systems agent,paste_all,keyword --model claude-haiku-5-5 --kb-scale 50

--kb-scale N runs against the knowledge base padded to N times its size with unrelated documents
(python -m eval.distractors). Every paste_all run is also scored as "paste_all+check": the same answers after the
agent's citation check, which needs no extra model calls.

Raw outputs are cached in results/raw/ so a crashed run can resume; pass --fresh to re-run.
The held-out set is checked against its recorded hash before every run, so it can't drift after tuning starts.
"""

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

import requests

from eval.metrics import apply_citation_check, summarize

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "eval" / "data"
RESULTS = ROOT / "results"
RAW = RESULTS / "raw"
KB_FOR_SET = {"dev": "kestrelbyte", "heldout": "tidemark"}
BATCH = 10


def load_rows(name: str) -> list[dict]:
    return [json.loads(line) for line in (DATA / f"{name}.jsonl").read_text().splitlines() if line.strip()]


def verify_heldout_lock() -> None:
    lock = {}
    for line in (DATA / "heldout.sha256").read_text().splitlines():
        digest, fname = line.split()
        lock[fname] = digest
    files = {"heldout.jsonl": DATA / "heldout.jsonl", "tidemark.json": ROOT / "src" / "data" / "kb" / "tidemark.json"}
    for fname, path in files.items():
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual != lock[fname]:
            sys.exit(f"Held-out file {fname} changed since it was frozen (hash mismatch). Refusing to run.")


def prices() -> dict:
    return json.loads((ROOT / "eval" / "prices.json").read_text())


def call_api(base: str, questions: list[str], kb_id: str, mode: str, provider: str | None, model: str | None) -> dict:
    body = {"questions": questions, "kbId": kb_id, "mode": mode}
    if provider and mode != "keyword":
        body["provider"] = provider
        if model:
            body["model"] = model
    for attempt in range(3):
        r = requests.post(f"{base}/api/answer", json=body, timeout=600)
        if r.status_code == 200:
            return r.json()
        if r.status_code in (429, 500, 502, 503, 504) and attempt < 2:
            time.sleep(5 * (attempt + 1))
            continue
        sys.exit(f"API error {r.status_code}: {r.text[:300]}")
    raise RuntimeError("unreachable")


def always_flag(rows: list[dict]) -> list[dict]:
    return [{
        "question": r["question"],
        "decision": {"decision": "flag_for_expert", "category": "not_covered", "reason": "Baseline: every question goes to an expert."},
        "trace": [], "usage": {"inputTokens": 0, "outputTokens": 0, "modelCalls": 0, "toolCalls": 0}, "latencyMs": 0,
    } for r in rows]


def kb_id(args) -> str:
    base = KB_FOR_SET[args.set]
    return base if args.kb_scale == 1 else f"{base}-x{args.kb_scale}"


def run_system(args, rows: list[dict], system: str) -> tuple[list[dict], str]:
    provider = args.provider if system in ("agent", "paste_all") else "none"
    tag = f"{provider}-{args.model}" if provider != "none" and args.model else provider
    scale = f"__x{args.kb_scale}" if args.kb_scale != 1 else ""
    cache = RAW / f"{args.set}__{system}__{tag}{scale}.json"
    if cache.exists() and not args.fresh:
        cached = json.loads(cache.read_text())
        if len(cached["results"]) == len(rows):
            print(f"  {system}: using cached {cache.name}")
            return cached["results"], cached["model"]
    if system == "always_flag":
        return always_flag(rows), "none"

    results: list[dict] = []
    model = "unknown"
    for i in range(0, len(rows), BATCH):
        batch = rows[i:i + BATCH]
        t0 = time.time()
        resp = call_api(args.base, [r["question"] for r in batch], kb_id(args), system, provider, args.model)
        if args.model and provider != "none" and resp["model"] != args.model:
            sys.exit(f"server answered with {resp['model']}, not the requested {args.model}; is an old server on this port?")
        results.extend(resp["results"])
        model = resp["model"]
        print(f"  {system}: {len(results)}/{len(rows)} ({time.time() - t0:.0f}s)", flush=True)
    RAW.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps({"model": model, "results": results}))
    return results, model


def fmt_rate(m: dict, upper_only: bool = False) -> str:
    if m["total"] == 0:
        return "n/a"
    if upper_only:
        return f"{m['count']}/{m['total']} (upper {m['ci95'][1] * 100:.1f}%)"
    return f"{m['count']}/{m['total']} ({m['rate'] * 100:.0f}%, {m['ci95'][0] * 100:.0f}-{m['ci95'][1] * 100:.0f})"


def write_markdown(all_results: dict) -> None:
    lines = []
    for set_name in ("heldout", "dev"):
        entries = {k: v for k, v in all_results.items() if v["set"] == set_name and v.get("scale", 1) == 1}
        if not entries:
            continue
        title = "Held-out set (Tidemark HR, reported numbers)" if set_name == "heldout" else "Dev set (Kestrelbyte, used for tuning)"
        lines += [f"### {title}", "",
                  "| System | Model | Safe automation | False promises | Decision accuracy | Over-flagging | Citations valid | Injections resisted | Commitments flagged | Latency p50 / p95 | Cost / question |",
                  "|---|---|---|---|---|---|---|---|---|---|---|"]
        order = {"agent": 0, "paste_all": 1, "paste_all+check": 2, "keyword": 3, "always_flag": 4}
        for key, v in sorted(entries.items(), key=lambda kv: (order.get(kv[1]["system"], 9), kv[1]["model"])):
            s = v["summary"]
            cost = "n/a" if s["cost_usd_per_question"] is None else f"${s['cost_usd_per_question']:.4f}"
            lines.append(
                f"| {v['system']} | {v['model']} | {fmt_rate(s['safe_automation'])} | {fmt_rate(s['false_promises'], True)} | "
                f"{fmt_rate(s['decision_accuracy'])} | {fmt_rate(s['over_flagging'])} | {fmt_rate(s['citation_validity'])} | "
                f"{fmt_rate(s['injection_no_false_promise'])} | {fmt_rate(s['commitments_flagged'])} | "
                f"{s['latency_p50_s']}s / {s['latency_p95_s']}s | {cost} |"
            )
        lines.append("")
    scaled = {k: v for k, v in all_results.items() if v.get("scale", 1) != 1}
    if scaled:
        scaled_sets = {v["set"] for v in scaled.values()}
        same = {k: v for k, v in all_results.items() if v.get("scale", 1) == 1 and v["set"] in scaled_sets
                and any(w["system"] == v["system"] and w["model"] == v["model"] for w in scaled.values())}
        lines += ["### Scale test (knowledge base padded with unrelated company documents)", "",
                  "| Set | System | Model | KB size | Safe automation | False promises | Over-flagging | Input tokens / question | Cache-read share | Latency p50 / p95 | Cost / question |",
                  "|---|---|---|---|---|---|---|---|---|---|---|"]
        order = {"agent": 0, "paste_all": 1, "paste_all+check": 2, "keyword": 3}
        for v in sorted({**same, **scaled}.values(), key=lambda v: (v["set"], order.get(v["system"], 9), v["model"], v.get("scale", 1))):
            s = v["summary"]
            cost = "n/a" if s["cost_usd_per_question"] is None else f"${s['cost_usd_per_question']:.4f}"
            lines.append(
                f"| {v['set']} | {v['system']} | {v['model']} | {v.get('scale', 1)}x | {fmt_rate(s['safe_automation'])} | "
                f"{fmt_rate(s['false_promises'], True)} | {fmt_rate(s['over_flagging'])} | {s['tokens_in_per_question']:,} | "
                f"{s.get('cache_read_share', 0) * 100:.0f}% | {s['latency_p50_s']}s / {s['latency_p95_s']}s | {cost} |"
            )
        lines.append("")
    lines.append("Counts are questions; ranges are 95% Wilson intervals. Safe automation is out of all questions; "
                 "the ceiling is the share of answerable questions. paste_all+check is paste_all after the same "
                 "citation check the agent gets.")
    (RESULTS / "eval.md").write_text("\n".join(lines) + "\n")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--set", choices=["dev", "heldout"], required=True)
    ap.add_argument("--systems", default="agent")
    ap.add_argument("--provider", choices=["google", "anthropic"], default="anthropic")
    ap.add_argument("--model", default=None, help="model id override, e.g. claude-haiku-5-5 (default: the server's)")
    ap.add_argument("--base", default="http://localhost:3000")
    ap.add_argument("--limit", type=int, default=0, help="only the first N questions (smoke runs)")
    ap.add_argument("--fresh", action="store_true")
    ap.add_argument("--kb-scale", type=int, default=1, help="use the knowledge base padded to N times its size")
    args = ap.parse_args()

    if args.set == "heldout":
        verify_heldout_lock()
        if args.kb_scale != 1:
            sys.exit("Padded held-out knowledge bases are not frozen yet; run the scale test on dev.")
    rows = load_rows(args.set)
    if args.limit:
        rows = rows[:args.limit]
    out_path = RESULTS / "eval.json"
    all_results = json.loads(out_path.read_text()) if out_path.exists() else {}
    price_table = prices()

    for system in args.systems.split(","):
        results, model = run_system(args, rows, system)
        scored = [(system, results)]
        if system == "paste_all":
            scored.append(("paste_all+check", apply_citation_check(results)))
        for name, res in scored:
            summary = summarize(rows, res, price_table.get(model))
            key = (f"{args.set}/{name}/{model}" + (f"/x{args.kb_scale}" if args.kb_scale != 1 else "")
                   + (f"/limit{args.limit}" if args.limit else ""))
            all_results[key] = {"set": args.set, "system": name, "model": model, "scale": args.kb_scale,
                                "limit": args.limit or None, "run_at": time.strftime("%Y-%m-%d %H:%M"), "summary": summary}
            s = summary
            print(f"{key}: safe automation {s['safe_automation']['count']}/{s['n']}, false promises "
                  f"{s['false_promises']['count']}/{s['n']}, decision accuracy {s['decision_accuracy']['count']}/{s['n']}, "
                  f"over-flagging {s['over_flagging']['count']}/{s['answerable']}, "
                  f"input tokens/question {s['tokens_in_per_question']:,}")

    RESULTS.mkdir(exist_ok=True)
    out_path.write_text(json.dumps(all_results, indent=2) + "\n")
    write_markdown({k: v for k, v in all_results.items() if not v.get("limit")})
    print(f"wrote {out_path.relative_to(ROOT)} and results/eval.md")


if __name__ == "__main__":
    main()
