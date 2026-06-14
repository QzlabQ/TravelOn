"""Shared station/airport catalog for transport seed generation.

Single source of truth for:
  * airport / railway-station display names per city,
  * splitting the legacy overloaded "station code" column into a proper
    (code, name) pair where the code is the optional IATA code (empty when the
    airport has none) and the name is always present.

Used by both the one-off column migration and generate-ticket-offers.py so the
naming logic never diverges.
"""

from __future__ import annotations

import csv
import re
from pathlib import Path


# Full ticket CSV header, including the dedicated station-name columns.
HEADER = [
    "type",
    "departureCityId",
    "arrivalCityId",
    "departureStationCode",
    "departureTerminalName",
    "arrivalStationCode",
    "arrivalTerminalName",
    "departureDateTime",
    "arrivalDateTime",
    "carrier",
    "code",
    "seatClass",
    "price",
    "remainingSeats",
    "totalSeats",
    "departureStationName",
    "arrivalStationName",
]

LEGACY_COLUMN_COUNT = 15
COLUMN_COUNT = len(HEADER)

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

# Disambiguation for cities served by more than one airport, where the per-city
# AIRPORTS entry alone cannot tell which terminal the IATA code refers to.
IATA_NAME_OVERRIDE = {
    "PEK": "北京首都国际机场",
    "PKX": "北京大兴国际机场",
    "SHA": "上海虹桥国际机场",
    "PVG": "上海浦东国际机场",
}

_IATA_RE = re.compile(r"^[A-Z]{2,4}$")


def normalize_city_name(value: str) -> str:
    value = (value or "").strip()
    for suffix in ("特别行政区", "地区", "自治州", "盟", "市"):
        if value.endswith(suffix) and len(value) > len(suffix):
            return value[: -len(suffix)]
    return value


def load_city_id_to_name(cities_csv: Path) -> dict[str, str]:
    with cities_csv.open(encoding="utf-8", newline="") as handle:
        return {
            row["cityId"]: row["cityName"]
            for row in csv.DictReader(handle, delimiter="\t")
        }


def split_station(value: str, city_name: str) -> tuple[str, str]:
    """Return (code, name) from a legacy overloaded station-code cell.

    An IATA-style code keeps the code and resolves the airport name; anything
    else (full airport name or railway station name) becomes the name with an
    empty code.
    """
    value = (value or "").strip()
    if _IATA_RE.match(value):
        name = (
            IATA_NAME_OVERRIDE.get(value)
            or AIRPORTS.get(normalize_city_name(city_name))
            or value
        )
        return value, name
    return "", value


def normalize_legacy_row(row: list[str], city_id_to_name: dict[str, str]) -> list[str]:
    """Upgrade a 15-column row to the 17-column format (no-op if already 17)."""
    if len(row) >= COLUMN_COUNT:
        return row[:COLUMN_COUNT]

    departure_code, departure_name = split_station(
        row[3], city_id_to_name.get(row[1], "")
    )
    arrival_code, arrival_name = split_station(
        row[5], city_id_to_name.get(row[2], "")
    )

    upgraded = list(row[:LEGACY_COLUMN_COUNT])
    upgraded[3] = departure_code
    upgraded[5] = arrival_code
    upgraded.extend([departure_name, arrival_name])
    return upgraded
