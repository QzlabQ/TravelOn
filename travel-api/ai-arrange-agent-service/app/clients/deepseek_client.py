from __future__ import annotations

import asyncio
import json
import time
from datetime import timedelta
from typing import Any

import httpx
from pydantic import ValidationError

from app.config import AgentSettings
from app.harness.sanitizer import summarize_tool_input
from app.harness.tool_result import ToolResult, ToolStatus, ToolWarning
from app.models import AgentRunRequest, PlanningScope, model_dump_jsonable
from app.prompts.builder import build_system_prompt
from app.prompts.repair_prompt import REPAIR_PROMPT
from app.validation.planner_output import (
    PlannerModelOutput,
    format_validation_error,
    summarize_planner_output,
    validate_planner_output_payload,
)


class DeepSeekRateLimitError(RuntimeError):
    pass


class DeepSeekClient:
    def __init__(self, settings: AgentSettings) -> None:
        self._settings = settings

    async def generate_plan(
        self,
        request: AgentRunRequest,
        places: list[dict[str, Any]],
        weather: dict[str, Any] | None = None,
        transport_options: list[dict[str, Any]] | None = None,
        budget: dict[str, Any] | None = None,
        react_observations: list[dict[str, Any]] | None = None,
        planner_constraints: dict[str, Any] | None = None,
        **_: Any,
    ) -> ToolResult:
        started = time.perf_counter()
        transport_options = transport_options or []
        react_observations = react_observations or []
        planner_constraints = planner_constraints or {}
        input_summary = summarize_tool_input(
            "deepseek_chat_completion",
            {
                "request": request,
                "places": places,
                "weather": weather,
                "transport_options": transport_options,
                "budget": budget,
                "react_observations": react_observations,
                "planner_constraints": planner_constraints,
            },
        )

        if not self._settings.deepseek_api_key:
            return self._tool_result(
                started=started,
                status=ToolStatus.SKIPPED,
                data=None,
                detail="DEEPSEEK_API_KEY is not configured",
                user_message="模型未配置，已使用本地规划模板。",
                input_summary=input_summary,
                output_summary="model disabled; local fallback required",
                warnings=[
                    ToolWarning(
                        code="MODEL_DISABLED",
                        message="DeepSeek API Key 未配置，已使用本地兜底规划。",
                        source="deepseek",
                    )
                ],
            )

        url = self._chat_completions_url()
        payload = self._build_payload(
            request=request,
            places=places,
            weather=weather,
            transport_options=transport_options,
            budget=budget,
            react_observations=react_observations,
            planner_constraints=planner_constraints,
        )
        headers = {
            "Authorization": f"Bearer {self._settings.deepseek_api_key}",
            "Content-Type": "application/json",
        }

        last_error = "unknown error"
        warnings: list[ToolWarning] = []
        async with httpx.AsyncClient(timeout=self._settings.deepseek_timeout_seconds) as client:
            for attempt in range(self._settings.deepseek_retry_count + 1):
                try:
                    content = await self._request_content(client, url, headers, payload)
                    try:
                        parsed = self._parse_json_content(content)
                        validated_output = validate_planner_output_payload(parsed)
                    except (ValidationError, TypeError, ValueError) as validation_error:
                        return await self._repair_or_fallback(
                            started=started,
                            client=client,
                            url=url,
                            headers=headers,
                            request=request,
                            raw_content=content,
                            validation_error=validation_error,
                            places=places,
                            weather=weather,
                            transport_options=transport_options,
                            budget=budget,
                            react_observations=react_observations,
                            planner_constraints=planner_constraints,
                            input_summary=input_summary,
                        )

                    return self._tool_result(
                        started=started,
                        status=ToolStatus.SUCCESS,
                        data=validated_output.model_dump(mode="json", exclude_none=True),
                        detail=None,
                        retry_count=attempt,
                        user_message="已生成结构化旅行方案。",
                        input_summary=input_summary,
                        output_summary=summarize_planner_output(validated_output),
                        warnings=warnings,
                    )
                except DeepSeekRateLimitError as error:
                    last_error = str(error)
                    if attempt < self._settings.deepseek_retry_count:
                        await self._sleep_before_retry(attempt)
                        continue
                    warnings.append(
                        ToolWarning(
                            code="MODEL_RATE_LIMIT",
                            message="DeepSeek 返回限流响应，已使用本地兜底规划。",
                            source="deepseek",
                        )
                    )
                    return self._tool_result(
                        started=started,
                        status=ToolStatus.FAILED,
                        data=None,
                        detail=last_error,
                        error_code="MODEL_RATE_LIMIT",
                        error_message=last_error,
                        retry_count=attempt,
                        user_message="模型请求被限流，已切换为本地规划模板。",
                        input_summary=input_summary,
                        output_summary="rate limited; local fallback required",
                        warnings=warnings,
                    )
                except (httpx.TimeoutException, httpx.HTTPError, ValueError, KeyError) as error:
                    last_error = str(error)
                    if attempt < self._settings.deepseek_retry_count:
                        await self._sleep_before_retry(attempt)
                        continue

        warnings.append(
            ToolWarning(
                code="MODEL_FAILED",
                message="DeepSeek 生成失败，已使用本地兜底规划。",
                source="deepseek",
            )
        )
        return self._tool_result(
            started=started,
            status=ToolStatus.FAILED,
            data=None,
            detail=last_error,
            error_code="MODEL_FAILED",
            error_message=last_error,
            retry_count=self._settings.deepseek_retry_count,
            user_message="模型生成失败，已使用本地规划模板。",
            input_summary=input_summary,
            output_summary=f"generation failed: {last_error}",
            warnings=warnings,
        )

    def _chat_completions_url(self) -> str:
        base_url = self._settings.deepseek_base_url.rstrip("/")
        path = self._settings.deepseek_chat_completions_path
        if not path.startswith("/"):
            path = f"/{path}"
        return f"{base_url}{path}"

    def _build_payload(
        self,
        request: AgentRunRequest,
        places: list[dict[str, Any]],
        weather: dict[str, Any] | None,
        transport_options: list[dict[str, Any]],
        budget: dict[str, Any] | None,
        react_observations: list[dict[str, Any]],
        planner_constraints: dict[str, Any],
    ) -> dict[str, Any]:
        user_payload = self._build_user_payload(
            request=request,
            places=places,
            weather=weather,
            transport_options=transport_options,
            budget=budget,
            react_observations=react_observations,
            planner_constraints=planner_constraints,
        )
        return {
            "model": self._settings.deepseek_model,
            "temperature": self._settings.deepseek_temperature,
            "max_tokens": self._settings.deepseek_max_tokens,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": build_system_prompt()},
                {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
            ],
        }

    def _build_repair_payload(
        self,
        *,
        request: AgentRunRequest,
        places: list[dict[str, Any]],
        weather: dict[str, Any] | None,
        transport_options: list[dict[str, Any]],
        budget: dict[str, Any] | None,
        react_observations: list[dict[str, Any]],
        planner_constraints: dict[str, Any],
        raw_content: str,
        validation_error: str,
    ) -> dict[str, Any]:
        repair_payload = self._build_user_payload(
            request=request,
            places=places,
            weather=weather,
            transport_options=transport_options,
            budget=budget,
            react_observations=react_observations,
            planner_constraints=planner_constraints,
        )
        repair_payload.update(
            {
                "validationError": validation_error,
                "invalidModelOutput": raw_content[:8000],
                "expectedOutputSchema": PlannerModelOutput.model_json_schema(),
            }
        )
        return {
            "model": self._settings.deepseek_model,
            "temperature": 0,
            "max_tokens": self._settings.deepseek_max_tokens,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": build_system_prompt()},
                {"role": "system", "content": REPAIR_PROMPT},
                {"role": "user", "content": json.dumps(repair_payload, ensure_ascii=False)},
            ],
        }

    def _build_user_payload(
        self,
        *,
        request: AgentRunRequest,
        places: list[dict[str, Any]],
        weather: dict[str, Any] | None,
        transport_options: list[dict[str, Any]],
        budget: dict[str, Any] | None,
        react_observations: list[dict[str, Any]],
        planner_constraints: dict[str, Any],
    ) -> dict[str, Any]:
        day_scope = self._day_scope_payload(request)
        output_rules = {
            "language": "All user-facing fields must be Simplified Chinese: assistantText, title, summary, markdown, nextQuestion, place descriptions, route summaries, option labels, warning-like text.",
            "markdown": "Use a concise Chinese day-by-day itinerary with weather, budget, and transport notes when available.",
            "places": "Reuse candidatePlaces when possible.",
            "routes": "Return [] when route data is unavailable.",
            "userSelections": "Keep selected places and style choices unless impossible; do not use rejected places as main recommendations.",
            "snapshot": "When latestSnapshot is provided, treat it as the previous saved plan and describe only useful changes in Chinese.",
        }
        if day_scope["isDayScope"]:
            output_rules.update(
                {
                    "markdown": (
                        "Return ONLY the target day plan. Do not generate other days. "
                        "Use Chinese sections for morning, lunch, afternoon, dinner, evening, route notes, and alternatives when useful."
                    ),
                    "dayScope": (
                        "The markdown, places, and routes must correspond to targetDayIndex only. "
                        "Previously confirmed day plans are constraints for avoiding duplicate primary stops."
                    ),
                }
            )

        return {
            "request": model_dump_jsonable(request),
            "dayScope": day_scope,
            "candidatePlaces": places,
            "weather": weather,
            "transportOptions": transport_options,
            "budget": budget,
            "reactObservations": react_observations,
            "plannerConstraints": planner_constraints,
            "outputRules": output_rules,
            "repairRules": REPAIR_PROMPT,
        }

    def _day_scope_payload(self, request: AgentRunRequest) -> dict[str, Any]:
        is_day_scope = request.planningScope in {PlanningScope.DAY_PLAN, PlanningScope.DAY_REFINE}
        target_day_index = self._target_day_index(request) if is_day_scope else request.targetDayIndex
        target_date = self._target_date(request, target_day_index) if target_day_index is not None else None
        confirmed_day_summaries: list[dict[str, Any]] = []
        if request.latestSnapshot:
            for day_plan in request.latestSnapshot.dayPlans:
                if day_plan.dayIndex == target_day_index:
                    continue
                confirmed_day_summaries.append(
                    {
                        "dayIndex": day_plan.dayIndex,
                        "date": day_plan.date.isoformat() if day_plan.date else None,
                        "status": day_plan.status.value,
                        "title": day_plan.title,
                        "placeNames": [place.name for place in day_plan.places[:8]],
                        "markdownSummary": day_plan.markdown[:600],
                    }
                )
        return {
            "planningScope": request.planningScope.value,
            "isDayScope": is_day_scope,
            "targetDayIndex": target_day_index,
            "targetDate": target_date.isoformat() if target_date else None,
            "totalDays": request.coreSlots.day_count(),
            "confirmedDaySummaries": confirmed_day_summaries,
        }

    def _target_day_index(self, request: AgentRunRequest) -> int:
        if request.targetDayIndex is not None:
            return request.targetDayIndex
        if request.latestSnapshot and request.latestSnapshot.currentDayIndex is not None:
            return request.latestSnapshot.currentDayIndex
        if request.latestSnapshot and request.latestSnapshot.dayPlans:
            completed = set(request.latestSnapshot.completedDayIndexes)
            completed.update(day.dayIndex for day in request.latestSnapshot.dayPlans if day.status.value == "CONFIRMED")
            for day_index in range(1, request.coreSlots.day_count() + 1):
                if day_index not in completed:
                    return day_index
        return 1

    def _target_date(self, request: AgentRunRequest, target_day_index: int):
        if request.targetDate is not None:
            return request.targetDate
        if request.coreSlots.travelStartDate is None:
            return None
        return request.coreSlots.travelStartDate + timedelta(days=target_day_index - 1)

    async def _request_content(
        self,
        client: httpx.AsyncClient,
        url: str,
        headers: dict[str, str],
        payload: dict[str, Any],
    ) -> str:
        response = await client.post(url, headers=headers, json=payload)
        if response.status_code == 429:
            raise DeepSeekRateLimitError("429 Too Many Requests")
        response.raise_for_status()
        return self._extract_content(response.json())

    async def _repair_or_fallback(
        self,
        *,
        started: float,
        client: httpx.AsyncClient,
        url: str,
        headers: dict[str, str],
        request: AgentRunRequest,
        raw_content: str,
        validation_error: Exception,
        places: list[dict[str, Any]],
        weather: dict[str, Any] | None,
        transport_options: list[dict[str, Any]],
        budget: dict[str, Any] | None,
        react_observations: list[dict[str, Any]],
        planner_constraints: dict[str, Any],
        input_summary: str,
    ) -> ToolResult:
        validation_summary = format_validation_error(validation_error)
        warnings = [
            ToolWarning(
                code="MODEL_OUTPUT_INVALID",
                message=(
                    f"DeepSeek 输出未通过结构校验：{validation_summary}；"
                    f"原始输出预览：{self._raw_output_preview(raw_content)}"
                ),
                source="deepseek",
            )
        ]
        repair_payload = self._build_repair_payload(
            request=request,
            places=places,
            weather=weather,
            transport_options=transport_options,
            budget=budget,
            react_observations=react_observations,
            planner_constraints=planner_constraints,
            raw_content=raw_content,
            validation_error=validation_summary,
        )

        try:
            repair_content = await self._request_content(client, url, headers, repair_payload)
            repair_parsed = self._parse_json_content(repair_content)
            repaired_output = validate_planner_output_payload(repair_parsed)
        except (DeepSeekRateLimitError, httpx.TimeoutException, httpx.HTTPError, ValueError, KeyError, ValidationError, TypeError) as repair_error:
            repair_summary = format_validation_error(repair_error)
            warnings.append(
                ToolWarning(
                    code="MODEL_OUTPUT_REPAIR_FAILED",
                    message=f"DeepSeek 输出修复失败：{repair_summary}",
                    source="deepseek",
                )
            )
            return self._tool_result(
                started=started,
                status=ToolStatus.FAILED,
                data=None,
                detail=validation_summary,
                error_code="MODEL_OUTPUT_REPAIR_FAILED",
                error_message=validation_summary,
                user_message="模型输出不符合结构要求，已切换到本地规划模板。",
                input_summary=input_summary,
                output_summary=f"repair failed: {validation_summary}",
                warnings=warnings,
            )

        warnings.append(
            ToolWarning(
                code="MODEL_OUTPUT_REPAIRED",
                message="DeepSeek 输出已修复为所需结构。",
                source="deepseek",
            )
        )
        return self._tool_result(
            started=started,
            status=ToolStatus.PARTIAL_SUCCESS,
            data=repaired_output.model_dump(mode="json", exclude_none=True),
            detail=None,
            user_message="模型输出已自动修复并生成结构化旅行方案。",
            input_summary=input_summary,
            output_summary=summarize_planner_output(repaired_output),
            warnings=warnings,
        )

    def _extract_content(self, data: dict[str, Any]) -> str:
        return data["choices"][0]["message"]["content"]

    def _parse_json_content(self, content: str) -> dict[str, Any]:
        text = content.strip()
        if text.startswith("```"):
            lines = text.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            text = "\n".join(lines).strip()

        if not text.startswith("{"):
            start = text.find("{")
            end = text.rfind("}")
            if start >= 0 and end > start:
                text = text[start : end + 1]

        parsed = json.loads(text)
        if not isinstance(parsed, dict):
            raise ValueError("Model response JSON must be an object")
        return parsed

    def _raw_output_preview(self, content: str, limit: int = 240) -> str:
        text = " ".join(content.strip().split())
        if not text:
            return "<empty>"
        if len(text) <= limit:
            return text
        return f"{text[:limit]}..."

    async def _sleep_before_retry(self, attempt: int) -> None:
        delay = self._settings.deepseek_retry_backoff_seconds * (2**attempt)
        await asyncio.sleep(delay)

    def _tool_result(
        self,
        *,
        started: float,
        status: ToolStatus,
        data: dict[str, Any] | None,
        detail: str | None,
        error_code: str | None = None,
        error_message: str | None = None,
        retry_count: int = 0,
        user_message: str | None = None,
        input_summary: str | None = None,
        output_summary: str | None = None,
        warnings: list[ToolWarning] | None = None,
    ) -> ToolResult:
        return ToolResult(
            tool="deepseek_chat_completion",
            status=status,
            data=data,
            errorCode=error_code,
            errorMessage=error_message or detail,
            latencyMs=int((time.perf_counter() - started) * 1000),
            retryCount=retry_count,
            userMessage=user_message,
            inputSummary=input_summary,
            outputSummary=output_summary,
            warnings=warnings or [],
        )
