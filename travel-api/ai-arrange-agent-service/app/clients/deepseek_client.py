from __future__ import annotations

import asyncio
import json
import time
from typing import Any

import httpx

from app.config import AgentSettings
from app.harness.tool_result import ToolResult, ToolStatus, ToolWarning
from app.models import AgentRunRequest, model_dump_jsonable
from app.prompts.builder import build_system_prompt
from app.prompts.repair_prompt import REPAIR_PROMPT


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
        **_: Any,
    ) -> ToolResult:
        started = time.perf_counter()

        if not self._settings.deepseek_api_key:
            return self._tool_result(
                started=started,
                status=ToolStatus.SKIPPED,
                data=None,
                detail="DEEPSEEK_API_KEY is not configured",
                user_message="模型未配置，已使用本地规划模板。",
                warnings=[
                    ToolWarning(
                        code="MODEL_DISABLED",
                        message="DeepSeek API key is not configured; local fallback was used.",
                        source="deepseek",
                    )
                ],
            )

        url = self._chat_completions_url()
        payload = self._build_payload(
            request=request,
            places=places,
            weather=weather,
            transport_options=transport_options or [],
            budget=budget,
            react_observations=react_observations or [],
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
                    response = await client.post(url, headers=headers, json=payload)
                    if response.status_code == 429:
                        last_error = "429 Too Many Requests"
                        if attempt < self._settings.deepseek_retry_count:
                            await self._sleep_before_retry(attempt)
                            continue
                        warnings.append(
                            ToolWarning(
                                code="MODEL_RATE_LIMIT",
                                message="DeepSeek returned 429 Too Many Requests; local fallback was used.",
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
                            warnings=warnings,
                        )

                    response.raise_for_status()
                    content = self._extract_content(response.json())
                    parsed = self._parse_json_content(content)
                    return self._tool_result(
                        started=started,
                        status=ToolStatus.SUCCESS,
                        data=parsed,
                        detail=None,
                        retry_count=attempt,
                        user_message="已生成结构化旅行方案。",
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
                message="DeepSeek generation failed; local fallback was used.",
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
    ) -> dict[str, Any]:
        user_payload = {
            "request": model_dump_jsonable(request),
            "candidatePlaces": places,
            "weather": weather,
            "transportOptions": transport_options,
            "budget": budget,
            "reactObservations": react_observations,
            "outputRules": {
                "markdown": "Use a concise day-by-day itinerary with weather, budget, and transport notes when available.",
                "places": "Reuse candidatePlaces when possible.",
                "routes": "Return [] when route data is unavailable.",
            },
            "repairRules": REPAIR_PROMPT,
        }
        return {
            "model": self._settings.deepseek_model,
            "temperature": self._settings.deepseek_temperature,
            "messages": [
                {"role": "system", "content": build_system_prompt()},
                {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
            ],
        }

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
            warnings=warnings or [],
        )
