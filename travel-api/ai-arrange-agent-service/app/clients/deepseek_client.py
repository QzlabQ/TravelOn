from __future__ import annotations

import asyncio
import json
import re
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


_INVALID_JSON_ESCAPE_PATTERN = re.compile(r'\\(?!["\\/bfnrtu])')
_TRAILING_JSON_COMMA_PATTERN = re.compile(r",(\s*[}\]])")


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
        context: Any | None = None,
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
        payload_metrics = self._payload_metrics(payload)
        self._emit_payload_ready(context, payload_metrics)
        headers = {
            "Authorization": f"Bearer {self._settings.deepseek_api_key}",
            "Content-Type": "application/json",
        }

        last_error = "unknown error"
        warnings: list[ToolWarning] = []
        timing_metadata: dict[str, Any] = dict(payload_metrics)
        async with httpx.AsyncClient(timeout=self._settings.deepseek_timeout_seconds) as client:
            for attempt in range(self._settings.deepseek_retry_count + 1):
                request_started = time.perf_counter()
                try:
                    content = await self._request_content(client, url, headers, payload)
                    timing_metadata["requestMs"] = self._elapsed_ms(request_started)
                    timing_metadata["responseChars"] = len(content)

                    try:
                        parse_started = time.perf_counter()
                        try:
                            parsed, parse_metadata = self._parse_json_content_with_stats(content)
                        finally:
                            timing_metadata["parseMs"] = self._elapsed_ms(parse_started)
                        timing_metadata.update(parse_metadata)

                        validation_started = time.perf_counter()
                        try:
                            validated_output = validate_planner_output_payload(parsed)
                        finally:
                            timing_metadata["validationMs"] = self._elapsed_ms(validation_started)
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
                            metadata=timing_metadata,
                        )

                    return self._tool_result(
                        started=started,
                        status=ToolStatus.SUCCESS,
                        data=validated_output.model_dump(mode="json", exclude_none=True),
                        detail=None,
                        retry_count=attempt,
                        user_message="已生成结构化旅行方案。",
                        input_summary=input_summary,
                        output_summary=self._output_summary_with_metrics(
                            summarize_planner_output(validated_output),
                            timing_metadata,
                        ),
                        warnings=warnings,
                        metadata=timing_metadata,
                    )
                except DeepSeekRateLimitError as error:
                    timing_metadata["requestMs"] = self._elapsed_ms(request_started)
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
                        output_summary=self._output_summary_with_metrics(
                            "rate limited; local fallback required",
                            timing_metadata,
                        ),
                        warnings=warnings,
                        metadata=timing_metadata,
                    )
                except (httpx.TimeoutException, httpx.HTTPError, ValueError, KeyError) as error:
                    timing_metadata["requestMs"] = self._elapsed_ms(request_started)
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
            output_summary=self._output_summary_with_metrics(
                f"generation failed: {last_error}",
                timing_metadata,
            ),
            warnings=warnings,
            metadata=timing_metadata,
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
            "thinking": {"type": "disabled"},
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
                "repairRules": REPAIR_PROMPT,
                "expectedOutputSchema": PlannerModelOutput.model_json_schema(),
            }
        )
        return {
            "model": self._settings.deepseek_model,
            "thinking": {"type": "disabled"},
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
            "markdown": "Use concise Chinese Markdown. Prefer bullet points over long paragraphs.",
            "places": "Reuse candidatePlaces when possible. Return at most 8 places.",
            "routes": "Return at most 8 route segments, or [] when route data is unavailable.",
            "userSelections": "Keep selected places and style choices unless impossible; do not use rejected places as main recommendations.",
            "snapshot": "When latestSnapshot is provided, treat it as the previous saved plan and describe only useful changes in Chinese.",
            "jsonEscaping": "Do not write backslash commands or raw escape-like markers in user-facing text. Use plain Chinese punctuation and words.",
        }
        if day_scope["isDayScope"]:
            output_rules.update(
                {
                    "markdown": (
                        "Return ONLY the target day plan. Do not generate other days. "
                        "Keep markdown under 2800 Chinese characters and include useful details for time windows, food, transport, budget notes, weather reminders, and alternatives."
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
            "responseBudget": self._response_budget(day_scope),
            "outputRules": output_rules,
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

    def _response_budget(self, day_scope: dict[str, Any]) -> dict[str, Any]:
        if day_scope["isDayScope"]:
            return {
                "assistantTextMaxChars": 180,
                "summaryMaxChars": 220,
                "markdownMaxChars": 2800,
                "maxPlaces": 12,
                "maxRoutes": 12,
            }
        return {
            "assistantTextMaxChars": 220,
            "summaryMaxChars": 260,
            "markdownMaxChars": 8000,
            "maxPlaces": 16,
            "maxRoutes": 20,
        }

    def _payload_metrics(self, payload: dict[str, Any]) -> dict[str, Any]:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        messages = payload.get("messages") or []
        system_prompt = str(messages[0].get("content") or "") if len(messages) > 0 and isinstance(messages[0], dict) else ""
        user_prompt = str(messages[-1].get("content") or "") if messages and isinstance(messages[-1], dict) else ""
        return {
            "payloadChars": len(body),
            "payloadBytes": len(body.encode("utf-8")),
            "systemPromptChars": len(system_prompt),
            "userPayloadChars": len(user_prompt),
            "maxTokens": payload.get("max_tokens"),
        }

    def _emit_payload_ready(self, context: Any | None, metadata: dict[str, Any]) -> None:
        recorder = getattr(context, "recorder", None)
        if recorder is None:
            return
        recorder.emit(
            event_type="MODEL_PAYLOAD_READY",
            name="deepseek_chat_completion",
            status="READY",
            message="DeepSeek 请求载荷已准备。",
            metadata=metadata,
            phase="model",
        )

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
        metadata: dict[str, Any],
    ) -> ToolResult:
        metadata = dict(metadata)
        validation_summary = format_validation_error(validation_error)
        metadata["validationError"] = validation_summary
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

        if isinstance(validation_error, json.JSONDecodeError):
            return self._tool_result(
                started=started,
                status=ToolStatus.FAILED,
                data=None,
                detail=validation_summary,
                error_code="MODEL_OUTPUT_PARSE_FAILED",
                error_message=validation_summary,
                user_message="模型输出不是有效 JSON，已切换到本地规划模板。",
                input_summary=input_summary,
                output_summary=self._output_summary_with_metrics(
                    f"parse failed: {validation_summary}",
                    metadata,
                ),
                warnings=warnings,
                metadata=metadata,
            )

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
        repair_payload_metrics = self._payload_metrics(repair_payload)
        metadata.update({f"repair{k[0].upper()}{k[1:]}": v for k, v in repair_payload_metrics.items()})

        try:
            repair_started = time.perf_counter()
            repair_content = await self._request_content(client, url, headers, repair_payload)
            metadata["repairRequestMs"] = self._elapsed_ms(repair_started)
            metadata["repairResponseChars"] = len(repair_content)

            repair_parse_started = time.perf_counter()
            try:
                repair_parsed, repair_parse_metadata = self._parse_json_content_with_stats(repair_content)
            finally:
                metadata["repairParseMs"] = self._elapsed_ms(repair_parse_started)
            metadata.update({f"repair{k[0].upper()}{k[1:]}": v for k, v in repair_parse_metadata.items()})

            repair_validation_started = time.perf_counter()
            try:
                repaired_output = validate_planner_output_payload(repair_parsed)
            finally:
                metadata["repairValidationMs"] = self._elapsed_ms(repair_validation_started)
        except (DeepSeekRateLimitError, httpx.TimeoutException, httpx.HTTPError, ValueError, KeyError, ValidationError, TypeError) as repair_error:
            repair_summary = format_validation_error(repair_error)
            metadata["repairError"] = repair_summary
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
                output_summary=self._output_summary_with_metrics(
                    f"repair failed: {validation_summary}",
                    metadata,
                ),
                warnings=warnings,
                metadata=metadata,
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
            output_summary=self._output_summary_with_metrics(
                summarize_planner_output(repaired_output),
                metadata,
            ),
            warnings=warnings,
            metadata=metadata,
        )

    def _extract_content(self, data: dict[str, Any]) -> str:
        return data["choices"][0]["message"]["content"]

    def _parse_json_content(self, content: str) -> dict[str, Any]:
        parsed, _ = self._parse_json_content_with_stats(content)
        return parsed

    def _parse_json_content_with_stats(self, content: str) -> tuple[dict[str, Any], dict[str, Any]]:
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

        metadata: dict[str, Any] = {
            "jsonFenceStripped": content.strip() != text,
            "jsonCandidateChars": len(text),
        }
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as error:
            repaired_text = text
            repaired_text = _INVALID_JSON_ESCAPE_PATTERN.sub(r"\\\\", repaired_text)
            if repaired_text != text:
                metadata["localEscapeRepairApplied"] = True
                metadata["localEscapeRepairError"] = error.msg

            comma_repaired_text = _TRAILING_JSON_COMMA_PATTERN.sub(r"\1", repaired_text)
            if comma_repaired_text != repaired_text:
                metadata["localTrailingCommaRepairApplied"] = True
                repaired_text = comma_repaired_text

            if repaired_text == text:
                raise
            parsed = json.loads(repaired_text)
        if not isinstance(parsed, dict):
            raise ValueError("Model response JSON must be an object")
        metadata.setdefault("localEscapeRepairApplied", False)
        metadata.setdefault("localTrailingCommaRepairApplied", False)
        return parsed, metadata

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

    def _elapsed_ms(self, started: float) -> int:
        return int((time.perf_counter() - started) * 1000)

    def _output_summary_with_metrics(self, summary: str, metadata: dict[str, Any]) -> str:
        metric_keys = [
            "payloadBytes",
            "maxTokens",
            "requestMs",
            "responseChars",
            "parseMs",
            "validationMs",
            "repairPayloadBytes",
            "repairRequestMs",
            "repairResponseChars",
            "repairParseMs",
        ]
        parts = [f"{key}={metadata[key]}" for key in metric_keys if metadata.get(key) is not None]
        return f"{summary}; {'; '.join(parts)}" if parts else summary

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
        metadata: dict[str, Any] | None = None,
    ) -> ToolResult:
        return ToolResult(
            tool="deepseek_chat_completion",
            status=status,
            data=data,
            metadata=metadata or {},
            errorCode=error_code,
            errorMessage=error_message or detail,
            latencyMs=self._elapsed_ms(started),
            retryCount=retry_count,
            userMessage=user_message,
            inputSummary=input_summary,
            outputSummary=output_summary,
            warnings=warnings or [],
        )
