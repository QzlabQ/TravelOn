from __future__ import annotations

from typing import Any


CITY_ALIASES = {
    "上海": "shanghai",
    "shanghai": "shanghai",
    "北京": "beijing",
    "beijing": "beijing",
    "杭州": "hangzhou",
    "hangzhou": "hangzhou",
}

HOTELS: dict[str, list[dict[str, Any]]] = {
    "shanghai": [
        {
            "name": "外滩江景精选酒店",
            "area": "外滩",
            "pricePerNight": 680,
            "starRating": 4,
            "internalOfferId": "10000000-0000-0000-0000-000000000101",
            "latitude": 31.2397,
            "longitude": 121.4903,
            "address": "上海市黄浦区中山东一路",
            "tags": ["river-view", "walkable", "internal-offer"],
        },
        {
            "name": "人民广场城市酒店",
            "area": "人民广场",
            "pricePerNight": 520,
            "starRating": 4,
            "internalOfferId": "10000000-0000-0000-0000-000000000102",
            "latitude": 31.2304,
            "longitude": 121.4737,
            "address": "上海市黄浦区人民大道",
            "tags": ["metro", "family-friendly", "internal-offer"],
        },
        {
            "name": "徐家汇轻奢公寓",
            "area": "徐家汇",
            "pricePerNight": 430,
            "starRating": 3,
            "internalOfferId": None,
            "latitude": 31.191,
            "longitude": 121.437,
            "address": "上海市徐汇区漕溪北路",
            "tags": ["apartment", "budget"],
        },
    ],
    "beijing": [
        {
            "name": "前门胡同精品酒店",
            "area": "前门",
            "pricePerNight": 610,
            "starRating": 4,
            "internalOfferId": "10000000-0000-0000-0000-000000000201",
            "latitude": 39.8996,
            "longitude": 116.3972,
            "address": "北京市东城区前门大街",
            "tags": ["culture", "walkable", "internal-offer"],
        },
        {
            "name": "望京商务酒店",
            "area": "望京",
            "pricePerNight": 480,
            "starRating": 4,
            "internalOfferId": None,
            "latitude": 39.9968,
            "longitude": 116.4698,
            "address": "北京市朝阳区广顺北大街",
            "tags": ["business", "metro"],
        },
    ],
    "hangzhou": [
        {
            "name": "西湖湖滨精选酒店",
            "area": "湖滨",
            "pricePerNight": 590,
            "starRating": 4,
            "internalOfferId": "10000000-0000-0000-0000-000000000301",
            "latitude": 30.2592,
            "longitude": 120.1655,
            "address": "杭州市上城区湖滨路",
            "tags": ["lake-view", "walkable", "internal-offer"],
        }
    ],
}

TRANSPORT_OPTIONS: dict[str, list[dict[str, Any]]] = {
    "shanghai": [
        {
            "mode": "train",
            "from": "出发城市",
            "to": "上海虹桥",
            "provider": "mock-transport",
            "estimatedPrice": 420,
            "durationMinutes": 300,
            "summary": "高铁抵达上海虹桥后换乘地铁进城。",
        },
        {
            "mode": "flight",
            "from": "出发城市",
            "to": "上海虹桥",
            "provider": "mock-transport",
            "estimatedPrice": 760,
            "durationMinutes": 135,
            "summary": "航班更快，适合跨省长距离出行。",
        },
    ],
    "beijing": [
        {
            "mode": "train",
            "from": "出发城市",
            "to": "北京南",
            "provider": "mock-transport",
            "estimatedPrice": 510,
            "durationMinutes": 330,
            "summary": "高铁抵达北京南后可换乘地铁进入核心景区。",
        }
    ],
    "hangzhou": [
        {
            "mode": "train",
            "from": "出发城市",
            "to": "杭州东",
            "provider": "mock-transport",
            "estimatedPrice": 260,
            "durationMinutes": 150,
            "summary": "高铁抵达杭州东，适合短途周边游。",
        }
    ],
}

WEATHER: dict[str, dict[str, Any]] = {
    "shanghai": {
        "summary": "多云到阵雨，午后湿度较高。",
        "daily": [
            {"dateOffset": 0, "condition": "多云", "lowC": 23, "highC": 29, "precipitationChance": 35},
            {"dateOffset": 1, "condition": "小雨", "lowC": 22, "highC": 27, "precipitationChance": 60},
            {"dateOffset": 2, "condition": "阴", "lowC": 23, "highC": 28, "precipitationChance": 30},
        ],
        "tips": ["随身带伞", "优先安排室内博物馆作为雨天备选"],
    },
    "beijing": {
        "summary": "晴到多云，昼夜温差明显。",
        "daily": [
            {"dateOffset": 0, "condition": "晴", "lowC": 19, "highC": 31, "precipitationChance": 10},
            {"dateOffset": 1, "condition": "多云", "lowC": 20, "highC": 30, "precipitationChance": 20},
        ],
        "tips": ["注意防晒", "早晚加一件薄外套"],
    },
    "hangzhou": {
        "summary": "多云，西湖周边体感偏湿热。",
        "daily": [
            {"dateOffset": 0, "condition": "多云", "lowC": 22, "highC": 30, "precipitationChance": 25},
            {"dateOffset": 1, "condition": "阴", "lowC": 22, "highC": 28, "precipitationChance": 40},
        ],
        "tips": ["湖边步行注意补水", "午后可安排茶馆或博物馆"],
    },
}

BUDGET_LEVELS = {
    "budget": {"hotelNight": 350, "mealPersonDay": 120, "localTransportPersonDay": 35, "ticketPersonDay": 80},
    "standard": {"hotelNight": 550, "mealPersonDay": 180, "localTransportPersonDay": 50, "ticketPersonDay": 120},
    "premium": {"hotelNight": 950, "mealPersonDay": 320, "localTransportPersonDay": 90, "ticketPersonDay": 220},
}


def city_key(city: str | None) -> str:
    if not city:
        return "shanghai"
    normalized = city.strip().lower()
    return CITY_ALIASES.get(normalized, normalized)


def city_hotels(city: str | None) -> list[dict[str, Any]]:
    return HOTELS.get(city_key(city), HOTELS["shanghai"])


def city_transport_options(city: str | None) -> list[dict[str, Any]]:
    return TRANSPORT_OPTIONS.get(city_key(city), TRANSPORT_OPTIONS["shanghai"])


def city_weather(city: str | None) -> dict[str, Any]:
    return WEATHER.get(city_key(city), WEATHER["shanghai"])
