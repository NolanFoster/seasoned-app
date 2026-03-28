"""Tests for duplicate dataset input_text grouping (Opik grocery rows)."""

from __future__ import annotations

import json
import unittest
from typing import Any

from grocery_opik_helpers import duplicate_input_text_group_count, no_duplicate_entries_score


class TestDuplicateInputTextGroupCount(unittest.TestCase):
    def test_empty_and_no_duplicates(self) -> None:
        self.assertEqual(duplicate_input_text_group_count([]), 0)
        self.assertEqual(
            duplicate_input_text_group_count(
                [
                    {"id": "a", "input_text": "1 lime"},
                    {"id": "b", "input_text": "2 eggs"},
                ]
            ),
            0,
        )

    def test_two_rows_same_input_one_group(self) -> None:
        self.assertEqual(
            duplicate_input_text_group_count(
                [
                    {"id": "a", "input_text": "1 lime"},
                    {"id": "b", "input_text": "1 lime"},
                ]
            ),
            1,
        )

    def test_normalization_strip_and_case(self) -> None:
        self.assertEqual(
            duplicate_input_text_group_count(
                [
                    {"id": "a", "input_text": " 1 Lime \n"},
                    {"id": "b", "input_text": "1 lime"},
                ]
            ),
            1,
        )

    def test_two_separate_duplicate_groups(self) -> None:
        self.assertEqual(
            duplicate_input_text_group_count(
                [
                    {"id": "1", "input_text": "salt"},
                    {"id": "2", "input_text": "salt"},
                    {"id": "3", "input_text": "pepper"},
                    {"id": "4", "input_text": "pepper"},
                ]
            ),
            2,
        )

    def test_ignores_missing_or_blank_input_text(self) -> None:
        row_none: dict[str, Any] = {"id": "d", "input_text": None}
        junk: list[Any] = [
            {"id": "a", "input_text": ""},
            {"id": "b", "input_text": "   "},
            {"id": "c"},
            row_none,
            "not-a-dict",
            {"id": "e", "input_text": "only-once"},
        ]
        self.assertEqual(duplicate_input_text_group_count(junk), 0)

    def test_triplicate_counts_as_one_group(self) -> None:
        self.assertEqual(
            duplicate_input_text_group_count(
                [
                    {"input_text": "x"},
                    {"input_text": "x"},
                    {"input_text": "x"},
                ]
            ),
            1,
        )


class TestNoDuplicateEntriesScore(unittest.TestCase):
    def test_invalid_output(self) -> None:
        self.assertEqual(no_duplicate_entries_score(""), 0.0)
        self.assertEqual(no_duplicate_entries_score("not json"), 0.0)

    def test_all_unique(self) -> None:
        payload = json.dumps(
            [
                {
                    "category": "Produce",
                    "items": [
                        {"name": "lime", "quantity": "1", "isStaple": False},
                        {"name": "cilantro", "quantity": "1 bunch", "isStaple": False},
                    ],
                }
            ]
        )
        self.assertEqual(no_duplicate_entries_score(payload), 1.0)

    def test_duplicate_across_categories(self) -> None:
        payload = json.dumps(
            [
                {
                    "category": "Produce",
                    "items": [{"name": "Lime", "quantity": "1", "isStaple": False}],
                },
                {
                    "category": "Pantry Staples",
                    "items": [{"name": "lime", "quantity": "2 tbsp juice", "isStaple": False}],
                },
            ]
        )
        self.assertEqual(no_duplicate_entries_score(payload), 0.5)

    def test_duplicate_within_category(self) -> None:
        payload = json.dumps(
            [
                {
                    "category": "Produce",
                    "items": [
                        {"name": "lime", "quantity": "1", "isStaple": False},
                        {"name": "lime", "quantity": "2", "isStaple": False},
                    ],
                }
            ]
        )
        self.assertEqual(no_duplicate_entries_score(payload), 0.5)

    def test_triplicate_ratio(self) -> None:
        payload = json.dumps(
            [
                {
                    "category": "Produce",
                    "items": [
                        {"name": "salt", "quantity": "1", "isStaple": True},
                        {"name": "salt", "quantity": "1 pinch", "isStaple": True},
                        {"name": "salt", "quantity": "to taste", "isStaple": True},
                    ],
                }
            ]
        )
        self.assertEqual(no_duplicate_entries_score(payload), round(1 / 3, 4))


if __name__ == "__main__":
    unittest.main()
