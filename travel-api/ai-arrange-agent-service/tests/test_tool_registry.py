from __future__ import annotations

import pytest

from app.harness.policy import RuntimePolicy
from app.harness.tool_registry import ToolExecutionContext, ToolRegistry, ToolSpec
from app.harness.tool_result import ToolResult, ToolStatus
from app.harness.trace import TraceRecorder


async def sample_handler(**_) -> ToolResult:
    return ToolResult(tool="sample_tool", status=ToolStatus.SUCCESS, data={"ok": True})


def sample_spec() -> ToolSpec:
    return ToolSpec(
        name="sample_tool",
        description="Sample test tool",
        input_schema="none",
        output_schema="dict",
        timeout_seconds=2,
        retry_count=0,
        requires_secret=False,
        side_effect=False,
        user_running_message="running",
        user_success_message="success",
        user_failure_message="failure",
    )


def test_tool_registry_registers_and_lists_tools() -> None:
    registry = ToolRegistry(RuntimePolicy(trace_enabled=False))
    registry.register(sample_spec(), sample_handler)

    assert registry.get("sample_tool").spec.name == "sample_tool"
    assert [tool.name for tool in registry.list_tools()] == ["sample_tool"]


def test_tool_registry_rejects_duplicate_tools() -> None:
    registry = ToolRegistry(RuntimePolicy(trace_enabled=False))
    registry.register(sample_spec(), sample_handler)

    with pytest.raises(ValueError):
        registry.register(sample_spec(), sample_handler)


@pytest.mark.asyncio
async def test_tool_registry_executes_with_trace_events() -> None:
    policy = RuntimePolicy(trace_enabled=False)
    registry = ToolRegistry(policy)
    registry.register(sample_spec(), sample_handler)
    recorder = TraceRecorder("trace-1", "conversation-1", "user-1", enabled=False)
    context = ToolExecutionContext(
        trace_id="trace-1",
        conversation_id="conversation-1",
        user_id="user-1",
        policy=policy,
        recorder=recorder,
    )

    result = await registry.execute("sample_tool", context)

    assert result.status == ToolStatus.SUCCESS
    assert context.tool_call_count == 1
    assert [event.eventType for event in recorder.trace.events] == [
        "TOOL_CALL_STARTED",
        "TOOL_CALL_FINISHED",
    ]
    assert recorder.user_facing_events[0].message == "running"
