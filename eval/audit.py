"""Re-score saved held-out results without the questions affected by known label conflicts. No model calls.

Reading the held-out errors showed two places where the generator wrote documents that contradict each other
across controls, while the labels assume they agree:

- enc_rest (full) says all data at rest is encrypted "including backups", but backup_enc (partial) says document
  archive backups are stored unencrypted. Questions on either control have a defensible "contradiction" flag.
- ir_plan (contradict) has a sales FAQ saying no incident response program exists, which also undercuts the
  ir_test questions labelled a plain Yes.

The held-out files stay frozen and the headline numbers are still scored on every question. The rule below is by
control, not by outcome, and is applied identically to every system, so it does not favour any one of them.
Run after `python -m eval.run --set heldout ...`:

    python -m eval.audit
"""

import json

from eval.metrics import apply_citation_check, summarize
from eval.run import RAW, RESULTS, always_flag, load_rows, prices, write_markdown

AUDIT = {
    "heldout": {
        "controls": {"enc_rest", "backup_enc", "ir_test"},
        "reason": "documents contradict each other across controls (generator issue found after the run)",
    },
}


def audited_rows(rows: list[dict], controls: set[str]) -> tuple[list[dict], list[str]]:
    kept = [r for r in rows if not controls & set(r["controls"])]
    excluded = [r["id"] for r in rows if controls & set(r["controls"])]
    return kept, excluded


def audit_entries(set_name: str, rows: list[dict], raw: dict[str, tuple[list[dict], str]], controls: set[str],
                  prices: dict) -> dict:
    """raw maps system -> (results in row order, model id)."""
    kept, excluded = audited_rows(rows, controls)
    kept_ids = {r["id"] for r in kept}
    out = {}
    for system, (results, model) in raw.items():
        if len(results) != len(rows):
            raise ValueError(f"{system}: {len(results)} results for {len(rows)} questions")
        pairs = [(r, res) for r, res in zip(rows, results) if r["id"] in kept_ids]
        summary = summarize([p[0] for p in pairs], [p[1] for p in pairs], prices.get(model))
        out[f"{set_name}/{system}/{model}/audited"] = {
            "set": set_name, "system": system, "model": model, "scale": 1, "limit": None, "subset": "audited",
            "excluded": excluded, "summary": summary,
        }
    return out


def load_raw(set_name: str, rows: list[dict]) -> dict[str, tuple[list[dict], str]]:
    """Saved unpadded runs for this set, keyed by system (one model per system on the held-out set)."""
    raw = {}
    for path in sorted(RAW.glob(f"{set_name}__*.json")):
        parts = path.stem.split("__")
        if len(parts) != 3:  # padded-KB runs carry an __xN suffix; the audit covers the unpadded runs
            continue
        system = parts[1]
        if system in raw:
            raise ValueError(f"more than one saved {system} run for {set_name}; the audit expects one per system")
        data = json.loads(path.read_text())
        raw[system] = (data["results"], data["model"])
        if system == "paste_all":
            raw["paste_all+check"] = (apply_citation_check(data["results"]), data["model"])
    raw["always_flag"] = (always_flag(rows), "none")
    return raw


def main() -> None:
    out_path = RESULTS / "eval.json"
    all_results = json.loads(out_path.read_text())
    for set_name, rule in AUDIT.items():
        rows = load_rows(set_name)
        entries = audit_entries(set_name, rows, load_raw(set_name, rows), rule["controls"], prices())
        all_results = {k: v for k, v in all_results.items() if not (v["set"] == set_name and v.get("subset") == "audited")}
        all_results.update(entries)
        for key, e in entries.items():
            s = e["summary"]
            print(f"{key}: safe automation {s['safe_automation']['count']}/{s['n']}, "
                  f"false promises {s['false_promises']['count']}/{s['n']}")
    out_path.write_text(json.dumps(all_results, indent=2) + "\n")
    write_markdown({k: v for k, v in all_results.items() if not v.get("limit")})
    print(f"wrote {out_path.relative_to(RESULTS.parent)} and results/eval.md")


if __name__ == "__main__":
    main()
