from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel

from app.harness.tool_result import ToolResult, ToolStatus
from app.models import (
    AgentRunRequest,
    PlannerPlaceSuggestion,
    PlannerRouteSegment,
)


MASKED_VALUE = "***"
_SENSITIVE_KEYWORDS = (
    "api_key",
    "apikey",
    "api-key",
    "access_token",
    "auth_token",
    "authorization",
    "bearer",
    "client_secret",
    "credential",
    "password",
    "passwd",
    "secret",
    "session",
    "token",
)
_REDACT_TEXT_PATTERNS = (
    (re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._\-+/=]+"), "Bearer ***"),
    (re.compile(r"(?i)\b(sk-[A-Za-z0-9_-]{8,})\b"), "***"),
)


def sanitize_trace_metadata(metadata: dict[str, Any] | None) -> dict[str, Any]:
    if not metadata:
        return {}
    return _sanitize_value(metadata)


def sanitize_trace_message(message: str | None) -> str | None:
    if message is None:
        return None

    sanitized = message
    for pattern, replacement in _REDACT_TEXT_PATTERNS:
        sanitized = pattern.sub(replacement, sanitized)
    return sanitized


def summarize_tool_input(tool_name: str, kwargs: dict[str, Any]) -> str:
    if not kwargs:
        return f"{tool_name}(no arguments)"

    parts: list[str] = []
    for key in sorted(kwargs):
        value = kwargs[key]
        if key == "request" and isinstance(value, AgentRunRequest):
            parts.append(_summarize_request(value))
            continue
        if key == "planner_constraints" and isinstance(value, dict):
            parts.append(_summarize_planner_constraints(value))
            continue
        if key in {"places", "hotels"} and isinstance(value, list):
            parts.append(_summarize_places_list(key, value))
            continue
        if key in {"transport_options", "routes", "observations", "react_observations"} and isinstance(value, list):
            parts.append(f"{key}={len(value)} item(s)")
            continue
        if key == "weather" and isinstance(value, dict):
            parts.append(_summarize_dict("weather", value))
            continue
        if key == "budget" and isinstance(value, dict):
            parts.append(_summarize_dict("budget", value))
            continue
        parts.append(f"{key}={_summarize_scalar(value)}")
    return f"{tool_name}({'; '.join(parts)})"


def summarize_tool_output(result: ToolResult) -> str:
    status = result.status.value if isinstance(result.status, ToolStatus) else str(result.status)
    if result.succeeded:
        if result.outputSummary:
            return result.outputSummary
        if isinstance(result.data, list):
            return _summarize_list_output(result.tool, result.data)
        if isinstance(result.data, dict):
            return _summarize_dict_output(result.tool, result.data)
        if result.data is None:
            return f"{result.tool} succeeded with no structured data"
        return f"{result.tool} succeeded"

    detail = result.errorCode or result.errorMessage or "unknown error"
    return f"{result.tool} failed ({status}): {detail}"


def _sanitize_value(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return _sanitize_value(value.model_dump(mode="json", exclude_none=True))

    if isinstance(value, dict):
        sanitized: dict[str, Any] = {}
        for key, item in value.items():
            if _is_sensitive_key(key):
                sanitized[key] = MASKED_VALUE
            else:
                sanitized[key] = _sanitize_value(item)
        return sanitized

    if isinstance(value, list):
        return [_sanitize_value(item) for item in value]

    if isinstance(value, tuple):
        return [_sanitize_value(item) for item in value]

    if isinstance(value, str):
        return sanitize_trace_message(value)

    return value


def _is_sensitive_key(key: str) -> bool:
    normalized = key.replace("-", "_").lower()
    if normalized in {"usermessage", "freetext", "history", "notes"}:
        return True
    return any(keyword in normalized for keyword in _SENSITIVE_KEYWORDS)


def _summarize_request(request: AgentRunRequest) -> str:
    slots = request.coreSlots
    date_range = _summarize_date_range(slots.travelStartDate, slots.travelEndDate)
    parts = [
        f"city={slots.city or 'unknown'}",
        f"dates={date_range}",
        f"people={slots.peopleCount or 'n/a'}",
        f"mode={request.planningMode.value}",
        f"scope={request.planningScope.value}",
    ]
    if request.targetDayIndex is not None:
        parts.append(f"targetDay={request.targetDayIndex}")
    if request.latestSnapshot and request.latestSnapshot.version is not None:
        parts.append(f"baseSnapshotVersion={request.latestSnapshot.version}")
    if request.interaction:
        parts.append(
            "interaction="
            f"sel={len(request.interaction.selectedOptionIds) + len(request.interaction.selectedPlaceIds)},"
            f"rej={len(request.interaction.rejectedOptionIds) + len(request.interaction.rejectedPlaceIds)},"
            f"confirm={request.interaction.confirmCurrentPlan}"
        )
    if request.userMessage.strip():
        parts.append(f"userMessageLen={len(request.userMessage.strip())}")
    return "request(" + "; ".join(parts) + ")"


def _summarize_planner_constraints(constraints: dict[str, Any]) -> str:
    selected_places = len(constraints.get("selectedPlaceIds") or [])
    rejected_places = len(constraints.get("rejectedPlaceIds") or [])
    selected_styles = len(constraints.get("selectedStyles") or [])
    has_free_text = bool(constraints.get("freeText"))
    confirm_current_plan = bool(constraints.get("confirmCurrentPlan"))
    return (
        "planner_constraints("
        f"scope={constraints.get('planningScope') or 'n/a'}; "
        f"targetDay={constraints.get('targetDayIndex') or 'n/a'}; "
        f"selectedPlaces={selected_places}; "
        f"rejectedPlaces={rejected_places}; "
        f"selectedStyles={selected_styles}; "
        f"freeText={has_free_text}; "
        f"confirm={confirm_current_plan}"
        ")"
    )


def _summarize_places_list(label: str, value: list[Any]) -> str:
    names: list[str] = []
    for item in value[:3]:
        if isinstance(item, PlannerPlaceSuggestion):
            names.append(item.name)
        elif isinstance(item, dict):
            name = item.get("name")
            if isinstance(name, str) and name.strip():
                names.append(name.strip())
    suffix = "..." if len(value) > 3 else ""
    if names:
        return f"{label}={len(value)} item(s) [{', '.join(names)}{suffix}]"
    return f"{label}={len(value)} item(s)"


def _summarize_dict(label: str, value: dict[str, Any]) -> str:
    keys = ", ".join(list(value.keys())[:4])
    return f"{label} keys=[{keys}] size={len(value)}"


def _summarize_scalar(value: Any) -> str:
    if value is None:
        return "None"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        stripped = value.strip()
        if len(stripped) <= 40:
            return repr(stripped)
        return repr(f"{stripped[:37]}...")
    if isinstance(value, BaseModel):
        return value.__class__.__name__
    if isinstance(value, list):
        return f"list(len={len(value)})"
    if isinstance(value, dict):
        return f"dict(keys={len(value)})"
    return value.__class__.__name__


def _summarize_list_output(tool_name: str, value: list[Any]) -> str:
    if not value:
        return f"{tool_name} returned 0 item(s)"

    names: list[str] = []
    for item in value[:3]:
        if isinstance(item, PlannerPlaceSuggestion):
            names.append(item.name)
        elif isinstance(item, PlannerRouteSegment) and item.summary:
            names.append(item.summary)
        elif isinstance(item, dict):
            name = item.get("name") or item.get("summary")
            if isinstance(name, str) and name.strip():
                names.append(name.strip())
    if names:
        suffix = "..." if len(value) > 3 else ""
        return f"{tool_name} returned {len(value)} item(s): {', '.join(names)}{suffix}"
    return f"{tool_name} returned {len(value)} item(s)"


def _summarize_dict_output(tool_name: str, value: dict[str, Any]) -> str:
    if {"assistantText", "title", "markdown"}.issubset(value.keys()):
        places = value.get("places") or []
        routes = value.get("routes") or []
        return (
            f"{tool_name} returned planner output "
            f"(places={len(places)}, routes={len(routes)}, markdownKeys={len(value)})"
        )
    keys = ", ".join(list(value.keys())[:4])
    return f"{tool_name} returned dict with keys [{keys}]"


def _summarize_date_range(start: Any, end: Any) -> str:
    start_text = start.isoformat() if hasattr(start, "isoformat") else "unknown"
    end_text = end.isoformat() if hasattr(end, "isoformat") else start_text
    return f"{start_text}..{end_text}"
