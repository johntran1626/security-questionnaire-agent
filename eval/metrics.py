"""Scoring for the questionnaire eval.

Definitions (also stated in the README):
- Safe automation: the system answered (not flagged), with the correct value, and validly cited every section the
  label names. This is work taken off the security team. Correct flags still need an expert, so they don't count.
- False promise: an answer that claims more than the documents support. Yes when the truth is Partial or No;
  Yes or Partial when the topic is undocumented or the docs contradict each other; any answer to a commitment request.
- Over-flag: the question was answerable from the docs but the system flagged it. Safe, but costs expert time.
"""

import copy
import math
import statistics

RANK = {"No": 0, "Partial": 1, "Yes": 2}


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    """95% Wilson score interval for k successes out of n."""
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return (max(0.0, centre - half), min(1.0, centre + half))


def rate(k: int, n: int) -> dict:
    lo, hi = wilson(k, n)
    return {"count": k, "total": n, "rate": k / n if n else 0.0, "ci95": [round(lo, 4), round(hi, 4)]}


def is_false_promise(row: dict, decision: dict) -> bool:
    if decision["decision"] != "answer":
        return False
    exp = row["expected"]
    if exp["decision"] == "flag_for_expert":
        if exp.get("flag_kind") == "commitment":
            return True
        return decision["value"] in ("Yes", "Partial")
    return RANK[decision["value"]] > RANK[exp["value"]]


def citation_ok(result: dict) -> bool:
    checks = [t for t in result.get("trace", []) if t["type"] == "citation_check"]
    return bool(checks) and checks[-1]["ok"]


def score_row(row: dict, result: dict) -> dict:
    exp = row["expected"]
    d = result["decision"]
    answered = d["decision"] == "answer"
    decision_correct = d["decision"] == exp["decision"]
    value_correct = answered and decision_correct and d["value"] == exp["value"]
    cited = {c["sectionId"] for c in d.get("citations", [])} if answered else set()
    sections_ok = set(exp["sections"]) <= cited
    trace_types = [t["type"] for t in result.get("trace", [])]
    return {
        "id": row.get("id"),
        "kind": row.get("kind"),
        "answered": answered,
        "decision_correct": decision_correct,
        "value_correct": value_correct,
        "safe_auto": bool(value_correct and sections_ok and citation_ok(result)),
        "false_promise": is_false_promise(row, d),
        "over_flag": exp["decision"] == "answer" and not answered,
        "citation_valid": citation_ok(result) if answered else None,
        "downgraded": any(t["type"] == "citation_check" and t.get("downgraded") for t in result.get("trace", [])),
        "schema_first_try": "invalid_decision" not in trace_types and "no_tool_call" not in trace_types,
        "could_not_process": d["decision"] == "flag_for_expert" and d.get("category") == "could_not_process",
        "expected": exp["decision"] if exp["decision"] == "flag_for_expert" else exp["value"],
        "got": d["value"] if answered else f"flag:{d.get('category')}",
    }


def apply_citation_check(results: list[dict]) -> list[dict]:
    """Give a baseline the agent's deterministic check after the fact: Yes or Partial without a valid quote becomes
    a flag. Uses the citation check already recorded in each trace, so no model calls are repeated."""
    out = []
    for res in results:
        res = copy.deepcopy(res)
        d = res["decision"]
        if d["decision"] == "answer" and d["value"] in ("Yes", "Partial") and not citation_ok(res):
            res["decision"] = {"decision": "flag_for_expert", "category": "citation_failed",
                               "reason": "No cited quote matched the source word for word."}
            res["trace"].append({"type": "citation_check", "ok": False, "problems": [], "downgraded": True})
        out.append(res)
    return out


def cost_usd(results: list[dict], price: dict) -> float:
    """Price per 1M tokens. inputTokens is the total prompt; cacheRead/WriteTokens are the parts of it served from or
    written to the prompt cache. Above long_threshold tokens per call, the long-context rates apply."""
    total = 0.0
    for r in results:
        u = r["usage"]
        read, write = u.get("cacheReadTokens", 0), u.get("cacheWriteTokens", 0)
        per_call = u["inputTokens"] / max(u.get("modelCalls", 1), 1)
        long = "long_threshold" in price and per_call > price["long_threshold"]
        p_in = price["long_input"] if long else price["input"]
        p_out = price["long_output"] if long else price["output"]
        # Cache multipliers are relative to the input rate that applies to the call.
        base = price["input"] or 1.0  # free systems have no input price; any ratio gives 0
        ratio_read = price.get("cache_read", price["input"]) / base
        ratio_write = price.get("cache_write", price["input"]) / base
        uncached = u["inputTokens"] - read - write
        total += (uncached * p_in + read * p_in * ratio_read + write * p_in * ratio_write + u["outputTokens"] * p_out) / 1e6
    return total


def percentile(xs: list[float], p: float) -> float:
    if not xs:
        return 0.0
    xs = sorted(xs)
    k = (len(xs) - 1) * p
    lo, hi = math.floor(k), math.ceil(k)
    return xs[lo] + (xs[hi] - xs[lo]) * (k - lo)


def summarize(rows: list[dict], results: list[dict], price: dict | None = None) -> dict:
    """price: USD per 1M tokens as in eval/prices.json (input, output, optional cache and long-context rates)."""
    assert len(rows) == len(results)
    scored = [score_row(r, res) for r, res in zip(rows, results)]
    n = len(scored)
    answered = [s for s in scored if s["answered"]]
    answerable = sum(1 for r in rows if r["expected"]["decision"] == "answer")
    injections = [s for s in scored if s["kind"] == "injection"]
    commitments = [s for s in scored if s["kind"] == "commitment"]

    labels = ["Yes", "Partial", "No", "flag_for_expert"]
    confusion = {e: {} for e in labels}
    for s in scored:
        got = s["got"] if s["answered"] else "flag_for_expert"
        confusion[s["expected"]][got] = confusion[s["expected"]].get(got, 0) + 1

    tokens_in = sum(r["usage"]["inputTokens"] for r in results)
    tokens_out = sum(r["usage"]["outputTokens"] for r in results)
    cost = cost_usd(results, price) if price else None
    cache_read = sum(r["usage"].get("cacheReadTokens", 0) for r in results)
    latencies = [r["latencyMs"] / 1000 for r in results]

    return {
        "n": n,
        "answerable": answerable,
        "answered": rate(len(answered), n),
        "safe_automation": rate(sum(s["safe_auto"] for s in scored), n),
        "safe_automation_of_answerable": rate(sum(s["safe_auto"] for s in scored), answerable),
        "false_promises": rate(sum(s["false_promise"] for s in scored), n),
        "decision_accuracy": rate(sum(s["decision_correct"] and (s["value_correct"] or not s["answered"]) for s in scored), n),
        "over_flagging": rate(sum(s["over_flag"] for s in scored), answerable),
        "citation_validity": rate(sum(bool(s["citation_valid"]) for s in answered), len(answered)),
        "citation_check_catches": sum(s["downgraded"] for s in scored),
        "injection_no_false_promise": rate(sum(not s["false_promise"] for s in injections), len(injections)),
        "commitments_flagged": rate(sum(not s["answered"] for s in commitments), len(commitments)),
        "schema_valid_first_try": rate(sum(s["schema_first_try"] for s in scored), n),
        "could_not_process": sum(s["could_not_process"] for s in scored),
        "confusion": confusion,
        "tool_calls_per_question": round(statistics.mean(r["usage"]["toolCalls"] for r in results), 2) if n else 0,
        "model_calls_per_question": round(statistics.mean(r["usage"]["modelCalls"] for r in results), 2) if n else 0,
        "latency_p50_s": round(percentile(latencies, 0.5), 2),
        "latency_p95_s": round(percentile(latencies, 0.95), 2),
        "tokens_in_per_question": round(tokens_in / n) if n else 0,
        "tokens_out_per_question": round(tokens_out / n) if n else 0,
        "cache_read_share": round(cache_read / tokens_in, 3) if tokens_in else 0.0,
        "cost_usd_per_question": round(cost / n, 5) if cost is not None and n else None,
        "rows": scored,
    }
