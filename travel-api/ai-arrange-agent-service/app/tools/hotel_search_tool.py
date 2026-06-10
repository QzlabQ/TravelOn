from __future__ import annotations

import time
from datetime import timedelta
from typing import Any
from urllib.parse import urlencode
from uuid import NAMESPACE_URL, uuid5

import httpx

from app.config import AgentSettings
from app.harness.tool_result import ToolResult, ToolStatus, ToolWarning
from app.models import AgentRunRequest, PlaceSource, PlaceType, PlannerBookingLink, PlannerPlaceSuggestion


class HotelSearchTool:
    def __init__(self, settings: AgentSettings, client_factory=None) -> None:
        self._settings = settings
        self._client_factory = client_factory

    async def search_hotels(
        self,
        request: AgentRunRequest,
        limit: int = 3,
        **_,
    ) -> ToolResult:
        started = time.perf_counter()
        warnings: list[ToolWarning] = []

        if not request.coreSlots.city:
            return self._partial_result(
                started=started,
                code="HOTEL_DESTINATION_MISSING",
                message="缺少目的地，已跳过酒店候选查询。",
            )

        if request.coreSlots.travelStartDate is None:
            return self._partial_result(
                started=started,
                code="HOTEL_DATE_MISSING",
                message="缺少入住日期，已跳过酒店候选查询。",
            )

        base_url = self._settings.travel_gateway_base_url.rstrip("/")
        date_from = request.coreSlots.travelStartDate
        date_to = request.coreSlots.travelEndDate or (date_from + timedelta(days=1))
        if date_to <= date_from:
            date_to = date_from + timedelta(days=1)
        adults = max(request.coreSlots.peopleCount or 1, 1)

        try:
            async with self._client() as client:
                destinations_response = await client.get(f"{base_url}/hotels/destinations")
                destinations_response.raise_for_status()
                destinations = destinations_response.json()
                destination = self._match_destination(destinations, request.coreSlots.city)
                if destination is None:
                    return self._partial_result(
                        started=started,
                        code="HOTEL_DESTINATION_NOT_FOUND",
                        message=f"酒店库暂未找到目的地：{request.coreSlots.city}。",
                    )

                search_response = await client.get(
                    f"{base_url}/hotels/search",
                    params={
                        "destinationId": destination["idLocation"],
                        "dateFrom": date_from.isoformat(),
                        "dateTo": date_to.isoformat(),
                        "adults": adults,
                        "sortBy": "price",
                    },
                )
                search_response.raise_for_status()
                items = search_response.json()
        except (httpx.TimeoutException, httpx.HTTPError, ValueError, KeyError, TypeError) as error:
            return self._partial_result(
                started=started,
                code="HOTEL_GATEWAY_ERROR",
                message=f"酒店数据库接口查询失败：{error}",
            )

        hotels = [
            self._to_place(item, date_from=date_from.isoformat(), date_to=date_to.isoformat(), adults=adults)
            for item in items[:limit]
            if isinstance(item, dict) and item.get("hotelId") and item.get("name")
        ]

        if request.coreSlots.accommodationPreference:
            preference = request.coreSlots.accommodationPreference
            for hotel in hotels:
                if preference not in hotel.tags:
                    hotel.tags.append(preference)

        if not hotels:
            warnings.append(
                ToolWarning(
                    code="HOTEL_SEARCH_EMPTY",
                    message="酒店数据库接口没有返回可推荐酒店。",
                    source="search_hotels",
                )
            )

        return ToolResult(
            tool="search_hotels",
            status=ToolStatus.SUCCESS if hotels else ToolStatus.PARTIAL_SUCCESS,
            data=hotels,
            latencyMs=self._latency_ms(started),
            userMessage=f"已从酒店数据库找到 {len(hotels)} 个酒店候选。",
            warnings=warnings,
        )

    def _client(self):
        if self._client_factory is not None:
            return self._client_factory()
        return httpx.AsyncClient(timeout=self._settings.agent_tool_timeout_seconds)

    def _match_destination(self, destinations: Any, city: str) -> dict[str, Any] | None:
        if not isinstance(destinations, list):
            return None

        normalized_city = self._normalize(city)
        for destination in destinations:
            if not isinstance(destination, dict):
                continue
            candidates = [
                destination.get("region"),
                destination.get("normalizedName"),
                destination.get("province"),
                destination.get("country"),
                destination.get("cityId"),
            ]
            if any(self._destination_matches(normalized_city, value) for value in candidates):
                return destination
        return None

    def _destination_matches(self, normalized_city: str, value: Any) -> bool:
        if not value:
            return False
        normalized_value = self._normalize(str(value))
        return bool(
            normalized_value
            and (
                normalized_value == normalized_city
                or normalized_value in normalized_city
                or normalized_city in normalized_value
            )
        )

    def _normalize(self, value: str) -> str:
        return "".join(value.strip().lower().split())

    def _to_place(self, item: dict[str, Any], *, date_from: str, date_to: str, adults: int) -> PlannerPlaceSuggestion:
        hotel_id = int(item["hotelId"])
        location = item.get("location") if isinstance(item.get("location"), dict) else {}
        photos = self._string_list(item.get("photos"))
        price = item.get("pricePerAdult")
        address = self._address(location)
        booking_link = PlannerBookingLink(
            type="HOTEL",
            label="去预订酒店",
            url=self._hotel_booking_url(hotel_id, date_from=date_from, date_to=date_to, adults=adults),
            hotelId=hotel_id,
            price=price if isinstance(price, int | float) else None,
        )
        description_parts = []
        if address:
            description_parts.append(f"位于{address}")
        if isinstance(price, int | float):
            description_parts.append(f"约 CNY {int(price)}/人/晚")
        if item.get("description"):
            description_parts.append(str(item["description"])[:90])

        return PlannerPlaceSuggestion(
            placeId=uuid5(NAMESPACE_URL, f"hotel:{hotel_id}"),
            name=str(item["name"]),
            type=PlaceType.HOTEL,
            source=PlaceSource.INTERNAL_OFFER,
            latitude=None,
            longitude=None,
            address=address,
            imageUrl=photos[0] if photos else None,
            imageUrls=photos,
            description="，".join(description_parts) if description_parts else None,
            selected=False,
            tags=["酒店", "database", "bookable"],
            bookingLinks=[booking_link],
            hotelId=hotel_id,
            pricePerNight=price,
            rating=item.get("rating"),
            location=location,
        )

    def _hotel_booking_url(self, hotel_id: int, *, date_from: str, date_to: str, adults: int) -> str:
        query = urlencode({"dateFrom": date_from, "dateTo": date_to, "adults": adults})
        return f"/reservations/hotels/{hotel_id}?{query}"

    def _string_list(self, value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        result: list[str] = []
        for item in value:
            text = str(item).strip() if item is not None else ""
            if text and text not in result:
                result.append(text)
        return result[:3]

    def _address(self, location: dict[str, Any]) -> str | None:
        parts = [location.get("region"), location.get("province"), location.get("country")]
        text = "，".join(str(part).strip() for part in parts if part)
        return text or None

    def _partial_result(self, *, started: float, code: str, message: str) -> ToolResult:
        return ToolResult(
            tool="search_hotels",
            status=ToolStatus.PARTIAL_SUCCESS,
            data=[],
            errorCode=code,
            errorMessage=message,
            latencyMs=self._latency_ms(started),
            userMessage=message,
            warnings=[ToolWarning(code=code, message=message, source="search_hotels")],
        )

    def _latency_ms(self, started: float) -> int:
        return int((time.perf_counter() - started) * 1000)
