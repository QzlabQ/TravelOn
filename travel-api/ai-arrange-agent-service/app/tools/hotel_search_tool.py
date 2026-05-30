from __future__ import annotations

import time
from uuid import NAMESPACE_URL, UUID, uuid5

from app.config import AgentSettings
from app.harness.tool_result import ToolResult, ToolStatus, ToolWarning
from app.mock_data.travel_tools import city_hotels
from app.models import AgentRunRequest, PlaceSource, PlaceType, PlannerPlaceSuggestion


class HotelSearchTool:
    def __init__(self, settings: AgentSettings) -> None:
        self._settings = settings

    async def search_hotels(
        self,
        request: AgentRunRequest,
        limit: int = 3,
        **_,
    ) -> ToolResult:
        started = time.perf_counter()
        warnings: list[ToolWarning] = []

        if not self._settings.agent_tool_mock_enabled:
            return ToolResult(
                tool="search_hotels",
                status=ToolStatus.SKIPPED,
                data=[],
                errorMessage="Real offer-provider connector is not implemented yet",
                latencyMs=self._latency_ms(started),
                userMessage="酒店查询连接器尚未启用，已跳过酒店候选查询。",
                warnings=[
                    ToolWarning(
                        code="HOTEL_CONNECTOR_NOT_IMPLEMENTED",
                        message="酒店查询当前仅支持模拟模式。",
                        source="search_hotels",
                    )
                ],
            )

        hotels = [self._to_place(item) for item in city_hotels(request.coreSlots.city)[:limit]]
        if request.coreSlots.accommodationPreference:
            preference = request.coreSlots.accommodationPreference
            for hotel in hotels:
                hotel.tags.append(preference)

        warnings.append(
            ToolWarning(
                code="MOCK_DATA_USED",
                message="酒店候选来自本地模拟数据。",
                source="search_hotels",
            )
        )
        return ToolResult(
            tool="search_hotels",
            status=ToolStatus.SUCCESS if hotels else ToolStatus.PARTIAL_SUCCESS,
            data=hotels,
            latencyMs=self._latency_ms(started),
            userMessage=f"已找到 {len(hotels)} 个酒店候选。",
            warnings=warnings,
        )

    def _to_place(self, item: dict) -> PlannerPlaceSuggestion:
        internal_offer_id = item.get("internalOfferId")
        return PlannerPlaceSuggestion(
            placeId=uuid5(NAMESPACE_URL, f"hotel:{internal_offer_id or item['name']}"),
            name=item["name"],
            type=PlaceType.HOTEL,
            source=PlaceSource.INTERNAL_OFFER if internal_offer_id else PlaceSource.AI,
            internalOfferId=UUID(internal_offer_id) if internal_offer_id else None,
            latitude=item.get("latitude"),
            longitude=item.get("longitude"),
            address=item.get("address"),
            description=f"位于{item.get('area')}，约 CNY {item.get('pricePerNight')}/晚",
            selected=False,
            tags=list(item.get("tags", [])),
            pricePerNight=item.get("pricePerNight"),
            starRating=item.get("starRating"),
            area=item.get("area"),
        )

    def _latency_ms(self, started: float) -> int:
        return int((time.perf_counter() - started) * 1000)
