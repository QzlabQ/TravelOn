#!/usr/bin/env python3
"""One-off migration: add departure/arrival StationName columns to the template
ticket_offers.csv files.

Each legacy row stored either an IATA code or a full airport/station name in the
single "stationCode" column. This rewrites every row into the 17-column format:
a clean (possibly empty) IATA code plus an always-present station name. Row count
is unchanged -- only columns are added/split.
"""

from __future__ import annotations

import csv
from pathlib import Path

from airport_catalog import HEADER, load_city_id_to_name, normalize_legacy_row


ROOT = Path(__file__).resolve().parents[1]
CITIES_CSV = ROOT / "seed-data" / "common" / "cities.csv"
TEMPLATE_FILES = [
    ROOT / "seed-data" / "transport" / "plane" / "ticket_offers.csv",
    ROOT / "seed-data" / "transport" / "train" / "ticket_offers.csv",
]


def main() -> None:
    city_id_to_name = load_city_id_to_name(CITIES_CSV)

    for path in TEMPLATE_FILES:
        with path.open(encoding="utf-8", newline="") as handle:
            rows = list(csv.reader(handle, delimiter="\t"))

        data_rows = [row for row in rows[1:] if len(row) >= 15]
        upgraded = [normalize_legacy_row(row, city_id_to_name) for row in data_rows]

        with path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.writer(handle, delimiter="\t", lineterminator="\n")
            writer.writerow(HEADER)
            writer.writerows(upgraded)

        print(f"{path.relative_to(ROOT)}: {len(upgraded)} rows -> 17 columns")


if __name__ == "__main__":
    main()
