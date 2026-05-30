from __future__ import annotations

from datetime import timedelta
import time
from typing import Any

from app.config import AgentSettings
from app.harness.tool_result import ToolResult, ToolStatus, ToolWarning
from app.mock_data.travel_tools import city_weather
from app.models import AgentRunRequest


class WeatherTool:
    def __init__(self, settings: AgentSettings) -> None:
        self._settings = settings

    async def get_weather(
        self,
        request: AgentRunRequest,
        **_,
    ) -> ToolResult:
        started = time.perf_counter()

        if not self._settings.agent_tool_mock_enabled and not self._settings.weather_api_key:
            return ToolResult(
                tool="get_weather",
                status=ToolStatus.SKIPPED,
                data=None,
                errorMessage="WEATHER_API_KEY is not configured",
                latencyMs=self._latency_ms(started),
                userMessage="天气服务未配置，已跳过天气查询。",
                warnings=[
                    ToolWarning(
                        code="WEATHER_DISABLED",
                        message="天气 API 未配置。",
                        source="get_weather",
                    )
                ],
            )

        weather = self._expand_dates(city_weather(request.coreSlots.city), request)
        return ToolResult(
            tool="get_weather",
            status=ToolStatus.SUCCESS,
            data=weather,
            latencyMs=self._latency_ms(started),
            userMessage=f"已获取 {request.coreSlots.city} 出行天气参考。",
            warnings=[
                ToolWarning(
                    code="MOCK_DATA_USED",
                    message="天气信息来自本地模拟数据。",
                    source="get_weather",
                )
            ]
            if self._settings.agent_tool_mock_enabled
            else [],
        )

    def _expand_dates(self, weather: dict[str, Any], request: AgentRunRequest) -> dict[str, Any]:
        result = dict(weather)
        start_date = request.coreSlots.travelStartDate
        daily = []
        source_daily = weather.get("daily") if isinstance(weather.get("daily"), list) else []
        for index in range(request.coreSlots.day_count()):
            source = dict(source_daily[index % len(source_daily)]) if source_daily else {}
            source.pop("dateOffset", None)
            source["date"] = (start_date + timedelta(days=index)).isoformat() if start_date else None
            daily.append(source)
        result["daily"] = daily
        result["city"] = request.coreSlots.city
        return result

    def _latency_ms(self, started: float) -> int:
        return int((time.perf_counter() - started) * 1000)
