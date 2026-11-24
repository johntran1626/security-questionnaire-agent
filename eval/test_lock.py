import hashlib
import tempfile
import unittest
from pathlib import Path

from eval.run import check_lock, heldout_files
from eval.distractors import update_lock


def digest(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


class HeldoutLockTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.a = self.tmp / "a.json"
        self.a.write_bytes(b"frozen")

    def test_matching_hash_passes(self):
        self.assertIsNone(check_lock(f"{digest(b'frozen')}  a.json\n", {"a.json": self.a}))

    def test_changed_file_is_refused(self):
        self.a.write_bytes(b"edited")
        err = check_lock(f"{digest(b'frozen')}  a.json\n", {"a.json": self.a})
        self.assertIn("changed since it was frozen", err)

    def test_file_without_a_lock_entry_is_refused(self):
        err = check_lock("", {"a.json": self.a})
        self.assertIn("not frozen", err)

    def test_missing_file_says_how_to_rebuild(self):
        err = check_lock(f"{digest(b'x')}  b.json\n", {"b.json": self.tmp / "b.json"})
        self.assertIn("eval.distractors", err)

    def test_padded_runs_also_check_the_padded_file(self):
        self.assertEqual(set(heldout_files(1)), {"heldout.jsonl", "tidemark.json"})
        self.assertEqual(set(heldout_files(50)), {"heldout.jsonl", "tidemark.json", "tidemark-x50.json"})


class UpdateLockTest(unittest.TestCase):
    def test_adds_new_entries_and_replaces_existing_ones(self):
        text = "aaa  heldout.jsonl\nbbb  tidemark.json\nccc  tidemark-x10.json\n"
        out = update_lock(text, {"tidemark-x10.json": "ddd", "tidemark-x50.json": "eee"})
        self.assertEqual(out, "aaa  heldout.jsonl\nbbb  tidemark.json\nddd  tidemark-x10.json\neee  tidemark-x50.json\n")


if __name__ == "__main__":
    unittest.main()
