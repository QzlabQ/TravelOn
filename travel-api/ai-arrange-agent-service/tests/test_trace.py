from __future__ import annotations

from app.harness.trace import TraceRecorder
from app.models import UserFacingEvent


def test_trace_recorder_records_events_and_user_events() -> None:
    recorder = TraceRecorder("trace-1", "conversation-1", "user-1", enabled=False)

    recorder.emit(
        event_type="TOOL_CALL_STARTED",
        name="sample_tool",
        status="RUNNING",
        message="running",
    )
    recorder.append_user_event(
        UserFacingEvent(
            message="正在执行工具...",
            status="RUNNING",
            tool="sample_tool",
        )
    )

    assert recorder.trace.traceId == "trace-1"
    assert recorder.trace.events[0].traceId == "trace-1"
    assert recorder.trace.events[0].eventType == "TOOL_CALL_STARTED"
    assert recorder.user_facing_events[0].message == "正在执行工具..."
