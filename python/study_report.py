"""
================================================================
STUDY_REPORT.PY
================================================================
A small command-line utility, separate from the web app, that
reads the JSON file produced by the "Exportar dados" button in
the browser and prints a human-readable study report.

WHY A SEPARATE PYTHON SCRIPT?
The web app (HTML/CSS/JS) already shows a live dashboard, so this
script isn't required to use the app day-to-day. It exists as a
second, independent way to analyze the SAME data -- useful for
practicing Python, and a realistic pattern in real projects: a
lightweight app that exports data, and separate scripts/tools that
consume that export for reporting, backups, or migrations.

USAGE (from a terminal, inside the python/ folder):
    python study_report.py path/to/study-system-export-2026-07-09.json

If no path is given, it looks for a file named "export.json" in the
current folder as a convenient default.
================================================================
"""

import json
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path


def load_export(file_path: Path) -> dict:
    """Reads and parses the JSON export file.

    Using a dedicated function (instead of inlining this in main())
    makes it easy to unit-test this piece in isolation later, and
    keeps error handling for "bad file" in exactly one place.
    """
    if not file_path.exists():
        print(f"File not found: {file_path}")
        sys.exit(1)

    with file_path.open("r", encoding="utf-8") as f:
        return json.load(f)


def summarize_counts(data: dict) -> None:
    """Prints how many subjects, notes and flashcards exist."""
    print("=" * 50)
    print("STUDY SYSTEM — REPORT")
    print("=" * 50)
    print(f"Exported at: {data.get('exportedAt', 'unknown')}")
    print()
    print(f"Subjects:   {len(data.get('subjects', []))}")
    print(f"Notes:      {len(data.get('notes', []))}")
    print(f"Flashcards: {len(data.get('flashcards', []))}")
    print()


def cards_per_subject(data: dict) -> None:
    """Groups flashcards by subject and prints a small bar-style table."""
    subjects = {s["id"]: s["name"] for s in data.get("subjects", [])}
    counter = defaultdict(int)

    for card in data.get("flashcards", []):
        counter[card.get("subjectId")] += 1

    print("Flashcards by subject:")
    for subject_id, count in counter.items():
        name = subjects.get(subject_id, "Unknown subject")
        bar = "#" * count
        print(f"  {name:<25} {bar} ({count})")
    print()


def due_cards_today(data: dict) -> None:
    """Lists flashcards whose dueDate is today or earlier (overdue)."""
    today_str = date.today().isoformat()
    due = [c for c in data.get("flashcards", []) if c.get("dueDate", "") <= today_str]

    print(f"Cards due for review today ({len(due)}):")
    if not due:
        print("  Nothing pending. Nice work!")
    for card in due[:10]:
        front = card.get("front", "")[:60]
        print(f"  - [{card.get('dueDate')}] {front}")
    print()


def study_streak(data: dict) -> None:
    """Recomputes the daily study streak from the sessions list,
    independent of what the browser calculated -- a good way to
    sanity-check the JS implementation in js/storage.js.
    """
    sessions = {s["date"] for s in data.get("sessions", []) if s.get("pomodoros", 0) > 0}

    streak = 0
    cursor = date.today()
    while cursor.isoformat() in sessions:
        streak += 1
        cursor -= timedelta(days=1)

    print(f"Current streak: {streak} day(s) in a row")
    print()


def total_pomodoros(data: dict) -> None:
    """Sums every pomodoro ever logged, across all days."""
    total = sum(s.get("pomodoros", 0) for s in data.get("sessions", []))
    print(f"Total focus sessions (pomodoros) completed: {total}")
    print()


def main() -> None:
    # sys.argv[0] is always the script name itself, so a real
    # argument means the list has more than one element.
    file_arg = sys.argv[1] if len(sys.argv) > 1 else "export.json"
    file_path = Path(file_arg)

    data = load_export(file_path)

    summarize_counts(data)
    cards_per_subject(data)
    due_cards_today(data)
    study_streak(data)
    total_pomodoros(data)


if __name__ == "__main__":
    main()
