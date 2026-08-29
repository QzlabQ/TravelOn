from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from pydantic import BaseModel, Field

from app.harness.policy import RuntimePolicy
from app.harness.tool_registry import ToolExecutionContext, ToolRegistry, ToolSpec
from app.harness.tool_result import ToolResult, ToolStatus
from app.harness.trace import TraceRecorder


async def sample_handler(**_) -> ToolResult:
    return ToolResult(tool="sample_tool", status=ToolStatus.SUCCESS, data={"ok": True})


class SampleInputSchema(BaseModel):
    city: str
    limit: int = Field(default=3)


class SampleOutputSchema(BaseModel):
    ok: bool
    message: str


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
    assert result.inputSummary == "sample_tool(no arguments)"
    assert result.outputSummary == "sample_tool returned dict with keys [ok]"
    assert context.tool_call_count == 1
    assert [event.eventType for event in recorder.trace.events] == [
        "TOOL_CALL_STARTED",
        "TOOL_CALL_FINISHED",
    ]
    assert recorder.user_facing_events[0].message == "running"


@pytest.mark.asyncio
async def test_tool_registry_allows_runtime_bypass_for_fallback() -> None:
    policy = RuntimePolicy(trace_enabled=False, max_execution_time_seconds=1)
    registry = ToolRegistry(policy)
    registry.register(sample_spec(), sample_handler)
    recorder = TraceRecorder("trace-2", "conversation-2", "user-2", enabled=False)
    context = ToolExecutionContext(
        trace_id="trace-2",
        conversation_id="conversation-2",
        user_id="user-2",
        policy=policy,
        recorder=recorder,
        started_at=datetime.now(timezone.utc) - timedelta(seconds=5),
    )

    result = await registry.execute("sample_tool", context, allow_after_runtime_limit=True)

    assert result.status == ToolStatus.SUCCESS
    assert context.tool_call_count == 1
    assert recorder.trace.events[0].eventType == "TOOL_CALL_STARTED"


def test_tool_spec_serializes_real_pydantic_schema() -> None:
    spec = ToolSpec(
        name="sample_schema_tool",
        description="Sample schema test tool",
        input_schema=SampleInputSchema,
        output_schema=SampleOutputSchema,
        timeout_seconds=2,
        retry_count=0,
        requires_secret=False,
        side_effect=False,
        user_running_message="running",
        user_success_message="success",
        user_failure_message="failure",
    )

    dumped = spec.model_dump(mode="json")

    assert dumped["input_schema"]["title"] == "SampleInputSchema"
    assert dumped["input_schema"]["properties"]["city"]["type"] == "string"
    assert dumped["output_schema"]["title"] == "SampleOutputSchema"
