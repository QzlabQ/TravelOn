from __future__ import annotations

import time

from app.harness.tool_result import ToolResult, ToolStatus
from app.models import PlaceSource, PlaceType, PlannerPlaceSuggestion


class InternalOfferTool:
    async def match_hotels(
        self,
        places: list[PlannerPlaceSuggestion],
        hotels: list[PlannerPlaceSuggestion] | None = None,
        **_,
    ) -> ToolResult:
        started = time.perf_counter()
        merged = list(places)
        known_names = {place.name.lower() for place in merged}

        for hotel in hotels or []:
            if hotel.name.lower() not in known_names:
                merged.append(hotel)
                known_names.add(hotel.name.lower())

        for place in merged:
            if place.type == PlaceType.HOTEL and place.internalOfferId:
                place.source = PlaceSource.INTERNAL_OFFER
                if "internal-offer" not in place.tags:
                    place.tags.append("internal-offer")

        return ToolResult(
            tool="internal_hotel_match",
            status=ToolStatus.SUCCESS if merged else ToolStatus.SKIPPED,
            data=merged,
            latencyMs=int((time.perf_counter() - started) * 1000),
            userMessage=self._message(merged),
        )

    def _message(self, places: list[PlannerPlaceSuggestion]) -> str:
        matched = [place for place in places if place.type == PlaceType.HOTEL and place.internalOfferId]
        if not matched:
            return "暂未匹配到内部可订酒店，已保留普通点位建议。"
        return f"已匹配 {len(matched)} 个内部可订酒店候选。"
