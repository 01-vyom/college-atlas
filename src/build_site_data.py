#!/usr/bin/env python3
"""Convert the shortlist CSV into the static website data file."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "outputs" / "college_shortlist.csv"
JS_PATH = ROOT / "assets" / "college-data.js"


NUMERIC_FIELDS = {
    "rank": int,
    "score": float,
    "admit_rate": float,
    "completion_rate": float,
    "retention_rate": float,
    "sat_avg": float,
    "undergrad_size": float,
    "earnings_10yr": float,
    "tuition_in": float,
    "tuition_out": float,
    "net_price": float,
    "materials_score": float,
    "biology_score": float,
    "profile_score": float,
    "outcomes_score": float,
    "access_score": float,
    "ca_value_score": float,
    "materials_awards": float,
    "biology_awards": float,
    "neuro_awards": float,
}


def parse_value(key: str, value: str) -> Any:
    value = value.strip()
    if not value:
        return None
    parser = NUMERIC_FIELDS.get(key)
    if parser is None:
      return value
    number = parser(value)
    if parser is float:
        return round(number, 4)
    return number


def main() -> None:
    with CSV_PATH.open(newline="") as f:
        rows = [
            {key: parse_value(key, value) for key, value in row.items()}
            for row in csv.DictReader(f)
        ]

    JS_PATH.parent.mkdir(parents=True, exist_ok=True)
    JS_PATH.write_text("window.COLLEGE_DATA = " + json.dumps(rows, indent=2) + ";\n")
    print(f"Wrote {JS_PATH} with {len(rows)} schools")


if __name__ == "__main__":
    main()
