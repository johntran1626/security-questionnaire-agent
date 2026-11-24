import json
import re
import unittest
from pathlib import Path

from eval.distractors import BANNED, kb_chars, scale_kb

ROOT = Path(__file__).resolve().parent.parent
BASE = json.loads((ROOT / "src" / "data" / "kb" / "kestrelbyte.json").read_text())


def base_sections(kb: dict) -> dict:
    return {(d["id"], s["id"]): s for d in kb["docs"] for s in d["sections"]}


class TestScaleKb(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.x10 = scale_kb(BASE, 10, seed=7)

    def test_keeps_every_original_section_unchanged(self):
        # Labels point at the original section ids, so padding must not move, rename or edit them.
        original = base_sections(BASE)
        scaled = base_sections(self.x10)
        for key, section in original.items():
            self.assertEqual(scaled[key], section)
        titles = {d["id"]: d["title"] for d in self.x10["docs"]}
        for d in BASE["docs"]:
            self.assertEqual(titles[d["id"]], d["title"])

    def test_reaches_the_target_size(self):
        ratio = kb_chars(self.x10) / kb_chars(BASE)
        self.assertGreater(ratio, 9.0)
        self.assertLess(ratio, 11.0)

    def test_distractors_never_mention_a_security_control(self):
        # A distractor that said anything about encryption, SSO, backups, ... could contradict a label.
        originals = {d["id"] for d in BASE["docs"]}
        pattern = re.compile("|".join(BANNED), re.IGNORECASE)
        for d in self.x10["docs"]:
            if d["id"] in originals:
                continue
            for s in [d["title"]] + [x for sec in d["sections"] for x in (sec["heading"], sec["text"])]:
                self.assertIsNone(pattern.search(s), f"{d['id']}: {s!r}")

    def test_ids_are_unique_and_short(self):
        doc_ids = [d["id"] for d in self.x10["docs"]]
        self.assertEqual(len(doc_ids), len(set(doc_ids)))
        section_ids = [(d["id"], s["id"]) for d in self.x10["docs"] for s in d["sections"]]
        self.assertEqual(len(section_ids), len(set(section_ids)))
        for d in self.x10["docs"]:
            self.assertLessEqual(len(d["id"]), 40)
            for s in d["sections"]:
                self.assertLessEqual(len(s["id"]), 40)

    def test_is_deterministic_and_spreads_original_docs(self):
        self.assertEqual(scale_kb(BASE, 10, seed=7), self.x10)
        positions = [i for i, d in enumerate(self.x10["docs"]) if d["id"] in {b["id"] for b in BASE["docs"]}]
        # Shuffled in among the distractors, not all at the front where paste-everything would see them first.
        self.assertGreater(max(positions), len(self.x10["docs"]) // 2)
        self.assertNotEqual(positions, list(range(len(BASE["docs"]))))

    def test_sections_read_like_prose(self):
        texts = [s["text"] for d in self.x10["docs"] for s in d["sections"]]
        distinct = len(set(texts)) / len(texts)
        self.assertGreater(distinct, 0.95)  # templated, but not copy-pasted


if __name__ == "__main__":
    unittest.main()
