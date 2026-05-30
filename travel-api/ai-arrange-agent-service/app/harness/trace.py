from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.harness.sanitizer import sanitize_trace_message, sanitize_trace_metadata
from app.models import PlannerStreamEvent, PlannerStreamEventType, UserFacingEvent


class TraceEvent(BaseModel):
    model_config = ConfigDict(extra="allow")

    traceId: str
    conversationId: str | None = None
    userId: str | None = None
    eventType: str
    name: str
    tool: str | None = None
    phase: str | None = None
    status: str
    errorCode: str | None = None
    latencyMs: int | None = None
    message: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    snapshotVersion: int | None = None
    requestHash: str | None = None
    createdAt: datetime


class AgentTrace(BaseModel):
    model_config = ConfigDict(extra="allow")

    traceId: str
    conversationId: str
    userId: str
    phase: str | None = None
    snapshotVersion: int | None = None
    requestHash: str | None = None
    startedAt: datetime
    finishedAt: datetime | None = None
    events: list[TraceEvent] = Field(default_factory=list)


@dataclass
class TraceRecorder:
    trace_id: str
    conversation_id: str
    user_id: str
    enabled: bool = True
    phase: str | None = None
    snapshot_version: int | None = None
    request_hash: str | None = None
    target_day_index: int | None = None
    stream_event_sink: Callable[[PlannerStreamEvent], None] | None = None
    trace: AgentTrace = field(init=False)
    user_facing_events: list[UserFacingEvent] = field(default_factory=list)

    def __post_init__(self) -> None:
        started_at = datetime.now(timezone.utc)
        self.trace = AgentTrace(
            traceId=self.trace_id,
            conversationId=self.conversation_id,
            userId=self.user_id,
            phase=self.phase,
            snapshotVersion=self.snapshot_version,
            requestHash=self.request_hash,
            startedAt=started_at,
        )

    def emit(
        self,
        *,
        event_type: str,
        name: str,
        status: str,
        message: str | None = None,
        metadata: dict[str, Any] | None = None,
        latency_ms: int | None = None,
        phase: str | None = None,
        tool: str | None = None,
        error_code: str | None = None,
    ) -> TraceEvent:
        safe_metadata = sanitize_trace_metadata(metadata or {})
        safe_message = sanitize_trace_message(message)
        resolved_error_code = error_code or _metadata_error_code(safe_metadata)
        event = TraceEvent(
            traceId=self.trace_id,
            conversationId=self.conversation_id,
            userId=self.user_id,
            eventType=event_type,
            name=name,
            tool=tool or name,
            phase=phase or self.phase,
            status=status,
            errorCode=resolved_error_code,
            latencyMs=latency_ms,
            message=safe_message,
            metadata=safe_metadata,
            snapshotVersion=self.snapshot_version,
            requestHash=self.request_hash,
            createdAt=datetime.now(timezone.utc),
        )
        self.trace.events.append(event)
        if self.enabled:
            print(json.dumps(event.model_dump(mode="json"), ensure_ascii=True), flush=True)
        return event

    def append_user_event(self, event: UserFacingEvent) -> UserFacingEvent:
        safe_event = event.model_copy(update={"metadata": sanitize_trace_metadata(event.metadata)})
        self.user_facing_events.append(safe_event)
        stream_event = self._stream_event_from_user_event(safe_event)
        if stream_event is not None and self.stream_event_sink is not None:
            self.stream_event_sink(stream_event)
        return safe_event

    def _stream_event_from_user_event(self, event: UserFacingEvent) -> PlannerStreamEvent | None:
        event_type = _stream_type_from_user_event(event)
        if event_type is None:
            return None

        return PlannerStreamEvent(
            traceId=self.trace_id,
            conversationId=self.conversation_id,
            userId=self.user_id,
            type=event_type,
            status=event.status,
            message=sanitize_trace_message(event.message),
            phase=_stream_phase_from_event_type(event_type),
            tool=event.tool,
            snapshotVersion=self.snapshot_version,
            targetDayIndex=self.target_day_index,
            data=event.metadata,
        )

    def start(self, message: str | None = None) -> None:
        self.emit(
            event_type="AGENT_RUN_STARTED",
            name="agent",
            status="RUNNING",
            message=message or "Agent 开始执行。",
        )

    def finish(self, status: str, message: str | None = None) -> None:
        self.trace.finishedAt = datetime.now(timezone.utc)
        self.emit(
            event_type="AGENT_RUN_FINISHED",
            name="agent",
            status=status,
            message=message or "Agent 执行结束。",
        )


def _metadata_error_code(metadata: dict[str, Any]) -> str | None:
    value = metadata.get("errorCode")
    return value if isinstance(value, str) and value else None


def _stream_type_from_user_event(event: UserFacingEvent) -> PlannerStreamEventType | None:
    status = event.status.upper()
    if event.type == "AGENT_STATUS":
        return PlannerStreamEventType.RUN_STARTED if status == "RUNNING" else None
    if event.type == "MODEL_STATUS":
        return (
            PlannerStreamEventType.MODEL_STARTED
            if status == "RUNNING"
            else PlannerStreamEventType.MODEL_FINISHED
        )
    if event.type == "TOOL_STATUS":
        if event.tool == "fallback_plan_builder" and status != "RUNNING":
            return PlannerStreamEventType.FALLBACK_USED
        return (
            PlannerStreamEventType.TOOL_STARTED
            if status == "RUNNING"
            else PlannerStreamEventType.TOOL_FINISHED
        )
    return None


def _stream_phase_from_event_type(event_type: PlannerStreamEventType) -> str:
    if event_type in {PlannerStreamEventType.MODEL_STARTED, PlannerStreamEventType.MODEL_FINISHED}:
        return "model"
    if event_type in {
        PlannerStreamEventType.TOOL_STARTED,
        PlannerStreamEventType.TOOL_FINISHED,
        PlannerStreamEventType.FALLBACK_USED,
    }:
        return "tool"
    return "turn"
