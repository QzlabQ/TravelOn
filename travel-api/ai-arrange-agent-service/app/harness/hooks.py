from __future__ import annotations

from app.harness.tool_result import ToolResult, ToolStatus
from app.harness.trace import TraceRecorder
from app.models import UserFacingEvent


def before_agent_run(recorder: TraceRecorder, message: str, phase: str | None = None) -> UserFacingEvent:
    recorder.emit(
        event_type="AGENT_RUN_STARTED",
        name="agent",
        status="RUNNING",
        message=message,
        phase=phase or "turn",
    )
    return recorder.append_user_event(
        UserFacingEvent(
            type="AGENT_STATUS",
            message=message,
            status="RUNNING",
            tool="agent",
        )
    )


def after_agent_run(recorder: TraceRecorder, status: str, message: str, phase: str | None = None) -> UserFacingEvent:
    recorder.emit(
        event_type="AGENT_RUN_FINISHED",
        name="agent",
        status=status,
        message=message,
        phase=phase or "turn",
    )
    return recorder.append_user_event(
        UserFacingEvent(
            type="AGENT_STATUS",
            message=message,
            status=status,
            tool="agent",
        )
    )


def before_tool_call(
    recorder: TraceRecorder,
    tool_name: str,
    running_message: str,
    input_summary: str | None = None,
    phase: str | None = None,
) -> UserFacingEvent:
    metadata = {"inputSummary": input_summary} if input_summary else {}
    recorder.emit(
        event_type="TOOL_CALL_STARTED",
        name=tool_name,
        status="RUNNING",
        message=running_message,
        metadata=metadata,
        phase=phase or "tool",
    )
    return recorder.append_user_event(
        UserFacingEvent(
            type="TOOL_STATUS",
            message=running_message,
            status="RUNNING",
            tool=tool_name,
            metadata=metadata,
        )
    )


def after_tool_call(
    recorder: TraceRecorder,
    tool_name: str,
    result: ToolResult,
    success_message: str,
    failure_message: str,
    phase: str | None = None,
) -> UserFacingEvent:
    status_text = result.status.value
    if result.userMessage:
        message = result.userMessage
    elif result.status in {ToolStatus.SUCCESS, ToolStatus.PARTIAL_SUCCESS, ToolStatus.SKIPPED}:
        message = success_message
    else:
        message = failure_message

    recorder.emit(
        event_type="TOOL_CALL_FINISHED",
        name=tool_name,
        status=status_text,
        message=message,
        latency_ms=result.latencyMs,
        phase=phase or "tool",
        metadata={
            "retryCount": result.retryCount,
            "errorCode": result.errorCode,
            "inputSummary": result.inputSummary,
            "outputSummary": result.outputSummary,
        },
    )
    return recorder.append_user_event(
        UserFacingEvent(
            type="TOOL_STATUS",
            message=message,
            status=status_text,
            tool=tool_name,
            metadata={
                "retryCount": result.retryCount,
                "errorCode": result.errorCode,
                "inputSummary": result.inputSummary,
                "outputSummary": result.outputSummary,
            },
        )
    )


def before_model_call(
    recorder: TraceRecorder,
    model_name: str,
    running_message: str,
    input_summary: str | None = None,
    phase: str | None = None,
) -> UserFacingEvent:
    metadata = {"inputSummary": input_summary} if input_summary else {}
    recorder.emit(
        event_type="MODEL_CALL_STARTED",
        name=model_name,
        status="RUNNING",
        message=running_message,
        metadata=metadata,
        phase=phase or "model",
    )
    return recorder.append_user_event(
        UserFacingEvent(
            type="MODEL_STATUS",
            message=running_message,
            status="RUNNING",
            tool=model_name,
            metadata=metadata,
        )
    )


def after_model_call(
    recorder: TraceRecorder,
    model_name: str,
    result: ToolResult,
    success_message: str,
    failure_message: str,
    phase: str | None = None,
) -> UserFacingEvent:
    status_text = result.status.value
    if result.userMessage:
        message = result.userMessage
    elif result.status in {ToolStatus.SUCCESS, ToolStatus.PARTIAL_SUCCESS, ToolStatus.SKIPPED}:
        message = success_message
    else:
        message = failure_message

    recorder.emit(
        event_type="MODEL_CALL_FINISHED",
        name=model_name,
        status=status_text,
        message=message,
        latency_ms=result.latencyMs,
        phase=phase or "model",
        metadata={
            "retryCount": result.retryCount,
            "errorCode": result.errorCode,
            "inputSummary": result.inputSummary,
            "outputSummary": result.outputSummary,
        },
    )
    return recorder.append_user_event(
        UserFacingEvent(
            type="MODEL_STATUS",
            message=message,
            status=status_text,
            tool=model_name,
            metadata={
                "retryCount": result.retryCount,
                "errorCode": result.errorCode,
                "inputSummary": result.inputSummary,
                "outputSummary": result.outputSummary,
            },
        )
    )
