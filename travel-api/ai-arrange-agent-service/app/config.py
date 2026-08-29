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
    model_api_key: str
    model_base_url: str
    model_chat_completions_path: str
    model_name: str
    model_thinking_type: str
    model_json_mode: bool
    model_temperature: float
    model_timeout_seconds: float
    model_retry_count: int
    model_retry_backoff_seconds: float
    model_max_tokens: int
    model_slow_response_warning_ms: int
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
    model_timeout_seconds = _as_float(
        os.getenv("AI_MODEL_TIMEOUT_SECONDS") or os.getenv("DEEPSEEK_TIMEOUT_SECONDS"),
        90.0,
    )
    return AgentSettings(
        app_name=os.getenv("AGENT_APP_NAME", "ai-arrange-agent-service"),
        app_version=os.getenv("AGENT_APP_VERSION", "0.1.0"),
        model_api_key=os.getenv("AI_API_KEY") or os.getenv("DEEPSEEK_API_KEY", ""),
        model_base_url=os.getenv("AI_BASE_URL") or os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
        model_chat_completions_path=os.getenv("AI_CHAT_COMPLETIONS_PATH") or os.getenv("DEEPSEEK_CHAT_COMPLETIONS_PATH", "/chat/completions"),
        model_name=os.getenv("AI_MODEL") or os.getenv("DEEPSEEK_MODEL", "deepseek-v4-pro"),
        model_thinking_type=os.getenv("AI_THINKING_TYPE") or os.getenv("DEEPSEEK_THINKING_TYPE") or "omit",
        model_json_mode=_as_bool(os.getenv("AI_JSON_MODE"), True),
        model_temperature=_as_float(os.getenv("AI_TEMPERATURE") or os.getenv("DEEPSEEK_TEMPERATURE"), 0.6),
        model_timeout_seconds=model_timeout_seconds,
        model_retry_count=_as_int(os.getenv("AI_RETRY_COUNT") or os.getenv("DEEPSEEK_RETRY_COUNT"), 1),
        model_retry_backoff_seconds=_as_float(os.getenv("AI_RETRY_BACKOFF_SECONDS") or os.getenv("DEEPSEEK_RETRY_BACKOFF_SECONDS"), 1.0),
        model_max_tokens=_as_int(os.getenv("AI_MAX_TOKENS") or os.getenv("DEEPSEEK_MAX_TOKENS"), 12000),
        model_slow_response_warning_ms=_as_int(os.getenv("AI_SLOW_RESPONSE_WARNING_MS") or os.getenv("DEEPSEEK_SLOW_RESPONSE_WARNING_MS"), 60000),
        amap_api_key=os.getenv("AMAP_API_KEY", ""),
        amap_base_url=os.getenv("AMAP_BASE_URL", "https://restapi.amap.com/v3"),
        amap_enabled=_as_bool(os.getenv("AMAP_ENABLED"), True),
        amap_timeout_seconds=_as_float(os.getenv("AMAP_TIMEOUT_SECONDS"), 8.0),
        offer_provider_base_url=os.getenv("OFFER_PROVIDER_BASE_URL", "http://offer-provider-service"),
        transport_service_base_url=os.getenv("TRANSPORT_SERVICE_BASE_URL", "http://transport-service"),
        weather_base_url=os.getenv("WEATHER_BASE_URL", ""),
        weather_api_key=os.getenv("WEATHER_API_KEY", ""),
        agent_tool_mock_enabled=_as_bool(os.getenv("AGENT_TOOL_MOCK_ENABLED"), True),
        agent_max_tool_calls_per_turn=_as_int(os.getenv("AGENT_MAX_TOOL_CALLS_PER_TURN"), 5),
        agent_max_model_calls_per_turn=_as_int(os.getenv("AGENT_MAX_MODEL_CALLS_PER_TURN"), 1),
        agent_max_react_steps=_as_int(os.getenv("AGENT_MAX_REACT_STEPS"), 3),
        agent_max_react_tool_calls=_as_int(os.getenv("AGENT_MAX_REACT_TOOL_CALLS"), 4),
        agent_max_runtime_seconds=_as_float(os.getenv("AGENT_MAX_RUNTIME_SECONDS"), 120.0),
        agent_model_timeout_seconds=_as_float(os.getenv("AGENT_MODEL_TIMEOUT_SECONDS"), model_timeout_seconds),
        agent_tool_timeout_seconds=_as_float(os.getenv("AGENT_TOOL_TIMEOUT_SECONDS"), 10.0),
        agent_trace_enabled=_as_bool(os.getenv("AGENT_TRACE_ENABLED"), True),
        travel_gateway_base_url=os.getenv("TRAVEL_GATEWAY_BASE_URL", "http://gateway:8082"),
    )
