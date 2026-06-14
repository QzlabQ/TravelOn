#!/usr/bin/env python3
"""Generate deterministic nationwide demo ticket templates.

Verified historical rows stay untouched. Generated rows are clearly marked as
demo coverage records so the application never presents them as live inventory.
"""

from __future__ import annotations

import csv
import math
from datetime import datetime, timedelta
from pathlib import Path

from airport_catalog import (
    AIRPORTS,
    HEADER,
    TRAIN_STATIONS,
    load_city_id_to_name,
    normalize_city_name,
    normalize_legacy_row,
)

# AIRPORTS / TRAIN_STATIONS / normalize_city_name now live in airport_catalog so
# the naming logic is shared with the column migration and stays in sync.


ROOT = Path(__file__).resolve().parents[1]
COMMON_CITIES_FILE = ROOT / "seed-data/common/cities.csv"
TRAIN_TICKETS_FILE = ROOT / "seed-data/transport/train/ticket_offers.csv"
PLANE_TICKETS_FILE = ROOT / "seed-data/transport/plane/ticket_offers.csv"
GENERATED_MARKER = "generated:nationwide-v1"
EXTRA_TICKET_CITIES = ()

COORDINATES = {
    "北京": (39.90, 116.40), "上海": (31.23, 121.47), "天津": (39.08, 117.20),
    "重庆": (29.56, 106.55), "石家庄": (38.04, 114.51), "太原": (37.87, 112.55),
    "呼和浩特": (40.84, 111.75), "沈阳": (41.80, 123.43), "长春": (43.82, 125.32),
    "哈尔滨": (45.80, 126.53), "南京": (32.06, 118.80), "杭州": (30.27, 120.15),
    "合肥": (31.82, 117.23), "福州": (26.08, 119.30), "南昌": (28.68, 115.86),
    "济南": (36.67, 117.02), "郑州": (34.75, 113.63), "武汉": (30.59, 114.30),
    "长沙": (28.23, 112.94), "广州": (23.13, 113.26), "南宁": (22.82, 108.37),
    "海口": (20.04, 110.20), "成都": (30.57, 104.07), "贵阳": (26.65, 106.63),
    "昆明": (25.04, 102.71), "拉萨": (29.65, 91.17), "西安": (34.34, 108.94),
    "兰州": (36.06, 103.83), "西宁": (36.62, 101.78), "银川": (38.49, 106.23),
    "乌鲁木齐": (43.83, 87.62), "香港": (22.32, 114.17), "澳门": (22.20, 113.54),
    "台北": (25.03, 121.57), "深圳": (22.54, 114.06), "厦门": (24.48, 118.09),
    "青岛": (36.07, 120.38), "大连": (38.91, 121.61), "宁波": (29.87, 121.55),
    "苏州": (31.30, 120.58), "无锡": (31.49, 120.31), "桂林": (25.27, 110.29),
    "三亚": (18.25, 109.51), "张家界": (29.12, 110.48), "丽江": (26.86, 100.23),
    "大理": (25.61, 100.27), "黄山": (29.71, 118.34), "西双版纳": (22.00, 100.80),
    "珠海": (22.27, 113.58), "洛阳": (34.62, 112.45), "大同": (40.08, 113.30),
    "敦煌": (40.14, 94.66), "喀什": (39.47, 75.99), "吐鲁番": (42.95, 89.19),
    "阿勒泰": (47.85, 88.14), "秦皇岛": (39.94, 119.60), "威海": (37.51, 122.12),
    "泉州": (24.87, 118.67), "扬州": (32.39, 119.42), "嘉兴": (30.75, 120.76),
    "北海": (21.48, 109.12), "景德镇": (29.27, 117.18), "延吉": (42.89, 129.51),
    "伊犁": (43.92, 81.32), "惠州": (23.11, 114.42), "九寨沟": (33.25, 104.24),
    "烟台": (37.46, 121.45), "佛山": (23.02, 113.12), "满洲里": (49.60, 117.38),
    "温州": (28.00, 120.67),
}

FLIGHT_CARRIERS = (("中国国航", "CA"), ("东方航空", "MU"), ("南方航空", "CZ"), ("海南航空", "HU"))


def ticket_cities() -> list[str]:
    if COMMON_CITIES_FILE.exists():
        with COMMON_CITIES_FILE.open(encoding="utf-8", newline="") as handle:
            cities = [
                normalize_city_name(row["cityName"])
                for row in csv.DictReader(handle, delimiter="\t")
                if normalize_city_name(row["cityName"]) in COORDINATES
            ]
    else:
        cities = sorted(COORDINATES.keys())
    return cities + [city for city in EXTRA_TICKET_CITIES if city not in cities]


def read_ticket_rows(path: Path) -> list[list[str]]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.reader(handle, delimiter="\t"))
    return rows[1:]


def city_ids() -> dict[str, str]:
    if not COMMON_CITIES_FILE.exists():
        return {}
    with COMMON_CITIES_FILE.open(encoding="utf-8", newline="") as handle:
        return {
            normalize_city_name(row["cityName"]): row["cityId"]
            for row in csv.DictReader(handle, delimiter="\t")
        }


def distance_km(left: str, right: str) -> float:
    lat1, lon1 = COORDINATES[left]
    lat2, lon2 = COORDINATES[right]
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 6371 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def format_time(total_minutes: int) -> str:
    return (datetime(2026, 1, 1) + timedelta(minutes=total_minutes)).strftime("%H:%M")


def format_datetime(base_date: str, total_minutes: int) -> str:
    return (datetime.fromisoformat(base_date) + timedelta(minutes=total_minutes)).strftime("%Y-%m-%dT%H:%M:%S")


def generated_flight(left: str, right: str, seed: int, ids: dict[str, str]) -> tuple[str, ...]:
    distance = distance_km(left, right)
    carrier, prefix = FLIGHT_CARRIERS[seed % len(FLIGHT_CARRIERS)]
    departure = 360 + (seed * 37) % 840
    duration = max(70, round(55 + distance / 10))
    price = max(260, round((230 + distance * 0.45 + seed % 170) / 10) * 10)
    seats = str(3 + seed % 35)
    return (
        "FLIGHT", ids.get(left, left), ids.get(right, right), "", "",
        "", "", format_datetime("2026-05-01", departure),
        format_datetime("2026-05-01", departure + duration), carrier, f"{prefix}{1000 + seed}",
        "经济舱", str(price), seats, seats,
        AIRPORTS.get(left, left), AIRPORTS.get(right, right),
    )


def generated_train(left: str, right: str, seed: int, ids: dict[str, str]) -> tuple[str, ...]:
    distance = distance_km(left, right)
    departure = 330 + (seed * 29) % 900
    duration = max(35, round(25 + distance / 3.1))
    price = max(24, round((18 + distance * 0.36 + seed % 55) / 5) * 5)
    seats = str(5 + seed % 31)
    return (
        "TRAIN", ids.get(left, left), ids.get(right, right), "", "",
        "", "", format_datetime("2026-05-01", departure),
        format_datetime("2026-05-01", departure + duration), "中国铁路", f"G{1000 + seed}",
        "二等座", str(price), seats, seats,
        TRAIN_STATIONS.get(left, f"{left}站"), TRAIN_STATIONS.get(right, f"{right}站"),
    )


def main() -> None:
    cities = ticket_cities()
    missing = sorted(set(cities) - COORDINATES.keys())
    if missing:
        raise RuntimeError(f"Missing coordinates: {missing}")
    ids = city_ids()
    city_id_to_name = load_city_id_to_name(COMMON_CITIES_FILE)

    existing_rows = read_ticket_rows(TRAIN_TICKETS_FILE) + read_ticket_rows(PLANE_TICKETS_FILE)
    historical_rows = [
        normalize_legacy_row(row, city_id_to_name)
        for row in existing_rows
        if len(row) >= 15
    ]
    covered_routes = {(row[0], row[1], row[2]) for row in historical_rows}
    generated_flight_rows: list[tuple[str, ...]] = []
    generated_train_rows: list[tuple[str, ...]] = []

    for left_index, left in enumerate(cities):
        for right_index, right in enumerate(cities):
            if left == right:
                continue
            seed = left_index * len(cities) + right_index
            left_id = ids.get(left, left)
            right_id = ids.get(right, right)
            if ("FLIGHT", left_id, right_id) not in covered_routes:
                generated_flight_rows.append(generated_flight(left, right, seed, ids))
            if ("TRAIN", left_id, right_id) not in covered_routes:
                generated_train_rows.append(generated_train(left, right, seed, ids))

    historical_flight_rows = [row for row in historical_rows if row[0] == "FLIGHT"]
    historical_train_rows = [row for row in historical_rows if row[0] == "TRAIN"]

    PLANE_TICKETS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with TRAIN_TICKETS_FILE.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, delimiter="\t", lineterminator="\n")
        writer.writerow(HEADER)
        writer.writerows(historical_train_rows)
        writer.writerows(generated_train_rows)

    with PLANE_TICKETS_FILE.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, delimiter="\t", lineterminator="\n")
        writer.writerow(HEADER)
        writer.writerows(historical_flight_rows)
        writer.writerows(generated_flight_rows)

    generated_total = len(generated_flight_rows) + len(generated_train_rows)
    print(f"cities={len(cities)} historical={len(historical_rows)} generated={generated_total} total={len(historical_rows) + generated_total}")


if __name__ == "__main__":
    main()
