from __future__ import annotations

import os
from dataclasses import dataclass

from app.config import AgentSettings


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


def _clamp_int(value: int, minimum: int, maximum: int) -> int:
    return max(min(value, maximum), minimum)


@dataclass(frozen=True)
class RuntimePolicy:
    max_tool_calls_per_turn: int = 5
    max_model_calls_per_turn: int = 1
    max_react_steps: int = 3
    max_react_tool_calls: int = 4
    max_execution_time_seconds: float = 120.0
    model_timeout_seconds: float = 90.0
    default_tool_timeout_seconds: float = 10.0
    trace_enabled: bool = True

    @classmethod
    def from_env(cls) -> "RuntimePolicy":
        model_timeout_seconds = _as_float(
            os.getenv("AI_MODEL_TIMEOUT_SECONDS") or os.getenv("DEEPSEEK_TIMEOUT_SECONDS"),
            90.0,
        )
        return cls(
            max_tool_calls_per_turn=_as_int(os.getenv("AGENT_MAX_TOOL_CALLS_PER_TURN"), 5),
            max_model_calls_per_turn=_clamp_int(_as_int(os.getenv("AGENT_MAX_MODEL_CALLS_PER_TURN"), 1), 1, 2),
            max_react_steps=_clamp_int(_as_int(os.getenv("AGENT_MAX_REACT_STEPS"), 3), 1, 3),
            max_react_tool_calls=_clamp_int(_as_int(os.getenv("AGENT_MAX_REACT_TOOL_CALLS"), 4), 1, 4),
            max_execution_time_seconds=_as_float(os.getenv("AGENT_MAX_RUNTIME_SECONDS"), 120.0),
            model_timeout_seconds=_as_float(os.getenv("AGENT_MODEL_TIMEOUT_SECONDS"), model_timeout_seconds),
            default_tool_timeout_seconds=_as_float(os.getenv("AGENT_TOOL_TIMEOUT_SECONDS"), 10.0),
            trace_enabled=_as_bool(os.getenv("AGENT_TRACE_ENABLED"), True),
        )

    @classmethod
    def from_settings(cls, settings: AgentSettings) -> "RuntimePolicy":
        return cls(
            max_tool_calls_per_turn=settings.agent_max_tool_calls_per_turn,
            max_model_calls_per_turn=_clamp_int(settings.agent_max_model_calls_per_turn, 1, 2),
            max_react_steps=_clamp_int(settings.agent_max_react_steps, 1, 3),
            max_react_tool_calls=_clamp_int(settings.agent_max_react_tool_calls, 1, 4),
            max_execution_time_seconds=settings.agent_max_runtime_seconds,
            model_timeout_seconds=settings.agent_model_timeout_seconds,
            default_tool_timeout_seconds=settings.agent_tool_timeout_seconds,
            trace_enabled=settings.agent_trace_enabled,
        )
