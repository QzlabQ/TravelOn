from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from app.models import PlannerPlaceSuggestion, PlannerRouteSegment


class PlannerModelOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assistantText: str
    title: str
    summary: str | None = None
    markdown: str
    nextQuestion: str | None = None
    places: list[PlannerPlaceSuggestion] = Field(default_factory=list)
    routes: list[PlannerRouteSegment] = Field(default_factory=list)

    @field_validator("assistantText", "title", "markdown", mode="before")
    @classmethod
    def _require_non_empty_text(cls, value: Any) -> str:
        if not isinstance(value, str):
            raise ValueError("must be a string")
        text = value.strip()
        if not text:
            raise ValueError("must not be blank")
        return text

    @field_validator("summary", "nextQuestion", mode="before")
    @classmethod
    def _normalize_optional_text(cls, value: Any) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            value = str(value)
        text = value.strip()
        return text or None

    @field_validator("places", "routes", mode="before")
    @classmethod
    def _normalize_optional_list(cls, value: Any) -> Any:
        if value is None:
            return []
        return value


def validate_planner_output_payload(payload: Any) -> PlannerModelOutput:
    return PlannerModelOutput.model_validate(normalize_planner_output_payload(payload))


def normalize_planner_output_payload(payload: Any) -> Any:
    if not isinstance(payload, dict):
        return payload

    normalized = dict(payload)
    normalized["places"] = _normalize_uuid_fields(normalized.get("places"), {"placeId", "internalOfferId"})
    normalized["routes"] = _normalize_uuid_fields(normalized.get("routes"), {"fromPlaceId", "toPlaceId"})
    return normalized


def _normalize_uuid_fields(value: Any, fields: set[str]) -> Any:
    if not isinstance(value, list):
        return value

    normalized_items: list[Any] = []
    for item in value:
        if not isinstance(item, dict):
            normalized_items.append(item)
            continue

        normalized_item = dict(item)
        for field in fields:
            if field in normalized_item and not _is_valid_uuid_or_blank(normalized_item[field]):
                normalized_item[field] = None
        normalized_items.append(normalized_item)
    return normalized_items


def _is_valid_uuid_or_blank(value: Any) -> bool:
    if value is None or value == "":
        return True
    if isinstance(value, UUID):
        return True
    if not isinstance(value, str):
        return False
    try:
        UUID(value)
    except ValueError:
        return False
    return True


def format_validation_error(error: Exception) -> str:
    if isinstance(error, ValidationError):
        parts: list[str] = []
        for item in error.errors()[:5]:
            location = ".".join(str(part) for part in item.get("loc", [])) or "<root>"
            message = item.get("msg", "invalid value")
            parts.append(f"{location}: {message}")
        return "; ".join(parts)
    return str(error)


def summarize_planner_output(output: PlannerModelOutput | dict[str, Any]) -> str:
    if isinstance(output, PlannerModelOutput):
        data = output.model_dump(mode="json", exclude_none=True)
    else:
        data = output

    markdown = str(data.get("markdown") or "")
    places = data.get("places") or []
    routes = data.get("routes") or []
    title = str(data.get("title") or "untitled").strip()
    return f"title={title}; markdownLen={len(markdown)}; places={len(places)}; routes={len(routes)}"
