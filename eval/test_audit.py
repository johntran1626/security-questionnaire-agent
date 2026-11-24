import unittest

from eval.audit import AUDIT, audited_rows, audit_entries
from eval.run import load_rows


def row(i, controls):
    return {"id": f"q{i}", "question": f"Q{i}", "kind": "direct", "controls": controls, "states": ["full"] * len(controls),
            "expected": {"decision": "flag_for_expert", "sections": [], "flag_kind": "not_covered"}}


def flag(q):
    return {"question": q, "decision": {"decision": "flag_for_expert", "category": "not_covered", "reason": "x"},
            "trace": [], "usage": {"inputTokens": 0, "outputTokens": 0, "modelCalls": 0, "toolCalls": 0}, "latencyMs": 0}


class AuditTest(unittest.TestCase):
    def test_excludes_any_question_touching_an_audited_control(self):
        rows = [row(1, ["enc_rest"]), row(2, ["scim"]), row(3, ["scim", "backup_enc"]), row(4, ["sso"])]
        kept, excluded = audited_rows(rows, {"enc_rest", "backup_enc"})
        self.assertEqual([r["id"] for r in kept], ["q2", "q4"])
        self.assertEqual(excluded, ["q1", "q3"])

    def test_frozen_heldout_rule_excludes_15(self):
        kept, excluded = audited_rows(load_rows("heldout"), AUDIT["heldout"]["controls"])
        self.assertEqual(len(excluded), 15)
        self.assertEqual(len(kept), 133)

    def test_audit_entries_rescore_only_the_kept_rows_and_are_marked(self):
        rows = [row(1, ["enc_rest"]), row(2, ["scim"])]
        raw = {"agent": ([flag("Q1"), flag("Q2")], "m")}
        entries = audit_entries("heldout", rows, raw, {"enc_rest"}, prices={})
        e = entries["heldout/agent/m/audited"]
        self.assertEqual(e["subset"], "audited")
        self.assertEqual(e["summary"]["n"], 1)
        self.assertEqual(e["excluded"], ["q1"])

    def test_rows_and_results_must_line_up(self):
        with self.assertRaises(ValueError):
            audit_entries("heldout", [row(1, ["scim"])], {"agent": ([], "m")}, set(), prices={})


if __name__ == "__main__":
    unittest.main()
