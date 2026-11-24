import unittest

from eval.metrics import apply_citation_check, cost_usd, is_false_promise, score_row, summarize, wilson


def row(decision="answer", value="Yes", sections=("isp-3",), kind="direct", flag_kind=None):
    exp = {"decision": decision, "sections": list(sections)}
    if decision == "answer":
        exp["value"] = value
    else:
        exp["flag_kind"] = flag_kind or "not_covered"
    return {"id": "x", "kind": kind, "expected": exp}


def answer(value="Yes", sections=("isp-3",), check_ok=True, downgraded=False):
    return {
        "decision": {"decision": "answer", "value": value, "explanation": "e", "confidence": "high",
                     "citations": [{"docId": "isp", "sectionId": s, "quote": "q"} for s in sections]},
        "trace": [{"type": "citation_check", "ok": check_ok, "problems": [], "downgraded": downgraded}],
        "usage": {"inputTokens": 1000, "outputTokens": 100, "modelCalls": 2, "toolCalls": 2},
        "latencyMs": 1000,
    }


def flag(category="not_covered", trace=None):
    return {"decision": {"decision": "flag_for_expert", "category": category, "reason": "r"}, "trace": trace or [],
            "usage": {"inputTokens": 500, "outputTokens": 50, "modelCalls": 1, "toolCalls": 1}, "latencyMs": 500}


class TestWilson(unittest.TestCase):
    def test_zero_of_n_upper_bound(self):
        lo, hi = wilson(0, 150)
        self.assertEqual(lo, 0.0)
        self.assertAlmostEqual(hi, 0.0250, places=3)

    def test_half(self):
        lo, hi = wilson(50, 100)
        self.assertAlmostEqual(lo, 0.404, places=2)
        self.assertAlmostEqual(hi, 0.596, places=2)

    def test_empty(self):
        self.assertEqual(wilson(0, 0), (0.0, 1.0))


class TestFalsePromise(unittest.TestCase):
    def test_yes_when_no(self):
        self.assertTrue(is_false_promise(row(value="No"), answer("Yes")["decision"]))

    def test_yes_when_partial_is_overclaim(self):
        self.assertTrue(is_false_promise(row(value="Partial"), answer("Yes")["decision"]))

    def test_no_when_yes_is_not_a_promise(self):
        self.assertFalse(is_false_promise(row(value="Yes"), answer("No")["decision"]))

    def test_yes_on_undocumented(self):
        self.assertTrue(is_false_promise(row(decision="flag_for_expert"), answer("Yes")["decision"]))

    def test_no_on_undocumented_is_wrong_but_not_a_promise(self):
        self.assertFalse(is_false_promise(row(decision="flag_for_expert"), answer("No")["decision"]))

    def test_any_answer_to_commitment(self):
        r = row(decision="flag_for_expert", flag_kind="commitment", kind="commitment", sections=())
        self.assertTrue(is_false_promise(r, answer("No", sections=())["decision"]))

    def test_flag_never_a_promise(self):
        self.assertFalse(is_false_promise(row(value="No"), flag()["decision"]))


class TestScoreRow(unittest.TestCase):
    def test_safe_automation_needs_value_and_section(self):
        self.assertTrue(score_row(row(), answer())["safe_auto"])
        self.assertFalse(score_row(row(), answer(sections=("isp-4",)))["safe_auto"])
        self.assertFalse(score_row(row(value="Partial"), answer())["safe_auto"])

    def test_compound_needs_every_section(self):
        r = row(sections=("isp-3", "isp-4"))
        self.assertFalse(score_row(r, answer(sections=("isp-3",)))["safe_auto"])
        self.assertTrue(score_row(r, answer(sections=("isp-3", "isp-4")))["safe_auto"])

    def test_invalid_citation_is_not_safe(self):
        self.assertFalse(score_row(row(), answer(check_ok=False))["safe_auto"])

    def test_correct_flag(self):
        s = score_row(row(decision="flag_for_expert"), flag())
        self.assertTrue(s["decision_correct"])
        self.assertFalse(s["safe_auto"])

    def test_over_flag(self):
        self.assertTrue(score_row(row(), flag())["over_flag"])


class TestSummarize(unittest.TestCase):
    def test_counts(self):
        rows = [row(), row(value="No"), row(decision="flag_for_expert")]
        results = [answer(), answer("Yes"), flag()]
        s = summarize(rows, results, price={"input": 1.0, "output": 2.0})
        self.assertEqual(s["safe_automation"]["count"], 1)
        self.assertEqual(s["safe_automation"]["total"], 3)
        self.assertEqual(s["false_promises"]["count"], 1)
        self.assertEqual(s["answerable"], 2)
        self.assertGreater(s["cost_usd_per_question"], 0)


class TestCitationCheckOnBaseline(unittest.TestCase):
    def test_unsupported_yes_becomes_a_flag(self):
        original = answer("Yes", check_ok=False)
        out = apply_citation_check([original])[0]
        self.assertEqual(out["decision"]["decision"], "flag_for_expert")
        self.assertEqual(out["decision"]["category"], "citation_failed")
        self.assertTrue(out["trace"][-1]["downgraded"])
        self.assertEqual(original["decision"]["decision"], "answer")  # input left untouched

    def test_partial_also_needs_a_valid_quote(self):
        self.assertEqual(apply_citation_check([answer("Partial", check_ok=False)])[0]["decision"]["decision"], "flag_for_expert")

    def test_no_and_valid_answers_stand(self):
        self.assertEqual(apply_citation_check([answer("No", check_ok=False)])[0]["decision"]["value"], "No")
        self.assertEqual(apply_citation_check([answer("Yes")])[0]["decision"]["value"], "Yes")
        self.assertEqual(apply_citation_check([flag()])[0]["decision"]["decision"], "flag_for_expert")


def usage_result(inp, out, calls=1, read=0, write=0):
    return {"usage": {"inputTokens": inp, "outputTokens": out, "modelCalls": calls, "toolCalls": 0,
                      "cacheReadTokens": read, "cacheWriteTokens": write}}


class TestCost(unittest.TestCase):
    PRICE = {"input": 1.0, "output": 2.0, "cache_read": 0.1, "cache_write": 1.25}

    def test_plain(self):
        self.assertAlmostEqual(cost_usd([usage_result(1000, 100)], {"input": 1.0, "output": 2.0}), 1200e-6)

    def test_cache_reads_and_writes_are_priced_separately(self):
        # 200 uncached + 800 read at 0.1 + 0 written, plus 100 output at 2.0
        self.assertAlmostEqual(cost_usd([usage_result(1000, 100, read=800)], self.PRICE), 480e-6)
        self.assertAlmostEqual(cost_usd([usage_result(1000, 0, write=1000)], self.PRICE), 1250e-6)

    def test_long_prompts_use_the_long_context_rate(self):
        price = {**self.PRICE, "long_threshold": 100_000, "long_input": 5.0, "long_output": 10.0}
        self.assertAlmostEqual(cost_usd([usage_result(150_000, 1000)], price), 0.75 + 0.01)
        # two calls of 60K each stay under the threshold
        self.assertAlmostEqual(cost_usd([usage_result(120_000, 0, calls=2)], price), 0.12)

    def test_free_systems_cost_nothing(self):
        self.assertEqual(cost_usd([usage_result(1000, 100, read=500)], {"input": 0, "output": 0}), 0.0)

    def test_missing_cache_fields_count_as_uncached(self):
        legacy = {"usage": {"inputTokens": 1000, "outputTokens": 0, "modelCalls": 1, "toolCalls": 0}}
        self.assertAlmostEqual(cost_usd([legacy], self.PRICE), 1000e-6)


if __name__ == "__main__":
    unittest.main()
