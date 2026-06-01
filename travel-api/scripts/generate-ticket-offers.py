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


ROOT = Path(__file__).resolve().parents[1]
HOTELS_FILE = ROOT / "transport-service/src/main/resources/initData/hotels.csv"
TICKETS_FILE = ROOT / "transport-service/src/main/resources/initData/ticket_offers.tsv"
GENERATED_MARKER = "generated:nationwide-v1"
EXTRA_TICKET_CITIES = ("满洲里", "温州")

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

AIRPORTS = {
    "北京": "北京首都国际机场", "上海": "上海虹桥国际机场", "天津": "天津滨海国际机场",
    "重庆": "重庆江北国际机场", "石家庄": "石家庄正定国际机场", "太原": "太原武宿国际机场",
    "呼和浩特": "呼和浩特白塔国际机场", "沈阳": "沈阳桃仙国际机场", "长春": "长春龙嘉国际机场",
    "哈尔滨": "哈尔滨太平国际机场", "南京": "南京禄口国际机场", "杭州": "杭州萧山国际机场",
    "合肥": "合肥新桥国际机场", "福州": "福州长乐国际机场", "南昌": "南昌昌北国际机场",
    "济南": "济南遥墙国际机场", "郑州": "郑州新郑国际机场", "武汉": "武汉天河国际机场",
    "长沙": "长沙黄花国际机场", "广州": "广州白云国际机场", "南宁": "南宁吴圩国际机场",
    "海口": "海口美兰国际机场", "成都": "成都天府国际机场", "贵阳": "贵阳龙洞堡国际机场",
    "昆明": "昆明长水国际机场", "拉萨": "拉萨贡嘎国际机场", "西安": "西安咸阳国际机场",
    "兰州": "兰州中川国际机场", "西宁": "西宁曹家堡国际机场", "银川": "银川河东国际机场",
    "乌鲁木齐": "乌鲁木齐天山国际机场", "香港": "香港国际机场", "澳门": "澳门国际机场",
    "台北": "台北桃园国际机场", "深圳": "深圳宝安国际机场", "厦门": "厦门高崎国际机场",
    "青岛": "青岛胶东国际机场", "大连": "大连周水子国际机场", "宁波": "宁波栎社国际机场",
    "无锡": "苏南硕放国际机场", "桂林": "桂林两江国际机场", "三亚": "三亚凤凰国际机场",
    "张家界": "张家界荷花国际机场", "丽江": "丽江三义国际机场", "大理": "大理凤仪机场",
    "黄山": "黄山屯溪国际机场", "西双版纳": "西双版纳嘎洒国际机场", "珠海": "珠海金湾机场",
    "洛阳": "洛阳北郊机场", "大同": "大同云冈国际机场", "敦煌": "敦煌莫高国际机场",
    "喀什": "喀什徕宁国际机场", "吐鲁番": "吐鲁番交河机场", "阿勒泰": "阿勒泰雪都机场",
    "秦皇岛": "秦皇岛北戴河机场", "威海": "威海大水泊国际机场", "泉州": "泉州晋江国际机场",
    "扬州": "扬州泰州国际机场", "北海": "北海福成机场", "景德镇": "景德镇罗家机场",
    "延吉": "延吉朝阳川国际机场", "伊犁": "伊宁机场", "惠州": "惠州平潭机场",
    "九寨沟": "九寨黄龙机场", "烟台": "烟台蓬莱国际机场", "佛山": "佛山沙堤机场",
    "满洲里": "满洲里西郊机场", "温州": "温州龙湾国际机场",
}

TRAIN_STATIONS = {
    "北京": "北京南站", "上海": "上海虹桥站", "天津": "天津西站", "重庆": "重庆北站",
    "石家庄": "石家庄站", "太原": "太原南站", "呼和浩特": "呼和浩特东站", "沈阳": "沈阳北站",
    "长春": "长春西站", "哈尔滨": "哈尔滨西站", "南京": "南京南站", "杭州": "杭州东站",
    "合肥": "合肥南站", "福州": "福州南站", "南昌": "南昌西站", "济南": "济南西站",
    "郑州": "郑州东站", "武汉": "武汉站", "长沙": "长沙南站", "广州": "广州南站",
    "南宁": "南宁东站", "海口": "海口东站", "成都": "成都东站", "贵阳": "贵阳北站",
    "昆明": "昆明南站", "拉萨": "拉萨站", "西安": "西安北站", "兰州": "兰州西站",
    "西宁": "西宁站", "银川": "银川站", "乌鲁木齐": "乌鲁木齐站", "深圳": "深圳北站",
    "厦门": "厦门北站", "青岛": "青岛北站", "大连": "大连北站", "宁波": "宁波站",
    "苏州": "苏州站", "无锡": "无锡站", "桂林": "桂林北站", "三亚": "三亚站",
    "张家界": "张家界西站", "丽江": "丽江站", "大理": "大理站", "黄山": "黄山北站",
    "珠海": "珠海站", "洛阳": "洛阳龙门站", "大同": "大同南站", "敦煌": "敦煌站",
    "喀什": "喀什站", "吐鲁番": "吐鲁番北站", "阿勒泰": "阿勒泰站", "秦皇岛": "秦皇岛站",
    "威海": "威海站", "泉州": "泉州站", "扬州": "扬州东站", "嘉兴": "嘉兴南站",
    "北海": "北海站", "景德镇": "景德镇北站", "延吉": "延吉西站", "伊犁": "伊宁站",
    "惠州": "惠州北站", "九寨沟": "黄龙九寨站", "烟台": "烟台站", "佛山": "佛山西站",
    "满洲里": "满洲里站", "温州": "温州南站",
    "香港": "香港西九龙站", "澳门": "珠海站", "台北": "台北车站", "西双版纳": "西双版纳站",
}

FLIGHT_CARRIERS = (("中国国航", "CA"), ("东方航空", "MU"), ("南方航空", "CZ"), ("海南航空", "HU"))
HEADER = (
    "type", "departureCity", "arrivalCity", "departureStation", "arrivalStation",
    "departureTime", "arrivalTime", "carrier", "code", "seatClass", "price",
    "remainingSeats", "studentEligible", "referenceDate", "sourceUrl", "sourceNote",
)


def cities_from_hotels() -> list[str]:
    with HOTELS_FILE.open(encoding="utf-8-sig", newline="") as handle:
        rows = csv.DictReader(handle, delimiter="\t")
        cities = [row["city"] for row in rows]
        return cities + [city for city in EXTRA_TICKET_CITIES if city not in cities]


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


def generated_flight(left: str, right: str, seed: int) -> tuple[str, ...]:
    distance = distance_km(left, right)
    carrier, prefix = FLIGHT_CARRIERS[seed % len(FLIGHT_CARRIERS)]
    departure = 360 + (seed * 37) % 840
    duration = max(70, round(55 + distance / 10))
    price = max(260, round((230 + distance * 0.45 + seed % 170) / 10) * 10)
    return (
        "FLIGHT", left, right, AIRPORTS.get(left, f"{left}机场"), AIRPORTS.get(right, f"{right}机场"),
        format_time(departure), format_time(departure + duration), carrier, f"{prefix}{1000 + seed}",
        "经济舱", str(price), str(3 + seed % 35), "false", "2026-05-01",
        "https://wap.ctrip.com/html5/flight/?orphanapp=1",
        f"全国覆盖演示模板 {GENERATED_MARKER}：城市、机场和距离分档用于扩展查询覆盖；班次号、时刻与价格为可重复生成的演示数据，不是实时库存或售卖报价。",
    )


def generated_train(left: str, right: str, seed: int) -> tuple[str, ...]:
    distance = distance_km(left, right)
    departure = 330 + (seed * 29) % 900
    duration = max(35, round(25 + distance / 3.1))
    price = max(24, round((18 + distance * 0.36 + seed % 55) / 5) * 5)
    return (
        "TRAIN", left, right, TRAIN_STATIONS.get(left, f"{left}站"), TRAIN_STATIONS.get(right, f"{right}站"),
        format_time(departure), format_time(departure + duration), "中国铁路", f"G{1000 + seed}",
        "二等座", str(price), str(5 + seed % 31), "true", "2026-05-01",
        "https://www.12306.cn/index/",
        f"全国覆盖演示模板 {GENERATED_MARKER}：城市、车站和距离分档用于扩展查询覆盖；车次号、时刻与价格为可重复生成的演示数据，不是实时库存或售卖报价。",
    )


def main() -> None:
    cities = cities_from_hotels()
    missing = sorted(set(cities) - COORDINATES.keys())
    if missing:
        raise RuntimeError(f"Missing coordinates: {missing}")

    with TICKETS_FILE.open(encoding="utf-8", newline="") as handle:
        existing_rows = list(csv.reader(handle, delimiter="\t"))

    historical_rows = [row for row in existing_rows[1:] if GENERATED_MARKER not in row[15]]
    covered_routes = {(row[0], row[1], row[2]) for row in historical_rows}
    generated_rows: list[tuple[str, ...]] = []

    for left_index, left in enumerate(cities):
        for right_index, right in enumerate(cities):
            if left == right:
                continue
            seed = left_index * len(cities) + right_index
            if ("FLIGHT", left, right) not in covered_routes:
                generated_rows.append(generated_flight(left, right, seed))
            if ("TRAIN", left, right) not in covered_routes:
                generated_rows.append(generated_train(left, right, seed))

    with TICKETS_FILE.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, delimiter="\t", lineterminator="\n")
        writer.writerow(HEADER)
        writer.writerows(historical_rows)
        writer.writerows(generated_rows)

    print(f"cities={len(cities)} historical={len(historical_rows)} generated={len(generated_rows)} total={len(historical_rows) + len(generated_rows)}")


if __name__ == "__main__":
    main()
