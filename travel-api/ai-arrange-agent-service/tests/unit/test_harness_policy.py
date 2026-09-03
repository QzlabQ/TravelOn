from __future__ import annotations

from app.config import AgentSettings
from app.clients.openai_compatible_client import OpenAICompatibleClient
from app.harness.policy import RuntimePolicy
from app.services.fallback_plan_builder import FallbackPlanBuilder
from app.services.planner_agent import PlannerAgent
from app.tools.amap_tool import AmapPoiTool
from app.tools.budget_tool import BudgetEstimateTool
from app.tools.hotel_search_tool import HotelSearchTool
from app.tools.internal_offer_tool import InternalOfferTool
from app.tools.route_tool import RoutePlanTool
from app.tools.transport_search_tool import TransportSearchTool
from app.tools.weather_tool import WeatherTool


def test_runtime_policy_from_settings() -> None:
    settings = AgentSettings(
        app_name="test",
        app_version="0",
        model_api_key="",
        model_base_url="https://example.test",
        model_chat_completions_path="/chat/completions",
        model_name="model",
        model_thinking_type="disabled",
        model_json_mode=True,
        model_temperature=0.1,
        model_timeout_seconds=5,
        model_retry_count=1,
        model_retry_backoff_seconds=0.1,
        model_max_tokens=1200,
        model_slow_response_warning_ms=60000,
        amap_api_key="",
        amap_base_url="https://amap.test",
        amap_enabled=True,
        amap_timeout_seconds=5,
        offer_provider_base_url="http://offer",
        transport_service_base_url="http://travel-core",
        weather_base_url="",
        weather_api_key="",
        agent_tool_mock_enabled=True,
        agent_max_tool_calls_per_turn=3,
        agent_max_model_calls_per_turn=1,
        agent_max_react_steps=3,
        agent_max_react_tool_calls=2,
        agent_max_runtime_seconds=12,
        agent_model_timeout_seconds=9,
        agent_tool_timeout_seconds=4,
        agent_trace_enabled=False,
    )

    policy = RuntimePolicy.from_settings(settings)

    assert policy.max_tool_calls_per_turn == 3
    assert policy.max_model_calls_per_turn == 1
    assert policy.max_react_steps == 3
    assert policy.max_react_tool_calls == 2
    assert policy.max_execution_time_seconds == 12
    assert policy.model_timeout_seconds == 9
    assert policy.default_tool_timeout_seconds == 4
    assert policy.trace_enabled is False


def test_planner_model_tool_uses_dedicated_model_timeout() -> None:
    settings = AgentSettings(
        app_name="test",
        app_version="0",
        model_api_key="key",
        model_base_url="https://example.test",
        model_chat_completions_path="/chat/completions",
        model_name="model",
        model_thinking_type="disabled",
        model_json_mode=True,
        model_temperature=0.1,
        model_timeout_seconds=75,
        model_retry_count=1,
        model_retry_backoff_seconds=0.1,
        model_max_tokens=1200,
        model_slow_response_warning_ms=60000,
        amap_api_key="",
        amap_base_url="https://amap.test",
        amap_enabled=True,
        amap_timeout_seconds=5,
        offer_provider_base_url="http://offer",
        transport_service_base_url="http://travel-core",
        weather_base_url="",
        weather_api_key="",
        agent_tool_mock_enabled=True,
        agent_max_tool_calls_per_turn=3,
        agent_max_model_calls_per_turn=1,
        agent_max_react_steps=3,
        agent_max_react_tool_calls=2,
        agent_max_runtime_seconds=120,
        agent_model_timeout_seconds=75,
        agent_tool_timeout_seconds=4,
        agent_trace_enabled=False,
    )
    policy = RuntimePolicy.from_settings(settings)
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
        policy=policy,
    )

    specs = {spec.name: spec for spec in agent.list_tool_specs()}

    assert specs["model_chat_completion"].timeout_seconds == 75
    assert specs["model_chat_completion"].timeout_seconds != policy.max_execution_time_seconds
