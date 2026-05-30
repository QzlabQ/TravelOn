from __future__ import annotations

import time
from typing import Any

from app.config import AgentSettings
from app.harness.tool_result import ToolResult, ToolStatus, ToolWarning
from app.mock_data.travel_tools import city_transport_options
from app.models import AgentRunRequest


class TransportSearchTool:
    def __init__(self, settings: AgentSettings) -> None:
        self._settings = settings

    async def search_flights(
        self,
        request: AgentRunRequest,
        limit: int = 3,
        **_,
    ) -> ToolResult:
        started = time.perf_counter()

        if not self._settings.agent_tool_mock_enabled:
            return ToolResult(
                tool="search_flights",
                status=ToolStatus.SKIPPED,
                data=[],
                errorMessage="Real transport-service connector is not implemented yet",
                latencyMs=self._latency_ms(started),
                userMessage="交通查询连接器尚未启用，已跳过机票/交通候选查询。",
                warnings=[
                    ToolWarning(
                        code="TRANSPORT_CONNECTOR_NOT_IMPLEMENTED",
                        message="交通查询当前仅支持模拟模式。",
                        source="search_flights",
                    )
                ],
            )

        options = [self._with_request_context(option, request) for option in city_transport_options(request.coreSlots.city)]
        preferred = self._sort_by_preference(options, request.coreSlots.transportPreference)
        data = preferred[:limit]

        return ToolResult(
            tool="search_flights",
            status=ToolStatus.SUCCESS if data else ToolStatus.PARTIAL_SUCCESS,
            data=data,
            latencyMs=self._latency_ms(started),
            userMessage=f"已整理 {len(data)} 个往返交通候选。",
            warnings=[
                ToolWarning(
                    code="MOCK_DATA_USED",
                    message="交通候选来自本地模拟数据。",
                    source="search_flights",
                )
            ],
        )

    def _with_request_context(self, option: dict[str, Any], request: AgentRunRequest) -> dict[str, Any]:
        result = dict(option)
        result["city"] = request.coreSlots.city
        result["travelStartDate"] = (
            request.coreSlots.travelStartDate.isoformat() if request.coreSlots.travelStartDate else None
        )
        result["travelEndDate"] = request.coreSlots.travelEndDate.isoformat() if request.coreSlots.travelEndDate else None
        return result

    def _sort_by_preference(self, options: list[dict[str, Any]], preference: str | None) -> list[dict[str, Any]]:
        if not preference:
            return options
        normalized = preference.lower()
        return sorted(options, key=lambda item: 0 if normalized in str(item.get("mode", "")).lower() else 1)

    def _latency_ms(self, started: float) -> int:
        return int((time.perf_counter() - started) * 1000)
