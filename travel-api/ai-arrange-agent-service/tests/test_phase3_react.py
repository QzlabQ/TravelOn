from __future__ import annotations

from fastapi.testclient import TestClient

from app.config import AgentSettings
from app.harness.policy import RuntimePolicy
from app.main import app
from app.prompts.builder import build_system_prompt
from app.prompts.output_contract_prompt import OUTPUT_CONTRACT_PROMPT
from app.prompts.policy_prompt import POLICY_PROMPT
from app.prompts.repair_prompt import REPAIR_PROMPT
from app.prompts.role_prompt import ROLE_PROMPT
from app.prompts.tool_selection_prompt import TOOL_SELECTION_PROMPT


client = TestClient(app)


def test_prompt_fragments_are_composed_into_system_prompt() -> None:
    system_prompt = build_system_prompt()

    assert ROLE_PROMPT in system_prompt
    assert POLICY_PROMPT in system_prompt
    assert OUTPUT_CONTRACT_PROMPT in system_prompt
    assert TOOL_SELECTION_PROMPT in system_prompt
    assert "Do not expose hidden reasoning" in system_prompt
    assert "Return only one JSON object" in system_prompt
    assert "repair" in REPAIR_PROMPT.lower()


def test_react_loop_reserves_capacity_for_fallback() -> None:
    response = client.post(
        "/agent/planner/run",
        json={
            "conversationId": "00000000-0000-0000-0000-000000000010",
            "userId": "00000000-0000-0000-0000-000000000001",
            "coreSlots": {
                "city": "Shanghai",
                "travelStartDate": "2026-06-01",
                "travelEndDate": "2026-06-03",
                "peopleCount": 2,
                "travelStyle": "relaxed",
                "mustVisitKeywords": ["museum", "river view"],
            },
            "userMessage": "Please keep the route relaxed and include transport and budget.",
            "userContext": {"budgetProfile": {"level": "standard"}},
        },
    )

    assert response.status_code == 200
    body = response.json()
    evidence_tools = [
        call["tool"]
        for call in body["toolCalls"]
        if call["tool"] not in {"deepseek_chat_completion", "fallback_plan_builder"}
    ]
    warning_codes = {warning["code"] for warning in body["warnings"]}

    assert len(evidence_tools) <= 4
    assert "fallback_plan_builder" in [call["tool"] for call in body["toolCalls"]]
    assert "TOOL_CALL_LIMIT_REACHED" not in warning_codes
    assert "Budget estimate" in body["markdown"]


def test_runtime_policy_clamps_react_limits_from_settings() -> None:
    settings = AgentSettings(
        app_name="test",
        app_version="0",
        deepseek_api_key="",
        deepseek_base_url="https://example.test",
        deepseek_chat_completions_path="/chat/completions",
        deepseek_model="model",
        deepseek_temperature=0.1,
        deepseek_timeout_seconds=5,
        deepseek_retry_count=1,
        deepseek_retry_backoff_seconds=0.1,
        amap_api_key="",
        amap_base_url="https://amap.test",
        amap_enabled=True,
        amap_timeout_seconds=5,
        offer_provider_base_url="http://offer",
        transport_service_base_url="http://transport",
        weather_base_url="",
        weather_api_key="",
        agent_tool_mock_enabled=True,
        agent_max_tool_calls_per_turn=5,
        agent_max_model_calls_per_turn=9,
        agent_max_react_steps=9,
        agent_max_react_tool_calls=9,
        agent_max_runtime_seconds=12,
        agent_tool_timeout_seconds=4,
        agent_trace_enabled=False,
    )

    policy = RuntimePolicy.from_settings(settings)

    assert policy.max_model_calls_per_turn == 2
    assert policy.max_react_steps == 3
    assert policy.max_react_tool_calls == 4

