from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from inspect import isclass
from typing import Any, Awaitable, Callable

from pydantic import BaseModel, ConfigDict, field_serializer

from app.harness.hooks import after_model_call, after_tool_call, before_model_call, before_tool_call
from app.harness.policy import RuntimePolicy
from app.harness.sanitizer import summarize_tool_input, summarize_tool_output
from app.harness.tool_result import ToolResult, ToolStatus, ToolWarning
from app.harness.trace import TraceRecorder
from app.models import UserFacingEvent


def _is_pydantic_model_class(value: Any) -> bool:
    return isclass(value) and issubclass(value, BaseModel)


def _schema_to_jsonable(value: Any) -> Any:
    if _is_pydantic_model_class(value):
        return value.model_json_schema()
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json", exclude_none=True)
    if isinstance(value, dict):
        return {str(key): _schema_to_jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_schema_to_jsonable(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


class ToolSpec(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid", arbitrary_types_allowed=True)

    name: str
    description: str
    input_schema: Any
    output_schema: Any
    timeout_seconds: float
    retry_count: int
    requires_secret: bool
    side_effect: bool
    user_running_message: str
    user_success_message: str
    user_failure_message: str

    @field_serializer("input_schema", "output_schema")
    def _serialize_schema(self, value: Any) -> Any:
        return _schema_to_jsonable(value)


@dataclass(frozen=True)
class RegisteredTool:
    spec: ToolSpec
    handler: Callable[..., Awaitable[ToolResult]]


@dataclass
class ToolExecutionContext:
    trace_id: str
    conversation_id: str
    user_id: str
    policy: RuntimePolicy
    recorder: TraceRecorder
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    tool_call_count: int = 0
    model_call_count: int = 0
    user_message: str = ""

    def elapsed_seconds(self) -> float:
        return (datetime.now(timezone.utc) - self.started_at).total_seconds()

    def runtime_exceeded(self) -> bool:
        return self.elapsed_seconds() > self.policy.max_execution_time_seconds


class ToolRegistry:
    def __init__(self, policy: RuntimePolicy) -> None:
        self._policy = policy
        self._tools: dict[str, RegisteredTool] = {}

    def register(self, spec: ToolSpec, handler: Callable[..., Awaitable[ToolResult]]) -> None:
        if spec.name in self._tools:
            raise ValueError(f"Tool already registered: {spec.name}")
        self._tools[spec.name] = RegisteredTool(spec=spec, handler=handler)

    def get(self, name: str) -> RegisteredTool:
        try:
            return self._tools[name]
        except KeyError as exc:
            raise KeyError(f"Tool not registered: {name}") from exc

    def list_tools(self) -> list[ToolSpec]:
        return [registered.spec for registered in self._tools.values()]

    async def execute(
        self,
        name: str,
        context: ToolExecutionContext,
        *,
        allow_after_runtime_limit: bool = False,
        **kwargs: Any,
    ) -> ToolResult:
        registration = self.get(name)
        spec = registration.spec
        input_summary = summarize_tool_input(name, kwargs)

        if context.runtime_exceeded() and not allow_after_runtime_limit:
            return self._limit_result(
                context=context,
                tool_name=name,
                message="本轮规划已达到运行时间上限，已停止继续调用工具。",
                error_code="RUNTIME_LIMIT_REACHED",
                input_summary=input_summary,
            )

        if name == "model_chat_completion":
            if context.model_call_count >= self._policy.max_model_calls_per_turn:
                return self._limit_result(
                    context=context,
                    tool_name=name,
                    message="本轮模型调用已达到上限，已切换为可用结果或兜底规划。",
                    error_code="MODEL_CALL_LIMIT_REACHED",
                    input_summary=input_summary,
                )
            context.model_call_count += 1
            before_model_call(
                context.recorder,
                spec.name,
                spec.user_running_message,
                input_summary=input_summary,
                phase="model",
            )
        else:
            if context.tool_call_count >= self._policy.max_tool_calls_per_turn:
                return self._limit_result(
                    context=context,
                    tool_name=name,
                    message="本轮工具调用已达到上限，已停止继续调用工具。",
                    error_code="TOOL_CALL_LIMIT_REACHED",
                    input_summary=input_summary,
                )
            context.tool_call_count += 1
            before_tool_call(
                context.recorder,
                spec.name,
                spec.user_running_message,
                input_summary=input_summary,
                phase="tool",
            )

        timeout_seconds = spec.timeout_seconds or self._policy.default_tool_timeout_seconds
        last_result: ToolResult | None = None
        retry_count = max(spec.retry_count, 0)

        for attempt in range(retry_count + 1):
            started = time.perf_counter()
            try:
                call = registration.handler(context=context, **kwargs)
                result = await asyncio.wait_for(call, timeout=timeout_seconds)
                if not isinstance(result, ToolResult):
                    result = ToolResult(
                        tool=name,
                        status=ToolStatus.SUCCESS,
                        data=result,
                        userMessage=spec.user_success_message,
                    )
                result.latencyMs = int((time.perf_counter() - started) * 1000)
                result.retryCount = attempt
                self._attach_summaries(result, input_summary)
                last_result = result
                break
            except asyncio.TimeoutError:
                last_result = ToolResult(
                    tool=name,
                    status=ToolStatus.FAILED,
                    errorCode="TOOL_TIMEOUT",
                    errorMessage=f"工具调用超时（{timeout_seconds} 秒）。",
                    latencyMs=int((time.perf_counter() - started) * 1000),
                    retryCount=attempt,
                    userMessage=spec.user_failure_message,
                    warnings=[
                        ToolWarning(
                            code="TOOL_TIMEOUT",
                            message=f"{name} 调用超时。",
                            source=name,
                        )
                    ],
                )
            except Exception as exc:  # pragma: no cover - defensive path
                last_result = ToolResult(
                    tool=name,
                    status=ToolStatus.FAILED,
                    errorCode="TOOL_EXCEPTION",
                    errorMessage=str(exc),
                    latencyMs=int((time.perf_counter() - started) * 1000),
                    retryCount=attempt,
                    userMessage=spec.user_failure_message,
                    warnings=[
                        ToolWarning(
                            code="TOOL_EXCEPTION",
                            message="工具执行异常，已继续使用可用信息。",
                            source=name,
                        )
                    ],
                )

            if last_result is not None:
                self._attach_summaries(last_result, input_summary)

            if attempt < retry_count:
                retry_phase = "model" if name == "model_chat_completion" else "tool"
                context.recorder.emit(
                    event_type="TOOL_CALL_RETRY",
                    name=name,
                    status="RETRYING",
                    message=f"正在重试工具调用 {attempt + 1}/{retry_count}。",
                    metadata={
                        "attempt": attempt + 1,
                        "maxAttempts": retry_count + 1,
                        "inputSummary": input_summary,
                    },
                    phase=retry_phase,
                )
                continue
            break

        assert last_result is not None
        if name == "model_chat_completion":
            after_model_call(
                context.recorder,
                spec.name,
                last_result,
                spec.user_success_message,
                spec.user_failure_message,
                phase="model",
            )
        else:
            after_tool_call(
                context.recorder,
                spec.name,
                last_result,
                spec.user_success_message,
                spec.user_failure_message,
                phase="tool",
            )
        return last_result

    def _limit_result(
        self,
        *,
        context: ToolExecutionContext,
        tool_name: str,
        message: str,
        error_code: str,
        input_summary: str | None = None,
    ) -> ToolResult:
        output_summary = message
        context.recorder.emit(
            event_type="RUNTIME_LIMIT_REACHED",
            name=tool_name,
            status="FAILED",
            message=message,
            metadata={
                "errorCode": error_code,
                "inputSummary": input_summary,
                "outputSummary": output_summary,
            },
            phase="control",
            error_code=error_code,
        )
        context.recorder.append_user_event(
            UserFacingEvent(
                type="TOOL_STATUS",
                message=message,
                status="FAILED",
                tool=tool_name,
                metadata={
                    "errorCode": error_code,
                    "inputSummary": input_summary,
                    "outputSummary": output_summary,
                },
            )
        )
        return ToolResult(
            tool=tool_name,
            status=ToolStatus.FAILED,
            errorCode=error_code,
            errorMessage=message,
            userMessage=message,
            inputSummary=input_summary,
            outputSummary=output_summary,
            warnings=[
                ToolWarning(
                    code=error_code,
                    message=message,
                    source="runtime",
                )
            ],
        )

    def _attach_summaries(self, result: ToolResult, input_summary: str) -> None:
        result.inputSummary = result.inputSummary or input_summary
        result.outputSummary = result.outputSummary or summarize_tool_output(result)
