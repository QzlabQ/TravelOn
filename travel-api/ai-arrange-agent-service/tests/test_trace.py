from __future__ import annotations

import json

from app.harness.trace import TraceRecorder
from app.models import UserFacingEvent


def test_trace_recorder_records_events_and_user_events() -> None:
    recorder = TraceRecorder(
        "trace-1",
        "conversation-1",
        "user-1",
        enabled=False,
        phase="INITIAL_PLAN",
        snapshot_version=2,
        request_hash="request-hash-1",
    )

    recorder.emit(
        event_type="TOOL_CALL_STARTED",
        name="sample_tool",
        status="RUNNING",
        message="running",
        metadata={"apiKey": "secret-value", "nested": {"token": "secret-token"}},
    )
    recorder.append_user_event(
        UserFacingEvent(
            message="正在执行工具...",
            status="RUNNING",
            tool="sample_tool",
        )
    )

    assert recorder.trace.traceId == "trace-1"
    assert recorder.trace.phase == "INITIAL_PLAN"
    assert recorder.trace.snapshotVersion == 2
    assert recorder.trace.requestHash == "request-hash-1"
    assert recorder.trace.events[0].traceId == "trace-1"
    assert recorder.trace.events[0].eventType == "TOOL_CALL_STARTED"
    assert recorder.trace.events[0].phase == "INITIAL_PLAN"
    assert recorder.trace.events[0].snapshotVersion == 2
    assert recorder.trace.events[0].requestHash == "request-hash-1"
    assert recorder.trace.events[0].metadata["apiKey"] == "***"
    assert recorder.trace.events[0].metadata["nested"]["token"] == "***"
    assert recorder.user_facing_events[0].message == "正在执行工具..."


def test_trace_recorder_prints_ascii_safe_json(capsys) -> None:
    recorder = TraceRecorder(
        "trace-2",
        "conversation-2",
        "user-2",
        enabled=True,
        phase="INITIAL_PLAN",
    )

    recorder.emit(
        event_type="TOOL_CALL_STARTED",
        name="sample_tool",
        status="RUNNING",
        message="正在查询地图点位...",
        metadata={"place": "外滩"},
    )

    output = capsys.readouterr().out
    assert "\\u6b63\\u5728\\u67e5\\u8be2\\u5730\\u56fe\\u70b9\\u4f4d" in output
    assert "正在查询地图点位" not in output
    assert json.loads(output)["message"] == "正在查询地图点位..."
