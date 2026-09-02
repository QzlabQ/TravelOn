from __future__ import annotations

import json
from typing import Any

from fastapi import FastAPI
from fastapi.responses import JSONResponse, StreamingResponse

from app.clients.openai_compatible_client import OpenAICompatibleClient
from app.config import load_settings
from app.harness.policy import RuntimePolicy
from app.models import AgentRunRequest, AgentRunResponse, HealthResponse, PlannerStreamEvent
from app.services.fallback_plan_builder import FallbackPlanBuilder
from app.services.planner_agent import PlannerAgent
from app.tools.amap_tool import AmapPoiTool
from app.tools.budget_tool import BudgetEstimateTool
from app.tools.hotel_search_tool import HotelSearchTool
from app.tools.internal_offer_tool import InternalOfferTool
from app.tools.route_tool import RoutePlanTool
from app.tools.transport_search_tool import TransportSearchTool
from app.tools.weather_tool import WeatherTool


class AsciiSafeJSONResponse(JSONResponse):
    media_type = "application/json; charset=utf-8"

    def render(self, content: Any) -> bytes:
        return json.dumps(
            content,
            ensure_ascii=True,
            allow_nan=False,
            separators=(",", ":"),
        ).encode("utf-8")


def format_sse_event(event: PlannerStreamEvent) -> str:
    payload = json.dumps(
        event.model_dump(mode="json", exclude_none=True),
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
    )
    return f"event: {event.type.value}\ndata: {payload}\n\n"


settings = load_settings()
runtime_policy = RuntimePolicy.from_settings(settings)

agent = PlannerAgent(
    model_client=OpenAICompatibleClient(settings),
    amap_tool=AmapPoiTool(settings),
    hotel_search_tool=HotelSearchTool(settings),
    route_tool=RoutePlanTool(),
    internal_offer_tool=InternalOfferTool(),
    transport_search_tool=TransportSearchTool(settings),
    weather_tool=WeatherTool(settings),
    budget_tool=BudgetEstimateTool(),
    fallback_builder=FallbackPlanBuilder(),
    policy=runtime_policy,
)

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    default_response_class=AsciiSafeJSONResponse,
)


@app.get("/agent/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="UP",
        service=settings.app_name,
        version=settings.app_version,
        modelProvider="openai-compatible",
        model=settings.model_name,
        modelConfigured=bool(settings.model_api_key),
        amapConfigured=bool(settings.amap_api_key) and settings.amap_enabled,
    )


@app.post("/agent/planner/run", response_model=AgentRunResponse)
async def run_planner(request: AgentRunRequest) -> AgentRunResponse:
    return await agent.run(request)


@app.post("/agent/planner/stream")
async def stream_planner(request: AgentRunRequest) -> StreamingResponse:
    async def event_generator():
        async for event in agent.stream(request):
            yield format_sse_event(event)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
