from __future__ import annotations

import asyncio
from datetime import date, datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from app.harness.policy import RuntimePolicy
from app.harness.sanitizer import sanitize_trace_metadata
from app.harness.tool_registry import ToolExecutionContext, ToolRegistry, ToolSpec
from app.harness.trace import TraceRecorder
from app.harness.tool_result import ToolResult, ToolStatus
from app.models import AgentRunRequest, PlannerPlaceSuggestion, TripCoreSlots
from app.services.fallback_plan_builder import FallbackPlanBuilder
from app.validation.planner_output import validate_planner_output_payload


def request(**kwargs) -> AgentRunRequest:
    return AgentRunRequest(
        conversationId='00000000-0000-0000-0000-000000000001',
        userId='00000000-0000-0000-0000-000000000002',
        coreSlots=TripCoreSlots(city='Shanghai', travelStartDate=date(2026, 6, 1), peopleCount=2),
        **kwargs,
    )


def context(policy: RuntimePolicy) -> ToolExecutionContext:
    recorder = TraceRecorder('trace', 'conversation', 'user', enabled=False)
    return ToolExecutionContext('trace', 'conversation', 'user', policy, recorder)


def spec(retry_count: int = 0, timeout_seconds: float = 0.05) -> ToolSpec:
    return ToolSpec(
        name='edge_tool', description='edge', input_schema='dict', output_schema='dict',
        timeout_seconds=timeout_seconds, retry_count=retry_count, requires_secret=False,
        side_effect=False, user_running_message='running', user_success_message='success', user_failure_message='failure',
    )


def test_fallback_builds_deterministic_placeholder_when_no_places_exist() -> None:
    assistant, title, summary, markdown, places = FallbackPlanBuilder().build(request(), [])

    assert places
    assert all(place.source.value == 'AI' for place in places)
    assert title == 'Shanghai第 1 天行前规划'
    assert '共 1 天' in summary
    assert markdown.startswith(f'# {title}')
    assert assistant


def test_planner_output_rejects_blank_required_text_and_cleans_invalid_uuid() -> None:
    with pytest.raises(ValidationError):
        validate_planner_output_payload({'assistantText': ' ', 'title': 'x', 'markdown': 'm'})

    output = validate_planner_output_payload({
        'assistantText': 'ok', 'title': 'title', 'markdown': '# plan',
        'places': [{'name': 'Bund', 'placeId': 'not-a-uuid', 'type': 'attraction'}],
    })
    assert output.places[0].placeId is None
    assert output.places[0].type.value == 'SCENIC'


def test_sanitizer_redacts_sensitive_metadata() -> None:
    sanitized = sanitize_trace_metadata({'apiKey': 'secret-value', 'nested': {'token': 'abc'}, 'safe': 'ok'})

    assert sanitized['apiKey'] == '***'
    assert sanitized['nested']['token'] == '***'
    assert sanitized['safe'] == 'ok'


@pytest.mark.asyncio
async def test_tool_registry_retries_then_returns_success() -> None:
    attempts = 0

    async def handler(**_) -> ToolResult:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise RuntimeError('temporary')
        return ToolResult(tool='edge_tool', status=ToolStatus.SUCCESS, data={'value': 2})

    registry = ToolRegistry(RuntimePolicy(trace_enabled=False))
    registry.register(spec(retry_count=1), handler)
    result = await registry.execute('edge_tool', context(RuntimePolicy(trace_enabled=False)))

    assert result.status is ToolStatus.SUCCESS
    assert result.retryCount == 1
    assert result.data == {'value': 2}
    assert attempts == 2


@pytest.mark.asyncio
async def test_tool_registry_reports_timeout_and_call_limit() -> None:
    async def slow_handler(**_) -> ToolResult:
        await asyncio.sleep(0.2)
        return ToolResult(tool='edge_tool', status=ToolStatus.SUCCESS)

    policy = RuntimePolicy(trace_enabled=False, max_tool_calls_per_turn=1)
    registry = ToolRegistry(policy)
    registry.register(spec(timeout_seconds=0.01), slow_handler)
    execution_context = context(policy)
    timed_out = await registry.execute('edge_tool', execution_context)
    limited = await registry.execute('edge_tool', execution_context)

    assert timed_out.status is ToolStatus.FAILED
    assert timed_out.errorCode == 'TOOL_TIMEOUT'
    assert limited.errorCode == 'TOOL_CALL_LIMIT_REACHED'


@pytest.mark.asyncio
async def test_tool_registry_converts_handler_exception_to_failed_result() -> None:
    async def failing_handler(**_) -> ToolResult:
        raise ValueError('bad input')

    policy = RuntimePolicy(trace_enabled=False)
    registry = ToolRegistry(policy)
    registry.register(spec(), failing_handler)
    result = await registry.execute('edge_tool', context(policy))

    assert result.status is ToolStatus.FAILED
    assert result.errorCode == 'TOOL_EXCEPTION'
    assert 'bad input' in (result.errorMessage or '')
