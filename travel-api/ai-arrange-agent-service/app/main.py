from __future__ import annotations

from fastapi import FastAPI

from app.clients.deepseek_client import DeepSeekClient
from app.config import load_settings
from app.harness.policy import RuntimePolicy
from app.models import AgentRunRequest, AgentRunResponse, HealthResponse
from app.services.fallback_plan_builder import FallbackPlanBuilder
from app.services.planner_agent import PlannerAgent
from app.tools.amap_tool import AmapPoiTool
from app.tools.budget_tool import BudgetEstimateTool
from app.tools.hotel_search_tool import HotelSearchTool
from app.tools.internal_offer_tool import InternalOfferTool
from app.tools.route_tool import RoutePlanTool
from app.tools.transport_search_tool import TransportSearchTool
from app.tools.weather_tool import WeatherTool


settings = load_settings()
runtime_policy = RuntimePolicy.from_settings(settings)

agent = PlannerAgent(
    deepseek_client=DeepSeekClient(settings),
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

app = FastAPI(title=settings.app_name, version=settings.app_version)


@app.get("/agent/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="UP",
        service=settings.app_name,
        version=settings.app_version,
        modelProvider="deepseek",
        model=settings.deepseek_model,
        deepseekConfigured=bool(settings.deepseek_api_key),
        amapConfigured=bool(settings.amap_api_key) and settings.amap_enabled,
    )


@app.post("/agent/planner/run", response_model=AgentRunResponse)
async def run_planner(request: AgentRunRequest) -> AgentRunResponse:
    return await agent.run(request)
