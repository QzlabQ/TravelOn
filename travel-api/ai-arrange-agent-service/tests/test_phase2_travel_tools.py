from __future__ import annotations

import pytest

from app.config import load_settings
from app.harness.tool_result import ToolStatus
from app.models import AgentRunRequest, PlaceSource, PlaceType
from app.tools.budget_tool import BudgetEstimateTool
from app.tools.hotel_search_tool import HotelSearchTool
from app.tools.transport_search_tool import TransportSearchTool
from app.tools.weather_tool import WeatherTool


def sample_request() -> AgentRunRequest:
    return AgentRunRequest.model_validate(
        {
            "conversationId": "00000000-0000-0000-0000-000000000010",
            "userId": "00000000-0000-0000-0000-000000000001",
            "coreSlots": {
                "city": "Shanghai",
                "travelStartDate": "2026-06-01",
                "travelEndDate": "2026-06-03",
                "peopleCount": 2,
                "budget": "standard",
                "transportPreference": "train",
            },
            "userMessage": "Prefer relaxed route and river view hotel.",
            "userContext": {
                "travelPreferences": {"budgetLevel": "standard"},
                "historicalTrips": [],
                "familyProfile": {"withChildren": False},
                "budgetProfile": {"level": "standard"},
            },
        }
    )


@pytest.mark.asyncio
async def test_mock_hotel_search_returns_internal_offer_candidates() -> None:
    result = await HotelSearchTool(load_settings()).search_hotels(sample_request())

    assert result.status == ToolStatus.SUCCESS
    assert result.data
    first = result.data[0]
    assert first.type == PlaceType.HOTEL
    assert first.source == PlaceSource.INTERNAL_OFFER
    assert first.internalOfferId is not None


@pytest.mark.asyncio
async def test_mock_weather_and_transport_return_structured_data() -> None:
    request = sample_request()

    weather = await WeatherTool(load_settings()).get_weather(request)
    transport = await TransportSearchTool(load_settings()).search_flights(request)

    assert weather.status == ToolStatus.SUCCESS
    assert weather.data["city"] == "Shanghai"
    assert len(weather.data["daily"]) == 3
    assert transport.status == ToolStatus.SUCCESS
    assert transport.data[0]["mode"] == "train"


@pytest.mark.asyncio
async def test_budget_estimate_uses_hotels_and_transport() -> None:
    request = sample_request()
    hotels = (await HotelSearchTool(load_settings()).search_hotels(request)).data
    transport = (await TransportSearchTool(load_settings()).search_flights(request)).data

    result = await BudgetEstimateTool().estimate_budget(request, hotels=hotels, transport_options=transport)

    assert result.status == ToolStatus.SUCCESS
    assert result.data["currency"] == "CNY"
    assert result.data["total"] > 0
    assert result.data["breakdown"]["hotel"] > 0
