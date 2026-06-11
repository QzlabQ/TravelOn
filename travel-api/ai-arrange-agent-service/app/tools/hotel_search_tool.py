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
                message="Destination city is required before searching hotels.",
            )

        if request.coreSlots.travelStartDate is None:
            return self._partial_result(
                started=started,
                code="HOTEL_DATE_MISSING",
                message="Travel start date is required before searching hotels.",
            )

        date_from = request.coreSlots.travelStartDate
        date_to = request.coreSlots.travelEndDate or (date_from + timedelta(days=1))
        if date_to <= date_from:
            date_to = date_from + timedelta(days=1)
        adults = max(request.coreSlots.peopleCount or 1, 1)

        amap_hotels, amap_warnings = await self._search_amap_hotels(
            city=request.coreSlots.city,
            date_from=date_from.isoformat(),
            date_to=date_to.isoformat(),
            adults=adults,
            preference=request.coreSlots.accommodationPreference,
            limit=limit,
        )
        warnings.extend(amap_warnings)
        if amap_hotels:
            return ToolResult(
                tool="search_hotels",
                status=ToolStatus.SUCCESS,
                data=amap_hotels,
                latencyMs=self._latency_ms(started),
                userMessage=f"Found {len(amap_hotels)} real hotel candidates from Amap.",
                warnings=warnings,
            )

        warnings.append(
            ToolWarning(
                code="HOTEL_AMAP_FALLBACK_DATABASE",
                message="Amap hotel search was unavailable or empty; using database hotels as fallback.",
                source="search_hotels",
            )
        )

        base_url = self._settings.travel_gateway_base_url.rstrip("/")
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
                        message=f"Hotel database has no destination matching {request.coreSlots.city}.",
                        extra_warnings=warnings,
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
                message=f"Hotel database query failed: {error}",
                extra_warnings=warnings,
            )

        hotels = [
            self._to_database_place(
                item,
                city=request.coreSlots.city,
                date_from=date_from.isoformat(),
                date_to=date_to.isoformat(),
                adults=adults,
            )
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
                    message="Hotel database returned no bookable hotel candidates.",
                    source="search_hotels",
                )
            )

        return ToolResult(
            tool="search_hotels",
            status=ToolStatus.PARTIAL_SUCCESS,
            data=hotels,
            latencyMs=self._latency_ms(started),
            userMessage=f"Found {len(hotels)} fallback hotel candidates from the database.",
            warnings=warnings,
        )

    def _client(self):
        if self._client_factory is not None:
            return self._client_factory()
        return httpx.AsyncClient(timeout=self._settings.agent_tool_timeout_seconds)

    async def _search_amap_hotels(
        self,
        *,
        city: str,
        date_from: str,
        date_to: str,
        adults: int,
        preference: str | None,
        limit: int,
    ) -> tuple[list[PlannerPlaceSuggestion], list[ToolWarning]]:
        if not self._settings.amap_enabled or not self._settings.amap_api_key:
            return [], [
                ToolWarning(
                    code="HOTEL_AMAP_DISABLED",
                    message="Amap is not configured; hotel search will use the database fallback.",
                    source="search_hotels",
                )
            ]

        url = f"{self._settings.amap_base_url.rstrip('/')}/place/text"
        keywords = preference.strip() if preference and preference.strip() else "酒店"
        params = {
            "key": self._settings.amap_api_key,
            "city": city,
            "keywords": keywords,
            "types": "100000",
            "offset": min(max(limit, 1), 20),
            "page": 1,
            "extensions": "all",
        }

        try:
            async with self._client() as client:
                response = await client.get(url, params=params)
                response.raise_for_status()
                payload = response.json()
        except (httpx.TimeoutException, httpx.HTTPError, ValueError, TypeError) as error:
            return [], [
                ToolWarning(
                    code="HOTEL_AMAP_ERROR",
                    message=f"Amap hotel search failed: {error}",
                    source="search_hotels",
                )
            ]

        if not isinstance(payload, dict) or payload.get("status") != "1":
            message = str(payload.get("info") or "Amap hotel search failed") if isinstance(payload, dict) else "Amap response was invalid"
            return [], [ToolWarning(code="HOTEL_AMAP_ERROR", message=message, source="search_hotels")]

        places: list[PlannerPlaceSuggestion] = []
        for poi in payload.get("pois", []):
            if len(places) >= limit:
                break
            if not isinstance(poi, dict) or not poi.get("name"):
                continue
            places.append(
                self._to_amap_place(
                    poi,
                    city=city,
                    date_from=date_from,
                    date_to=date_to,
                    adults=adults,
                )
            )
        return places, []

    def _to_amap_place(
        self,
        poi: dict[str, Any],
        *,
        city: str,
        date_from: str,
        date_to: str,
        adults: int,
    ) -> PlannerPlaceSuggestion:
        name = str(poi.get("name") or "Hotel").strip()
        longitude: float | None = None
        latitude: float | None = None
        location = poi.get("location")
        if isinstance(location, str) and "," in location:
            raw_lng, raw_lat = location.split(",", 1)
            longitude = self._safe_float(raw_lng)
            latitude = self._safe_float(raw_lat)

        photos = self._photo_urls(poi.get("photos"))
        booking_link = PlannerBookingLink(
            type="HOTEL",
            label="去预订酒店",
            url=self._hotel_search_url(city=city, hotel_name=name, date_from=date_from, date_to=date_to, adults=adults),
        )

        address = poi.get("address") if isinstance(poi.get("address"), str) else None
        return PlannerPlaceSuggestion(
            placeId=uuid5(NAMESPACE_URL, f"amap-hotel:{poi.get('id') or name}"),
            name=name,
            type=PlaceType.HOTEL,
            source=PlaceSource.AMAP,
            amapPoiId=str(poi.get("id")) if poi.get("id") else None,
            latitude=latitude,
            longitude=longitude,
            address=address,
            imageUrl=photos[0] if photos else None,
            imageUrls=photos,
            description=str(poi.get("type") or "Amap hotel POI"),
            selected=False,
            tags=["hotel", "amap", "bookable"],
            bookingLinks=[booking_link],
        )

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

    def _to_database_place(
        self,
        item: dict[str, Any],
        *,
        city: str,
        date_from: str,
        date_to: str,
        adults: int,
    ) -> PlannerPlaceSuggestion:
        hotel_id = int(item["hotelId"])
        name = str(item["name"])
        location = item.get("location") if isinstance(item.get("location"), dict) else {}
        photos = self._string_list(item.get("photos"))
        price = item.get("pricePerAdult")
        address = self._address(location)
        booking_link = PlannerBookingLink(
            type="HOTEL",
            label="去预订酒店",
            url=self._hotel_search_url(city=city, hotel_name=name, date_from=date_from, date_to=date_to, adults=adults),
            hotelId=hotel_id,
            price=price if isinstance(price, (int, float)) else None,
        )
        description_parts = []
        if address:
            description_parts.append(f"Located near {address}")
        if isinstance(price, (int, float)):
            description_parts.append(f"About CNY {int(price)} per adult/night")
        if item.get("description"):
            description_parts.append(str(item["description"])[:90])

        return PlannerPlaceSuggestion(
            placeId=uuid5(NAMESPACE_URL, f"hotel:{hotel_id}"),
            name=name,
            type=PlaceType.HOTEL,
            source=PlaceSource.INTERNAL_OFFER,
            latitude=None,
            longitude=None,
            address=address,
            imageUrl=photos[0] if photos else None,
            imageUrls=photos,
            description="; ".join(description_parts) if description_parts else None,
            selected=False,
            tags=["hotel", "database", "bookable"],
            bookingLinks=[booking_link],
            hotelId=hotel_id,
            pricePerNight=price,
            rating=item.get("rating"),
            location=location,
        )

    def _hotel_search_url(self, *, city: str, hotel_name: str, date_from: str, date_to: str, adults: int) -> str:
        query = urlencode(
            {
                "city": city,
                "dateFrom": date_from,
                "dateTo": date_to,
                "adults": adults,
                "hotelName": hotel_name,
            }
        )
        return f"/reservations/hotels?{query}"

    def _string_list(self, value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        result: list[str] = []
        for item in value:
            text = str(item).strip() if item is not None else ""
            if text and text not in result:
                result.append(text)
        return result[:3]

    def _photo_urls(self, photos: Any) -> list[str]:
        if not isinstance(photos, list):
            return []

        urls: list[str] = []
        for photo in photos:
            if len(urls) >= 3:
                break
            if not isinstance(photo, dict):
                continue
            url = photo.get("url")
            if not isinstance(url, str):
                continue
            url = url.strip()
            if url and url not in urls:
                urls.append(url)
        return urls

    def _address(self, location: dict[str, Any]) -> str | None:
        parts = [location.get("region"), location.get("province"), location.get("country")]
        text = ", ".join(str(part).strip() for part in parts if part)
        return text or None

    def _safe_float(self, value: Any) -> float | None:
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    def _partial_result(
        self,
        *,
        started: float,
        code: str,
        message: str,
        extra_warnings: list[ToolWarning] | None = None,
    ) -> ToolResult:
        warnings = list(extra_warnings or [])
        warnings.append(ToolWarning(code=code, message=message, source="search_hotels"))
        return ToolResult(
            tool="search_hotels",
            status=ToolStatus.PARTIAL_SUCCESS,
            data=[],
            errorCode=code,
            errorMessage=message,
            latencyMs=self._latency_ms(started),
            userMessage=message,
            warnings=warnings,
        )

    def _latency_ms(self, started: float) -> int:
        return int((time.perf_counter() - started) * 1000)
