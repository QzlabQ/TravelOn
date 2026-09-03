#!/usr/bin/env python3
"""Expand the ticket_offers.csv templates into a dated booking window.

Source of truth: seed-data/transport/{plane,train}/ticket_offers.csv. Each row in
those files is treated as a recurring schedule template -- only its time-of-day,
route, carrier, code, seat class, price and total seats matter; the date baked
into the template is ignored.

For every template we emit one row per calendar day in the booking window, so
the booking flow can query real dates. Both remaining seats and price are varied
per (code, route, seat class, date) so each day differs instead of being
identical across the whole window -- the template price is the baseline the
daily price fluctuates around.

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


# 单个班次单天的价格浮动幅度。模板里的价格是这条线路的基准价，展开后每个
# （班次, 舱位/席别, 日期）都在基准价上下浮动一次。
PRICE_SPREAD = 0.20

# 价格取整步长：机票按 10 元、火车票按 5 元，和模板里的定价习惯保持一致。
PRICE_STEP = {"FLIGHT": 10, "TRAIN": 5}


def price_for(ticket_type: str, base_price: str, code: str, route_key: str, date_iso: str) -> str:
    """同一班次不同日期、同一线路不同班次的价格都应该不一样。

    模板里一条线路的票价是一个固定值，直接按日期展开的话，整块数据看上去就是
    "同一航线所有航班同价、且 40 天都同价"，一眼假。这里用和 remaining_for 同样的
    确定性哈希做浮动：输入相同结果就相同，重跑不会产生无意义的巨大 diff。
    """
    try:
        base = float(base_price)
    except ValueError:
        return base_price
    if base <= 0:
        return base_price

    digest = int(
        hashlib.md5(f"price|{code}|{route_key}|{date_iso}".encode("utf-8")).hexdigest()[:8],
        16,
    )
    ratio = 1 + ((digest % 1001) / 1000.0 * 2 - 1) * PRICE_SPREAD
    step = PRICE_STEP.get(ticket_type, 10)
    return str(max(step, round(base * ratio / step) * step))


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
            dated_price = price_for(ticket_type, price, code, route_key, date_iso)
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
                    dated_price,
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
