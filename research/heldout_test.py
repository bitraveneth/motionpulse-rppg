"""The held-out miss is one number per person, not one number per window."""

from __future__ import annotations

import unittest

from research.heldout import subject_mae


class HeldoutTests(unittest.TestCase):
    def test_mean_absolute_miss_across_people(self) -> None:
        scored = subject_mae(
            [
                {"name": "a", "windows": 2, "bpm": 80.0, "reference": 90.0},
                {"name": "b", "windows": 1, "bpm": 70.0, "reference": 70.0},
            ]
        )
        self.assertEqual(scored["count"], 2)
        self.assertEqual(scored["mae"], 5.0)

    def test_empty_people_have_no_miss(self) -> None:
        scored = subject_mae([])
        self.assertIsNone(scored["mae"])
        self.assertEqual(scored["count"], 0)


if __name__ == "__main__":
    unittest.main()
