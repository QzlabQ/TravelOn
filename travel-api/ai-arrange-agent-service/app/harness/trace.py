from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models import UserFacingEvent


class TraceEvent(BaseModel):
    model_config = ConfigDict(extra="allow")

    traceId: str
    conversationId: str | None = None
    userId: str | None = None
    eventType: str
    name: str
    status: str
    latencyMs: int | None = None
    message: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    createdAt: datetime


class AgentTrace(BaseModel):
    model_config = ConfigDict(extra="allow")

    traceId: str
    conversationId: str
    userId: str
    startedAt: datetime
    finishedAt: datetime | None = None
    events: list[TraceEvent] = Field(default_factory=list)


@dataclass
class TraceRecorder:
    trace_id: str
    conversation_id: str
    user_id: str
    enabled: bool = True
    trace: AgentTrace = field(init=False)
    user_facing_events: list[UserFacingEvent] = field(default_factory=list)

    def __post_init__(self) -> None:
        started_at = datetime.now(timezone.utc)
        self.trace = AgentTrace(
            traceId=self.trace_id,
            conversationId=self.conversation_id,
            userId=self.user_id,
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
    ) -> TraceEvent:
        event = TraceEvent(
            traceId=self.trace_id,
            conversationId=self.conversation_id,
            userId=self.user_id,
            eventType=event_type,
            name=name,
            status=status,
            latencyMs=latency_ms,
            message=message,
            metadata=metadata or {},
            createdAt=datetime.now(timezone.utc),
        )
        self.trace.events.append(event)
        if self.enabled:
            print(json.dumps(event.model_dump(mode="json"), ensure_ascii=False), flush=True)
        return event

    def append_user_event(self, event: UserFacingEvent) -> UserFacingEvent:
        self.user_facing_events.append(event)
        return event

    def start(self, message: str | None = None) -> None:
        self.emit(
            event_type="AGENT_RUN_STARTED",
            name="agent",
            status="RUNNING",
            message=message or "Agent run started",
        )

    def finish(self, status: str, message: str | None = None) -> None:
        self.trace.finishedAt = datetime.now(timezone.utc)
        self.emit(
            event_type="AGENT_RUN_FINISHED",
            name="agent",
            status=status,
            message=message or "Agent run finished",
        )
