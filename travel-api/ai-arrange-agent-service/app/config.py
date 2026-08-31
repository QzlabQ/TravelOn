from __future__ import annotations

import os
from dataclasses import dataclass


def _as_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _as_int(value: str | None, default: int) -> int:
    if value is None or value.strip() == "":
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _as_float(value: str | None, default: float) -> float:
    if value is None or value.strip() == "":
        return default
    try:
        return float(value)
    except ValueError:
        return default


@dataclass(frozen=True)
class AgentSettings:
    app_name: str
    app_version: str
    deepseek_api_key: str
    deepseek_base_url: str
    deepseek_chat_completions_path: str
    deepseek_model: str
    deepseek_flash_model: str
    deepseek_pro_model: str
    deepseek_thinking_type: str
    deepseek_temperature: float
    deepseek_timeout_seconds: float
    deepseek_retry_count: int
    deepseek_retry_backoff_seconds: float
    deepseek_max_tokens: int
    deepseek_slow_response_warning_ms: int
    amap_api_key: str
    amap_base_url: str
    amap_enabled: bool
    amap_timeout_seconds: float
    offer_provider_base_url: str
    transport_service_base_url: str
    weather_base_url: str
    weather_api_key: str
    agent_tool_mock_enabled: bool
    agent_max_tool_calls_per_turn: int
    agent_max_model_calls_per_turn: int
    agent_max_react_steps: int
    agent_max_react_tool_calls: int
    agent_max_runtime_seconds: float
    agent_model_timeout_seconds: float
    agent_tool_timeout_seconds: float
    agent_trace_enabled: bool
    travel_gateway_base_url: str = "http://gateway:8082"


def load_settings() -> AgentSettings:
    deepseek_timeout_seconds = _as_float(os.getenv("DEEPSEEK_TIMEOUT_SECONDS"), 90.0)
    deepseek_model = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-pro")
    return AgentSettings(
        app_name=os.getenv("AGENT_APP_NAME", "ai-arrange-agent-service"),
        app_version=os.getenv("AGENT_APP_VERSION", "0.1.0"),
        deepseek_api_key=os.getenv("DEEPSEEK_API_KEY", ""),
        deepseek_base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
        deepseek_chat_completions_path=os.getenv("DEEPSEEK_CHAT_COMPLETIONS_PATH", "/chat/completions"),
        deepseek_model=deepseek_model,
        deepseek_flash_model=os.getenv("DEEPSEEK_FLASH_MODEL") or "deepseek-v4-flash",
        deepseek_pro_model=os.getenv("DEEPSEEK_PRO_MODEL") or deepseek_model,
        deepseek_thinking_type=os.getenv("DEEPSEEK_THINKING_TYPE") or "disabled",
        deepseek_temperature=_as_float(os.getenv("DEEPSEEK_TEMPERATURE"), 0.6),
        deepseek_timeout_seconds=deepseek_timeout_seconds,
        deepseek_retry_count=_as_int(os.getenv("DEEPSEEK_RETRY_COUNT"), 1),
        deepseek_retry_backoff_seconds=_as_float(os.getenv("DEEPSEEK_RETRY_BACKOFF_SECONDS"), 1.0),
        deepseek_max_tokens=_as_int(os.getenv("DEEPSEEK_MAX_TOKENS"), 12000),
        deepseek_slow_response_warning_ms=_as_int(os.getenv("DEEPSEEK_SLOW_RESPONSE_WARNING_MS"), 60000),
        amap_api_key=os.getenv("AMAP_API_KEY", ""),
        amap_base_url=os.getenv("AMAP_BASE_URL", "https://restapi.amap.com/v3"),
        amap_enabled=_as_bool(os.getenv("AMAP_ENABLED"), True),
        amap_timeout_seconds=_as_float(os.getenv("AMAP_TIMEOUT_SECONDS"), 8.0),
        offer_provider_base_url=os.getenv("OFFER_PROVIDER_BASE_URL", "http://gateway:8082"),
        transport_service_base_url=os.getenv("TRANSPORT_SERVICE_BASE_URL", "http://travel-core:8083"),
        weather_base_url=os.getenv("WEATHER_BASE_URL", ""),
        weather_api_key=os.getenv("WEATHER_API_KEY", ""),
        agent_tool_mock_enabled=_as_bool(os.getenv("AGENT_TOOL_MOCK_ENABLED"), True),
        agent_max_tool_calls_per_turn=_as_int(os.getenv("AGENT_MAX_TOOL_CALLS_PER_TURN"), 5),
        agent_max_model_calls_per_turn=_as_int(os.getenv("AGENT_MAX_MODEL_CALLS_PER_TURN"), 1),
        agent_max_react_steps=_as_int(os.getenv("AGENT_MAX_REACT_STEPS"), 3),
        agent_max_react_tool_calls=_as_int(os.getenv("AGENT_MAX_REACT_TOOL_CALLS"), 4),
        agent_max_runtime_seconds=_as_float(os.getenv("AGENT_MAX_RUNTIME_SECONDS"), 120.0),
        agent_model_timeout_seconds=_as_float(os.getenv("AGENT_MODEL_TIMEOUT_SECONDS"), deepseek_timeout_seconds),
        agent_tool_timeout_seconds=_as_float(os.getenv("AGENT_TOOL_TIMEOUT_SECONDS"), 10.0),
        agent_trace_enabled=_as_bool(os.getenv("AGENT_TRACE_ENABLED"), True),
        travel_gateway_base_url=os.getenv("TRAVEL_GATEWAY_BASE_URL", "http://gateway:8082"),
    )
