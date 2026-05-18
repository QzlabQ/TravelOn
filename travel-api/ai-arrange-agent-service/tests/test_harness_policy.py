from __future__ import annotations

from app.config import AgentSettings
from app.harness.policy import RuntimePolicy


def test_runtime_policy_from_settings() -> None:
    settings = AgentSettings(
        app_name="test",
        app_version="0",
        deepseek_api_key="",
        deepseek_base_url="https://example.test",
        deepseek_chat_completions_path="/chat/completions",
        deepseek_model="model",
        deepseek_temperature=0.1,
        deepseek_timeout_seconds=5,
        deepseek_retry_count=1,
        deepseek_retry_backoff_seconds=0.1,
        amap_api_key="",
        amap_base_url="https://amap.test",
        amap_enabled=True,
        amap_timeout_seconds=5,
        offer_provider_base_url="http://offer",
        transport_service_base_url="http://transport",
        weather_base_url="",
        weather_api_key="",
        agent_tool_mock_enabled=True,
        agent_max_tool_calls_per_turn=3,
        agent_max_model_calls_per_turn=1,
        agent_max_react_steps=3,
        agent_max_react_tool_calls=2,
        agent_max_runtime_seconds=12,
        agent_tool_timeout_seconds=4,
        agent_trace_enabled=False,
    )

    policy = RuntimePolicy.from_settings(settings)

    assert policy.max_tool_calls_per_turn == 3
    assert policy.max_model_calls_per_turn == 1
    assert policy.max_react_steps == 3
    assert policy.max_react_tool_calls == 2
    assert policy.max_execution_time_seconds == 12
    assert policy.default_tool_timeout_seconds == 4
    assert policy.trace_enabled is False
