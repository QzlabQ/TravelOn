#!/usr/bin/env python3
"""Expand the ticket_offers.csv templates into a dated booking window.

Source of truth: seed-data/transport/{plane,train}/ticket_offers.csv. Each row in
those files is treated as a recurring schedule template -- only its time-of-day,
route, carrier, code, seat class, price and total seats matter; the date baked
into the template is ignored.

For every template we emit one row per calendar day in the booking window, so
the booking flow can query real dates. Remaining seats are varied per
(code, route, seat class, date) so each day's availability differs instead of
being identical across the whole window.

The window is relative to the day this script runs, not a fixed date range: a
hard-coded range silently expires and every transport query then returns an
empty result, which surfaces as a pile of unrelated test failures rather than
one clear error. tests/test_seed_window.py guards the committed CSVs and tells
you to re-run this script before that happens.

No JSON sources are used -- this script reads CSV only.
"""

from __future__ import annotations

import csv
import hashlib
from datetime import datetime, timedelta
from pathlib import Path

from airport_catalog import HEADER


ROOT = Path(__file__).resolve().parents[1]

TEMPLATES = {
    "FLIGHT": ROOT / "seed-data" / "transport" / "plane" / "ticket_offers.csv",
    "TRAIN": ROOT / "seed-data" / "transport" / "train" / "ticket_offers.csv",
}
OUTPUTS = {
    "FLIGHT": ROOT / "seed-data" / "transport" / "plane" / "generated_ticket_offers.csv",
    "TRAIN": ROOT / "seed-data" / "transport" / "train" / "generated_ticket_offers.csv",
}

# Inclusive booking window, expressed as offsets from the generation date.
# A few days in the past keep already-departed trips visible in order history;
# the future span is what the booking flow can actually query. Each extra day
# adds roughly 1 MB to each generated CSV, so the span is deliberately modest --
# widen it only together with a plan for the file size.
WINDOW_START_OFFSET = timedelta(days=-3)
WINDOW_END_OFFSET = timedelta(days=38)


def booking_window(today: datetime | None = None) -> tuple[datetime, datetime]:
    base = (today or datetime.now()).replace(hour=0, minute=0, second=0, microsecond=0)
    return base + WINDOW_START_OFFSET, base + WINDOW_END_OFFSET


def date_range(start: datetime, end: datetime):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def remaining_for(code: str, route_key: str, date_iso: str, total_seats: int) -> int:
    """Deterministic per-day availability so each date looks different."""
    if total_seats <= 0:
        return 0
    digest = int(
        hashlib.md5(f"{code}|{route_key}|{date_iso}".encode("utf-8")).hexdigest()[:8],
        16,
    )
    ratio = (digest % 101) / 100.0
    return max(0, min(total_seats, round(total_seats * ratio)))


def read_templates(path: Path) -> list[list[str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.reader(handle, delimiter="\t"))
    return [row for row in rows[1:] if len(row) >= len(HEADER)]


def build_rows(
    ticket_type: str,
    templates: list[list[str]],
    start_date: datetime,
    end_date: datetime,
) -> list[list[str]]:
    rows: list[list[str]] = []
    for template in templates:
        (
            _type,
            departure_city_id,
            arrival_city_id,
            departure_station_code,
            departure_terminal_name,
            arrival_station_code,
            arrival_terminal_name,
            departure_date_time,
            arrival_date_time,
            carrier,
            code,
            seat_class,
            price,
            _remaining_seats,
            total_seats,
            departure_station_name,
            arrival_station_name,
        ) = template[: len(HEADER)]

        template_departure = datetime.fromisoformat(departure_date_time)
        template_arrival = datetime.fromisoformat(arrival_date_time)
        duration = template_arrival - template_departure
        if duration.total_seconds() <= 0:
            # Overnight trip: template stored arrival as same-day, push to next day.
            duration += timedelta(days=1)

        total = int(total_seats)
        route_key = f"{departure_city_id}-{arrival_city_id}-{seat_class}"

        for day in date_range(start_date, end_date):
            departure = day.replace(
                hour=template_departure.hour,
                minute=template_departure.minute,
                second=0,
                microsecond=0,
            )
            arrival = departure + duration
            date_iso = day.strftime("%Y-%m-%d")
            remaining = remaining_for(code, route_key, date_iso, total)
            rows.append(
                [
                    ticket_type,
                    departure_city_id,
                    arrival_city_id,
                    departure_station_code,
                    departure_terminal_name,
                    arrival_station_code,
                    arrival_terminal_name,
                    departure.strftime("%Y-%m-%dT%H:%M:%S"),
                    arrival.strftime("%Y-%m-%dT%H:%M:%S"),
                    carrier,
                    code,
                    seat_class,
                    price,
                    str(remaining),
                    str(total),
                    departure_station_name,
                    arrival_station_name,
                ]
            )
    return rows


def main() -> None:
    start_date, end_date = booking_window()
    day_count = (end_date - start_date).days + 1
    print(
        f"booking window: {start_date:%Y-%m-%d} .. {end_date:%Y-%m-%d} ({day_count} days)"
    )
    for ticket_type, template_path in TEMPLATES.items():
        if not template_path.exists():
            raise FileNotFoundError(f"Missing template seed: {template_path}")
        templates = read_templates(template_path)
        rows = build_rows(ticket_type, templates, start_date, end_date)

        output_path = OUTPUTS[ticket_type]
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with output_path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.writer(handle, delimiter="\t", lineterminator="\n")
            writer.writerow(HEADER)
            writer.writerows(rows)

        print(
            f"{ticket_type}: {len(templates)} templates x {day_count} days "
            f"= {len(rows)} rows -> {output_path.relative_to(ROOT)}"
        )


if __name__ == "__main__":
    main()
