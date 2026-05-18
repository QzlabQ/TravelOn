from __future__ import annotations

from typing import Any
from uuid import uuid4

from app.harness.tool_result import ToolResult, ToolStatus
from app.models import AgentRunRequest, PlaceSource, PlaceType, PlannerPlaceSuggestion, PlannerRouteSegment


class FallbackPlanBuilder:
    def build(
        self,
        request: AgentRunRequest,
        places: list[PlannerPlaceSuggestion],
        weather: dict[str, Any] | None = None,
        transport_options: list[dict[str, Any]] | None = None,
        budget: dict[str, Any] | None = None,
        routes: list[PlannerRouteSegment] | None = None,
    ) -> tuple[str, str, str, str, list[PlannerPlaceSuggestion]]:
        slots = request.coreSlots
        city = slots.city or "the destination"
        days = slots.day_count()
        selected_places = self._apply_selection(places, request)

        if not selected_places:
            selected_places = self._placeholder_places(request)
        elif not any(place.type != PlaceType.HOTEL for place in selected_places):
            selected_places = [*selected_places, *self._placeholder_places(request)]

        title = f"{city} {days}-day pre-trip plan"
        summary = self._summary(slots, days)
        assistant_text = (
            f"I prepared a structured {days}-day plan for {city}. "
            "Some map enrichment may be incomplete if external APIs are unavailable."
        )
        next_question = "Would you like to adjust hotel area, route intensity, food preference, or must-visit places?"
        markdown = self._markdown(
            title=title,
            summary=summary,
            places=selected_places,
            days=days,
            weather=weather,
            transport_options=transport_options or [],
            budget=budget,
            routes=routes or [],
        )
        return assistant_text, title, summary, markdown, selected_places

    async def build_result(
        self,
        request: AgentRunRequest,
        places: list[PlannerPlaceSuggestion],
        weather: dict[str, Any] | None = None,
        transport_options: list[dict[str, Any]] | None = None,
        budget: dict[str, Any] | None = None,
        routes: list[PlannerRouteSegment] | None = None,
        **_,
    ) -> ToolResult:
        assistant_text, title, summary, markdown, selected_places = self.build(
            request=request,
            places=places,
            weather=weather,
            transport_options=transport_options,
            budget=budget,
            routes=routes,
        )
        return ToolResult(
            tool="fallback_plan_builder",
            status=ToolStatus.SUCCESS,
            data={
                "assistantText": assistant_text,
                "title": title,
                "summary": summary,
                "markdown": markdown,
                "places": selected_places,
                "nextQuestion": "Would you like to refine the hotel area, route intensity, or selected places?",
            },
            userMessage="已生成基础行程草案。",
        )

    def _apply_selection(
        self,
        places: list[PlannerPlaceSuggestion],
        request: AgentRunRequest,
    ) -> list[PlannerPlaceSuggestion]:
        selected_ids = {str(place_id) for place_id in request.selectedPlaceIds}
        if not selected_ids:
            return places

        applied: list[PlannerPlaceSuggestion] = []
        for place in places:
            place.selected = place.placeId is not None and str(place.placeId) in selected_ids
            applied.append(place)
        return applied

    def _placeholder_places(self, request: AgentRunRequest) -> list[PlannerPlaceSuggestion]:
        keywords = self._keywords(request)
        places: list[PlannerPlaceSuggestion] = []
        for keyword in keywords[:5]:
            places.append(
                PlannerPlaceSuggestion(
                    placeId=uuid4(),
                    name=keyword,
                    type=PlaceType.OTHER,
                    source=PlaceSource.AI,
                    description="AI-generated candidate place. Map coordinates are not available yet.",
                    selected=False,
                    tags=["fallback"],
                )
            )
        return places

    def _keywords(self, request: AgentRunRequest) -> list[str]:
        keywords = [keyword for keyword in request.coreSlots.mustVisitKeywords if keyword]
        if request.coreSlots.travelStyle:
            keywords.append(request.coreSlots.travelStyle)
        if not keywords:
            keywords = ["scenic area", "museum", "local restaurant"]
        return keywords

    def _summary(self, slots, days: int) -> str:
        parts = [f"{days} day(s)"]
        if slots.peopleCount:
            parts.append(f"{slots.peopleCount} traveler(s)")
        if slots.travelStyle:
            parts.append(f"style: {slots.travelStyle}")
        if slots.budget:
            parts.append(f"budget: {slots.budget}")
        return ", ".join(parts)

    def _markdown(
        self,
        title: str,
        summary: str,
        places: list[PlannerPlaceSuggestion],
        days: int,
        weather: dict[str, Any] | None = None,
        transport_options: list[dict[str, Any]] | None = None,
        budget: dict[str, Any] | None = None,
        routes: list[PlannerRouteSegment] | None = None,
    ) -> str:
        lines = [f"# {title}", "", f"Summary: {summary}", ""]
        if weather:
            lines.extend(["## Weather reference", ""])
            if weather.get("summary"):
                lines.append(f"- {weather['summary']}")
            for tip in weather.get("tips", [])[:3]:
                lines.append(f"- Tip: {tip}")
            lines.append("")

        if budget:
            lines.extend(["## Budget estimate", ""])
            lines.append(f"- {budget.get('summary') or 'Budget estimate is available.'}")
            breakdown = budget.get("breakdown")
            if isinstance(breakdown, dict):
                for name, amount in breakdown.items():
                    lines.append(f"- {name}: CNY {amount}")
            lines.append("")

        if transport_options:
            lines.extend(["## Arrival transport candidates", ""])
            for option in transport_options[:3]:
                summary_text = option.get("summary") or f"{option.get('mode')} to {option.get('to')}"
                price = option.get("estimatedPrice")
                price_text = f", approx CNY {price}" if price else ""
                lines.append(f"- {summary_text}{price_text}")
            lines.append("")

        if places:
            lines.extend(["## Recommended places", ""])
            for place in places:
                marker = " selected" if place.selected else ""
                description = f" - {place.description}" if place.description else ""
                lines.append(f"- {place.name}{marker}{description}")
            lines.append("")

        for day in range(1, days + 1):
            day_places = places[day - 1 :: days] if places else []
            lines.extend([f"## Day {day}", ""])
            if day_places:
                names = ", ".join(place.name for place in day_places[:3])
                lines.append(f"- Main route: {names}")
            else:
                lines.append("- Main route: keep the route relaxed and adjust after map enrichment.")
            lines.append("- Notes: keep enough buffer time for meals, transit, and weather changes.")
            lines.append("")
        if routes:
            lines.extend(["## Route estimates", ""])
            for route in routes[:6]:
                if route.summary:
                    lines.append(f"- {route.summary}")
            lines.append("")
        return "\n".join(lines).strip()
