"""Guard the committed ticket seed data against silent expiry.

The dated ticket offers under seed-data/transport/*/generated_ticket_offers.csv
are produced by scripts/generate_dated_ticket_offers.py for a booking window
relative to the day it ran. Once that window falls behind the calendar, every
transport query returns an empty result and a dozen unrelated API and E2E tests
start failing for reasons that look nothing like "the seed data is stale".

This test needs no services and runs in the `unit` category so the warning
arrives long before the integration stack is even started.
"""

from __future__ import annotations

import csv
from datetime import date, timedelta
from pathlib import Path

import pytest


API_ROOT = Path(__file__).resolve().parents[1]
SEED_FILES = {
    "FLIGHT": API_ROOT / "seed-data" / "transport" / "plane" / "generated_ticket_offers.csv",
    "TRAIN": API_ROOT / "seed-data" / "transport" / "train" / "generated_ticket_offers.csv",
}

# Tests book trips up to two weeks out; keep a margin on top of that so the
# window is refreshed before anything actually breaks.
REQUIRED_DAYS_AHEAD = 30

REGENERATE_HINT = (
    "重新生成种子票务数据：\n"
    "    cd travel-api/scripts && python generate_dated_ticket_offers.py\n"
    "然后重建数据库卷或重新导入 database/seed/transport_seed.sql。"
)


def departure_dates(path: Path) -> list[date]:
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        return [
            date.fromisoformat(row["departureDateTime"][:10])
            for row in reader
            if row.get("departureDateTime")
        ]


@pytest.mark.parametrize("ticket_type", sorted(SEED_FILES))
def test_seed_window_still_covers_the_booking_horizon(ticket_type: str) -> None:
    path = SEED_FILES[ticket_type]
    assert path.exists(), f"缺少种子文件 {path}\n{REGENERATE_HINT}"

    dates = departure_dates(path)
    assert dates, f"{path} 没有任何班次行\n{REGENERATE_HINT}"

    today = date.today()
    required_through = today + timedelta(days=REQUIRED_DAYS_AHEAD)
    last_departure = max(dates)

    assert last_departure >= required_through, (
        f"{ticket_type} 种子票务窗口已过期或即将过期："
        f"最后一班在 {last_departure}，需要覆盖到 {required_through}（今天 + {REQUIRED_DAYS_AHEAD} 天）。\n"
        f"{REGENERATE_HINT}"
    )

    first_departure = min(dates)
    assert first_departure <= today, (
        f"{ticket_type} 种子票务窗口从 {first_departure} 才开始，今天（{today}）查不到任何班次。\n"
        f"{REGENERATE_HINT}"
    )
