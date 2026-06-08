from __future__ import annotations

from app.models import PlannerPlaceSuggestion
from app.tools.amap_tool import AmapPoiTool


def test_place_image_fields_are_backward_compatible() -> None:
    legacy = PlannerPlaceSuggestion(name="The Bund", imageUrl="https://img.test/bund-1.jpg")
    modern = PlannerPlaceSuggestion(
        name="Shanghai Museum",
        imageUrls=[
            "https://img.test/museum-1.jpg",
            " https://img.test/museum-1.jpg ",
            "https://img.test/museum-2.jpg",
        ],
    )

    assert legacy.imageUrls == ["https://img.test/bund-1.jpg"]
    assert modern.imageUrl == "https://img.test/museum-1.jpg"
    assert modern.imageUrls == [
        "https://img.test/museum-1.jpg",
        "https://img.test/museum-2.jpg",
    ]


def test_amap_poi_parser_keeps_up_to_three_photo_urls() -> None:
    tool = AmapPoiTool(settings=None)  # type: ignore[arg-type]

    place = tool._parse_poi(
        {
            "id": "B001",
            "name": "The Bund",
            "typecode": "110000",
            "location": "121.4998,31.2397",
            "photos": [
                {"url": "https://img.test/bund-1.jpg"},
                {"url": " "},
                {"url": "https://img.test/bund-2.jpg"},
                {"url": "https://img.test/bund-3.jpg"},
                {"url": "https://img.test/bund-4.jpg"},
            ],
        }
    )

    assert place.imageUrl == "https://img.test/bund-1.jpg"
    assert place.imageUrls == [
        "https://img.test/bund-1.jpg",
        "https://img.test/bund-2.jpg",
        "https://img.test/bund-3.jpg",
    ]
