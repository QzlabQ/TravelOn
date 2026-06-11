from __future__ import annotations

from pathlib import Path

import httpx
import pytest

from app.config import load_settings
from app.harness.tool_result import ToolStatus
from app.models import AgentRunRequest, PlaceSource, PlaceType
from app.tools.budget_tool import BudgetEstimateTool
from app.tools.hotel_search_tool import HotelSearchTool
from app.tools.transport_search_tool import TransportSearchTool
from app.tools.weather_tool import WeatherTool


def sample_request(include_departure_city: bool = True) -> AgentRunRequest:
    core_slots = {
        "departureCity": "北京" if include_departure_city else None,
        "city": "上海",
        "travelStartDate": "2026-06-01",
        "travelEndDate": "2026-06-03",
        "peopleCount": 2,
        "budget": "standard",
        "transportPreference": "train",
    }
    return AgentRunRequest.model_validate(
        {
            "conversationId": "00000000-0000-0000-0000-000000000010",
            "userId": "00000000-0000-0000-0000-000000000001",
            "coreSlots": core_slots,
            "userMessage": "Prefer relaxed route and river view hotel.",
            "userContext": {
                "travelPreferences": {"budgetLevel": "standard"},
                "historicalTrips": [],
                "familyProfile": {"withChildren": False},
                "budgetProfile": {"level": "standard"},
            },
        }
    )


def hotel_client_factory():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/hotels/destinations":
            return httpx.Response(
                200,
                json=[
                    {
                        "idLocation": "11111111-1111-1111-1111-111111111111",
                        "cityId": "SHA",
                        "country": "中国",
                        "province": "上海",
                        "region": "上海",
                        "normalizedName": "上海",
                    }
                ],
            )
        if request.url.path == "/hotels/search":
            assert request.url.params["destinationId"] == "11111111-1111-1111-1111-111111111111"
            assert request.url.params["dateFrom"] == "2026-06-01"
            assert request.url.params["dateTo"] == "2026-06-03"
            assert request.url.params["adults"] == "2"
            return httpx.Response(
                200,
                json=[
                    {
                        "hotelId": 42,
                        "name": "外滩江景精选酒店",
                        "rating": 4.8,
                        "description": "步行可达外滩，适合城市观景。",
                        "location": {"idLocation": "11111111-1111-1111-1111-111111111111", "region": "黄浦", "country": "中国"},
                        "photos": ["https://img.example/hotel.jpg"],
                        "pricePerAdult": 680,
                    }
                ],
            )
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    return lambda: httpx.AsyncClient(transport=transport)


def amap_hotel_client_factory():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/place/text":
            assert request.url.params["types"] == "100000"
            return httpx.Response(
                200,
                json={
                    "status": "1",
                    "pois": [
                        {
                            "id": "amap-hotel-1",
                            "name": "外滩真实酒店",
                            "type": "住宿服务;宾馆酒店",
                            "location": "121.490000,31.240000",
                            "address": "中山东一路",
                            "photos": [{"url": "https://img.example/amap-hotel.jpg"}],
                        }
                    ],
                },
            )
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    return lambda: httpx.AsyncClient(transport=transport)


def transport_client_factory():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/transports/tickets":
            assert request.url.params["departureCity"] == "北京"
            assert request.url.params["arrivalCity"] == "上海"
            assert request.url.params["departureDate"] == "2026-06-01"
            assert request.url.params["onlyAvailable"] == "true"
            ticket_type = request.url.params["type"]
            if ticket_type == "TRAIN":
                return httpx.Response(
                    200,
                    json=[
                        {
                            "id": "train-offer-1",
                            "type": "TRAIN",
                            "departureCity": "北京",
                            "arrivalCity": "上海",
                            "departureStationCode": "BJP",
                            "departureTerminalName": "北京南",
                            "arrivalStationCode": "SHA",
                            "arrivalTerminalName": "上海虹桥",
                            "departureTime": "08:00",
                            "arrivalTime": "12:30",
                            "duration": "4h 30m",
                            "carrier": "中国铁路",
                            "code": "G101",
                            "seatClass": "二等座",
                            "price": 553,
                            "remainingSeats": 20,
                            "totalSeats": 120,
                            "successRate": "高",
                            "notice": "余票充足",
                        }
                    ],
                )
            return httpx.Response(200, json=[])
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    return lambda: httpx.AsyncClient(transport=transport)


@pytest.mark.asyncio
async def test_hotel_search_returns_database_booking_link_candidates() -> None:
    result = await HotelSearchTool(load_settings(), client_factory=hotel_client_factory()).search_hotels(sample_request())

    assert result.status == ToolStatus.PARTIAL_SUCCESS
    assert any(warning.code == "HOTEL_AMAP_FALLBACK_DATABASE" for warning in result.warnings)
    assert result.data
    first = result.data[0]
    assert first.type == PlaceType.HOTEL
    assert first.source == PlaceSource.INTERNAL_OFFER
    assert first.internalOfferId is None
    assert first.bookingLinks[0].type == "HOTEL"
    assert first.bookingLinks[0].hotelId == 42
    assert first.bookingLinks[0].url.startswith("/reservations/hotels?")


@pytest.mark.asyncio
async def test_hotel_search_prefers_amap_hotels(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AMAP_API_KEY", "test-key")
    monkeypatch.setenv("AMAP_BASE_URL", "https://amap.test")
    result = await HotelSearchTool(load_settings(), client_factory=amap_hotel_client_factory()).search_hotels(sample_request())

    assert result.status == ToolStatus.SUCCESS
    assert result.data
    first = result.data[0]
    assert first.type == PlaceType.HOTEL
    assert first.source == PlaceSource.AMAP
    assert first.amapPoiId == "amap-hotel-1"
    assert first.imageUrl == "https://img.example/amap-hotel.jpg"
    assert first.bookingLinks[0].hotelId is None
    assert first.bookingLinks[0].url.startswith("/reservations/hotels?")


@pytest.mark.asyncio
async def test_weather_and_transport_return_structured_database_data() -> None:
    request = sample_request()

    weather = await WeatherTool(load_settings()).get_weather(request)
    transport = await TransportSearchTool(load_settings(), client_factory=transport_client_factory()).search_flights(request)

    assert weather.status == ToolStatus.SUCCESS
    assert weather.data["city"] == "上海"
    assert len(weather.data["daily"]) == 3
    assert transport.status == ToolStatus.SUCCESS
    assert transport.data[0]["mode"] == "train"
    assert transport.data[0]["bookingLink"]["url"].startswith("/reservations/trains?")
    assert transport.data[0]["plannerPlace"]["type"] == "TRANSPORT"
    assert transport.data[0]["plannerPlace"]["bookingLinks"][0]["bookingCode"] == "G101"


@pytest.mark.asyncio
async def test_transport_search_skips_ticket_candidates_without_departure_city() -> None:
    result = await TransportSearchTool(load_settings(), client_factory=transport_client_factory()).search_flights(
        sample_request(include_departure_city=False)
    )

    assert result.status == ToolStatus.SKIPPED
    assert result.data == []
    assert result.warnings[0].code == "TRANSPORT_DEPARTURE_CITY_MISSING"


@pytest.mark.asyncio
async def test_budget_estimate_uses_hotels_and_transport() -> None:
    request = sample_request()
    hotels = (await HotelSearchTool(load_settings(), client_factory=hotel_client_factory()).search_hotels(request)).data
    transport = (
        await TransportSearchTool(load_settings(), client_factory=transport_client_factory()).search_flights(request)
    ).data

    result = await BudgetEstimateTool().estimate_budget(request, hotels=hotels, transport_options=transport)

    assert result.status == ToolStatus.SUCCESS
    assert result.data["currency"] == "CNY"
    assert result.data["total"] > 0
    assert result.data["breakdown"]["hotel"] > 0
    assert result.data["breakdown"]["intercityTransport"] > 0


def test_hotel_and_transport_tools_do_not_import_travel_tool_mocks() -> None:
    root = Path(__file__).resolve().parents[1]
    hotel_source = (root / "app" / "tools" / "hotel_search_tool.py").read_text(encoding="utf-8")
    transport_source = (root / "app" / "tools" / "transport_search_tool.py").read_text(encoding="utf-8")

    assert "app.mock_data.travel_tools" not in hotel_source
    assert "app.mock_data.travel_tools" not in transport_source
