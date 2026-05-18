from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

from pydantic import BaseModel, ConfigDict

from app.harness.hooks import after_model_call, after_tool_call, before_model_call, before_tool_call
from app.harness.policy import RuntimePolicy
from app.harness.tool_result import ToolResult, ToolStatus, ToolWarning
from app.harness.trace import TraceRecorder
from app.models import UserFacingEvent


class ToolSpec(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    name: str
    description: str
    input_schema: str
    output_schema: str
    timeout_seconds: float
    retry_count: int
    requires_secret: bool
    side_effect: bool
    user_running_message: str
    user_success_message: str
    user_failure_message: str


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

    async def execute(self, name: str, context: ToolExecutionContext, **kwargs: Any) -> ToolResult:
        registration = self.get(name)
        spec = registration.spec

        if context.runtime_exceeded():
            return self._limit_result(
                context=context,
                tool_name=name,
                message="Runtime limit reached before tool execution",
                error_code="RUNTIME_LIMIT_REACHED",
            )

        if name == "deepseek_chat_completion":
            if context.model_call_count >= self._policy.max_model_calls_per_turn:
                return self._limit_result(
                    context=context,
                    tool_name=name,
                    message="Model call limit reached for this turn",
                    error_code="MODEL_CALL_LIMIT_REACHED",
                )
            context.model_call_count += 1
            before_model_call(context.recorder, spec.name, spec.user_running_message)
        else:
            if context.tool_call_count >= self._policy.max_tool_calls_per_turn:
                return self._limit_result(
                    context=context,
                    tool_name=name,
                    message="Tool call limit reached for this turn",
                    error_code="TOOL_CALL_LIMIT_REACHED",
                )
            context.tool_call_count += 1
            before_tool_call(context.recorder, spec.name, spec.user_running_message)

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
                last_result = result
                break
            except asyncio.TimeoutError:
                last_result = ToolResult(
                    tool=name,
                    status=ToolStatus.FAILED,
                    errorCode="TOOL_TIMEOUT",
                    errorMessage=f"Tool timeout after {timeout_seconds} seconds",
                    latencyMs=int((time.perf_counter() - started) * 1000),
                    retryCount=attempt,
                    userMessage=spec.user_failure_message,
                    warnings=[
                        ToolWarning(
                            code="TOOL_TIMEOUT",
                            message=f"{name} timed out",
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
                            message=str(exc),
                            source=name,
                        )
                    ],
                )

            if attempt < retry_count:
                context.recorder.emit(
                    event_type="TOOL_CALL_RETRY",
                    name=name,
                    status="RETRYING",
                    message=f"Retrying tool call {attempt + 1}/{retry_count}",
                    metadata={"attempt": attempt + 1, "maxAttempts": retry_count + 1},
                )
                continue
            break

        assert last_result is not None
        if name == "deepseek_chat_completion":
            after_model_call(
                context.recorder,
                spec.name,
                last_result,
                spec.user_success_message,
                spec.user_failure_message,
            )
        else:
            after_tool_call(
                context.recorder,
                spec.name,
                last_result,
                spec.user_success_message,
                spec.user_failure_message,
            )
        return last_result

    def _limit_result(
        self,
        *,
        context: ToolExecutionContext,
        tool_name: str,
        message: str,
        error_code: str,
    ) -> ToolResult:
        context.recorder.emit(
            event_type="RUNTIME_LIMIT_REACHED",
            name=tool_name,
            status="FAILED",
            message=message,
            metadata={"errorCode": error_code},
        )
        context.recorder.append_user_event(
            UserFacingEvent(
                type="TOOL_STATUS",
                message=message,
                status="FAILED",
                tool=tool_name,
                metadata={"errorCode": error_code},
            )
        )
        return ToolResult(
            tool=tool_name,
            status=ToolStatus.FAILED,
            errorCode=error_code,
            errorMessage=message,
            userMessage=message,
            warnings=[
                ToolWarning(
                    code=error_code,
                    message=message,
                    source="runtime",
                )
            ],
        )
