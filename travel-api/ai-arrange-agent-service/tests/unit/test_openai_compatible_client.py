from __future__ import annotations

import json
from dataclasses import replace
from typing import Any

import pytest

from app.clients.openai_compatible_client import OpenAICompatibleClient
from app.config import AgentSettings, load_settings
from app.harness.tool_result import ToolStatus
from app.models import AgentRunRequest, PlannerModelVariant
from app.validation.planner_output import validate_planner_output_payload


def agent_settings() -> AgentSettings:
    return AgentSettings(
        app_name="test",
        app_version="0",
        model_api_key="test-key",
        model_base_url="https://example.test",
        model_chat_completions_path="/chat/completions",
        model_name="model",
        model_thinking_type="disabled",
        model_json_mode=True,
        model_temperature=0.1,
        model_timeout_seconds=5,
        model_retry_count=0,
        model_retry_backoff_seconds=0.1,
        model_max_tokens=1200,
        model_slow_response_warning_ms=60000,
        amap_api_key="",
        amap_base_url="https://amap.test",
        amap_enabled=True,
        amap_timeout_seconds=5,
        offer_provider_base_url="http://offer",
        transport_service_base_url="http://travel-core",
        weather_base_url="",
        weather_api_key="",
        agent_tool_mock_enabled=True,
        agent_max_tool_calls_per_turn=5,
        agent_max_model_calls_per_turn=1,
        agent_max_react_steps=3,
        agent_max_react_tool_calls=4,
        agent_max_runtime_seconds=12,
        agent_model_timeout_seconds=5,
        agent_tool_timeout_seconds=4,
        agent_trace_enabled=False,
    )


def test_load_settings_defaults_match_documented_stage0_values(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_MODEL_TIMEOUT_SECONDS", "")
    monkeypatch.setenv("AI_MAX_TOKENS", "")
    monkeypatch.setenv("AI_MODEL", "custom-model")
    monkeypatch.setenv("AI_THINKING_TYPE", "")
    monkeypatch.setenv("AGENT_MODEL_TIMEOUT_SECONDS", "")
    monkeypatch.setenv("AGENT_MAX_RUNTIME_SECONDS", "")

    settings = load_settings()

    assert settings.model_timeout_seconds == 90
    assert settings.agent_model_timeout_seconds == 90
    assert settings.agent_max_runtime_seconds == 120
    assert settings.model_max_tokens == 12000
    assert settings.model_name == "custom-model"
    assert settings.model_thinking_type == "omit"


def test_load_settings_reads_provider_neutral_model_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_BASE_URL", "https://llm.example.test/v1")
    monkeypatch.setenv("AI_CHAT_COMPLETIONS_PATH", "/responses/chat/completions")
    monkeypatch.setenv("AI_API_KEY", "custom-key")
    monkeypatch.setenv("AI_MODEL", "custom-model")
    monkeypatch.setenv("AI_JSON_MODE", "false")

    settings = load_settings()

    assert settings.model_base_url == "https://llm.example.test/v1"
    assert settings.model_chat_completions_path == "/responses/chat/completions"
    assert settings.model_api_key == "custom-key"
    assert settings.model_name == "custom-model"
    assert settings.model_json_mode is False


def sample_request() -> AgentRunRequest:
    return AgentRunRequest.model_validate(
        {
            "conversationId": "00000000-0000-0000-0000-000000000010",
            "userId": "00000000-0000-0000-0000-000000000001",
            "coreSlots": {
                "city": "Shanghai",
                "travelStartDate": "2026-06-01",
                "travelEndDate": "2026-06-03",
                "peopleCount": 2,
            },
            "userMessage": "Plan a relaxed trip.",
        }
    )


def test_validate_planner_output_normalizes_model_place_type_aliases() -> None:
    output = validate_planner_output_payload(
        {
            "assistantText": "已生成行程。",
            "title": "上海第一天行程",
            "markdown": "# 上海第一天",
            "places": [
                {"name": "外滩", "type": "scenic", "source": "ai"},
                {"name": "豫园", "type": "景点", "source": "高德"},
                {"name": "小杨生煎", "type": "food", "source": "AI"},
            ],
            "routes": [],
        }
    )

    assert output.places[0].type.value == "SCENIC"
    assert output.places[0].source.value == "AI"
    assert output.places[1].type.value == "SCENIC"
    assert output.places[1].source.value == "AMAP"
    assert output.places[2].type.value == "RESTAURANT"


def test_validate_planner_output_drops_invalid_uuid_placeholders() -> None:
    output = validate_planner_output_payload(
        {
            "assistantText": "已生成行程。",
            "title": "上海第一天行程",
            "markdown": "# 上海第一天",
            "places": [
                {"placeId": "x-bund", "name": "外滩", "type": "SCENIC", "source": "AI"},
            ],
            "routes": [
                {"fromPlaceId": "x-bund", "toPlaceId": "x-museum", "summary": "步行串联。"},
            ],
        }
    )

    assert output.places[0].placeId is None
    assert output.routes[0].fromPlaceId is None
    assert output.routes[0].toPlaceId is None


def test_model_payload_includes_day_scope_rules() -> None:
    client = OpenAICompatibleClient(agent_settings())
    request = AgentRunRequest.model_validate(
        {
            "conversationId": "00000000-0000-0000-0000-000000000010",
            "userId": "00000000-0000-0000-0000-000000000001",
            "planningScope": "DAY_PLAN",
            "targetDayIndex": 2,
            "coreSlots": {
                "city": "Shanghai",
                "travelStartDate": "2026-06-01",
                "travelEndDate": "2026-06-03",
                "peopleCount": 2,
            },
            "latestSnapshot": {
                "version": 1,
                "dayPlans": [
                    {
                        "dayIndex": 1,
                        "date": "2026-06-01",
                        "status": "CONFIRMED",
                        "title": "Day 1",
                        "markdown": "# Day 1\n\nThe Bund route.",
                        "places": [{"name": "The Bund", "type": "SCENIC", "source": "AI"}],
                        "routes": [],
                    }
                ],
                "completedDayIndexes": [1],
            },
        }
    )

    payload = client._build_payload(  # noqa: SLF001 - stage C+2 regression covers provider payload contract.
        request=request,
        places=[],
        weather=None,
        transport_options=[],
        budget=None,
        react_observations=[],
        planner_constraints={},
    )
    user_payload = json.loads(payload["messages"][-1]["content"])

    assert user_payload["dayScope"]["isDayScope"] is True
    assert user_payload["dayScope"]["targetDayIndex"] == 2
    assert user_payload["dayScope"]["targetDate"] == "2026-06-02"
    assert user_payload["dayScope"]["confirmedDaySummaries"][0]["dayIndex"] == 1
    assert user_payload["responseBudget"]["markdownMaxChars"] == 5600
    assert user_payload["responseBudget"]["markdownTargetMinChars"] == 2200
    assert "repairRules" not in user_payload
    assert "Return ONLY the target day plan" in user_payload["outputRules"]["markdown"]
    assert "backslash" in user_payload["outputRules"]["jsonEscaping"]
    assert payload["thinking"] == {"type": "disabled"}
    assert payload["max_tokens"] == 1200
    assert payload["model"] == "model"


def test_model_payload_uses_configured_model_for_flash_variant() -> None:
    client = OpenAICompatibleClient(agent_settings())
    request = sample_request().model_copy(update={"modelVariant": PlannerModelVariant.FLASH})

    payload = client._build_payload(  # noqa: SLF001 - regression covers provider payload contract.
        request=request,
        places=[],
        weather=None,
        transport_options=[],
        budget=None,
        react_observations=[],
        planner_constraints={},
    )

    assert payload["model"] == "model"


def test_model_payload_uses_configured_model_for_pro_variant() -> None:
    client = OpenAICompatibleClient(agent_settings())
    request = sample_request().model_copy(update={"modelVariant": PlannerModelVariant.PRO})

    payload = client._build_payload(  # noqa: SLF001 - regression covers provider payload contract.
        request=request,
        places=[],
        weather=None,
        transport_options=[],
        budget=None,
        react_observations=[],
        planner_constraints={},
    )

    assert payload["model"] == "model"


def test_model_payload_can_omit_thinking_field_for_provider_ab_tests() -> None:
    client = OpenAICompatibleClient(replace(agent_settings(), model_thinking_type="omit"))

    payload = client._build_payload(  # noqa: SLF001 - regression covers provider payload contract.
        request=sample_request(),
        places=[],
        weather=None,
        transport_options=[],
        budget=None,
        react_observations=[],
        planner_constraints={},
    )

    assert "thinking" not in payload


def test_model_parser_repairs_invalid_backslash_escapes() -> None:
    client = OpenAICompatibleClient(agent_settings())

    parsed = client._parse_json_content(  # noqa: SLF001 - regression covers provider JSON tolerance.
        r'{"assistantText":"已生成。","title":"上海行程","markdown":"路线提示：\emoji 和 \walk 标记","places":[],"routes":[],}'
    )

    assert parsed["markdown"] == r"路线提示：\emoji 和 \walk 标记"


@pytest.mark.asyncio
async def test_model_success_includes_timing_metadata(monkeypatch: pytest.MonkeyPatch) -> None:
    client = OpenAICompatibleClient(agent_settings())

    async def fake_request_content(*_: Any, **__: Any) -> str:
        return json.dumps(
            {
                "assistantText": "已生成规划。",
                "title": "上海行程",
                "summary": "简短行程。",
                "markdown": "# 上海行程\n\n- 第 1 天：外滩。",
                "nextQuestion": None,
                "places": [],
                "routes": [],
            },
            ensure_ascii=False,
        )

    monkeypatch.setattr(client, "_request_content", fake_request_content)

    result = await client.generate_plan(sample_request(), places=[])

    assert result.status == ToolStatus.SUCCESS
    assert result.metadata["payloadBytes"] > 0
    assert result.metadata["model"] == "model"
    assert result.metadata["thinkingType"] == "disabled"
    assert result.metadata["maxTokens"] == 1200
    assert result.metadata["responseChars"] > 0
    assert result.metadata["requestMs"] >= 0
    assert result.metadata["parseMs"] >= 0
    assert result.metadata["validationMs"] >= 0
    assert "payloadBytes=" in (result.outputSummary or "")


@pytest.mark.asyncio
async def test_model_repairs_schema_invalid_model_output(monkeypatch: pytest.MonkeyPatch) -> None:
    client = OpenAICompatibleClient(agent_settings())
    calls: list[dict[str, Any]] = []

    async def fake_request_content(*args: Any, **_: Any) -> str:
        payload = args[-1]
        calls.append(payload)
        if len(calls) == 1:
            return json.dumps(
                {
                    "assistantText": "我先给出草稿。",
                    "title": "上海行程",
                    "places": [],
                    "routes": [],
                },
                ensure_ascii=False,
            )
        return json.dumps(
            {
                "assistantText": "我已修复规划。",
                "title": "上海行程",
                "summary": "简短行程。",
                "markdown": "# 上海行程\n\n- 第 1 天：博物馆。",
                "nextQuestion": None,
                "places": [],
                "routes": [],
            },
            ensure_ascii=False,
        )

    monkeypatch.setattr(client, "_request_content", fake_request_content)

    result = await client.generate_plan(sample_request(), places=[])
    warning_codes = {warning.code for warning in result.warnings}
    repair_payload = json.loads(calls[1]["messages"][-1]["content"])

    assert result.status == ToolStatus.PARTIAL_SUCCESS
    assert result.data and result.data["markdown"].startswith("# 上海行程")
    assert {"MODEL_OUTPUT_INVALID", "MODEL_OUTPUT_REPAIRED"}.issubset(warning_codes)
    assert calls[0]["max_tokens"] == 1200
    assert calls[0]["thinking"] == {"type": "disabled"}
    assert calls[0]["response_format"] == {"type": "json_object"}
    assert calls[1]["max_tokens"] == 1200
    assert calls[1]["thinking"] == {"type": "disabled"}
    assert calls[1]["response_format"] == {"type": "json_object"}
    assert "expectedOutputSchema" in repair_payload
    assert "repairRules" in repair_payload
    assert result.metadata["repairPayloadBytes"] > result.metadata["payloadBytes"]
    assert result.metadata["repairRequestMs"] >= 0
    assert result.inputSummary
    assert result.outputSummary
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_model_fails_fast_when_json_is_unrecoverable(monkeypatch: pytest.MonkeyPatch) -> None:
    client = OpenAICompatibleClient(agent_settings())
    calls: list[object] = []

    async def fake_request_content(*args: Any, **__: Any) -> str:
        calls.append(args[-1])
        return "still not json"

    monkeypatch.setattr(client, "_request_content", fake_request_content)

    result = await client.generate_plan(sample_request(), places=[])

    assert result.status == ToolStatus.FAILED
    assert result.errorCode == "MODEL_OUTPUT_PARSE_FAILED"
    invalid_warning = next(warning for warning in result.warnings if warning.code == "MODEL_OUTPUT_INVALID")
    assert "原始输出预览：still not json" in invalid_warning.message
    assert len(calls) == 1
    assert "repairRequestMs" not in result.metadata


@pytest.mark.asyncio
async def test_model_fails_cleanly_when_repair_is_invalid(monkeypatch: pytest.MonkeyPatch) -> None:
    client = OpenAICompatibleClient(agent_settings())
    calls: list[object] = []

    async def fake_request_content(*args: Any, **__: Any) -> str:
        calls.append(args[-1])
        if len(calls) == 1:
            return json.dumps({"assistantText": "缺少关键字段。", "title": "上海行程"}, ensure_ascii=False)
        return "still not json"

    monkeypatch.setattr(client, "_request_content", fake_request_content)

    result = await client.generate_plan(sample_request(), places=[])

    assert result.status == ToolStatus.FAILED
    assert result.errorCode == "MODEL_OUTPUT_REPAIR_FAILED"
    assert len(calls) == 2
