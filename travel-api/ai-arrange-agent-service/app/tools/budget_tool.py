from __future__ import annotations

import time
from typing import Any

from app.harness.tool_result import ToolResult, ToolStatus
from app.mock_data.travel_tools import BUDGET_LEVELS
from app.models import AgentRunRequest, PlannerPlaceSuggestion


class BudgetEstimateTool:
    async def estimate_budget(
        self,
        request: AgentRunRequest,
        hotels: list[PlannerPlaceSuggestion] | None = None,
        transport_options: list[dict[str, Any]] | None = None,
        **_,
    ) -> ToolResult:
        started = time.perf_counter()
        days = request.coreSlots.day_count()
        people = max(request.coreSlots.peopleCount or 1, 1)
        level = self._budget_level(request)
        rules = BUDGET_LEVELS[level]

        hotel_nights = max(days - 1, 1)
        hotel_per_night = self._hotel_price(hotels) or rules["hotelNight"]
        transport_per_person = self._transport_price(transport_options)

        hotel_total = hotel_per_night * hotel_nights
        meals_total = rules["mealPersonDay"] * people * days
        local_transport_total = rules["localTransportPersonDay"] * people * days
        tickets_total = rules["ticketPersonDay"] * people * days
        intercity_transport_total = transport_per_person * people if transport_per_person else 0
        total = hotel_total + meals_total + local_transport_total + tickets_total + intercity_transport_total

        data = {
            "currency": "CNY",
            "level": level,
            "peopleCount": people,
            "days": days,
            "breakdown": {
                "hotel": hotel_total,
                "meals": meals_total,
                "localTransport": local_transport_total,
                "tickets": tickets_total,
                "intercityTransport": intercity_transport_total,
            },
            "total": total,
            "perPerson": round(total / people, 2),
            "summary": f"预计总预算约 CNY {total}，人均约 CNY {round(total / people, 2)}。",
        }
        return ToolResult(
            tool="estimate_budget",
            status=ToolStatus.SUCCESS,
            data=data,
            latencyMs=int((time.perf_counter() - started) * 1000),
            userMessage="已完成预算估算。",
        )

    def _budget_level(self, request: AgentRunRequest) -> str:
        raw_values = [
            request.coreSlots.budget,
            request.userContext.budgetProfile.get("level") if request.userContext else None,
            request.userContext.travelPreferences.get("budgetLevel") if request.userContext else None,
        ]
        text = " ".join(str(value).lower() for value in raw_values if value)
        if any(keyword in text for keyword in ["premium", "luxury", "高端", "舒适"]):
            return "premium"
        if any(keyword in text for keyword in ["budget", "cheap", "经济", "穷游"]):
            return "budget"
        return "standard"

    def _hotel_price(self, hotels: list[PlannerPlaceSuggestion] | None) -> int | None:
        prices = []
        for hotel in hotels or []:
            value = getattr(hotel, "pricePerNight", None)
            if isinstance(value, int | float):
                prices.append(int(value))
        if not prices:
            return None
        return int(sum(prices) / len(prices))

    def _transport_price(self, transport_options: list[dict[str, Any]] | None) -> int:
        prices = [int(item["estimatedPrice"]) for item in transport_options or [] if item.get("estimatedPrice")]
        return min(prices) if prices else 0
