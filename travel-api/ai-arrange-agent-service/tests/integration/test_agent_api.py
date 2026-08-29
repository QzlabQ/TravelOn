from __future__ import annotations

import json
from copy import deepcopy

import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)
pytestmark = pytest.mark.integration


def _parse_sse_events(text: str) -> list[dict]:
    events: list[dict] = []
    event_type: str | None = None
    data_lines: list[str] = []

    for line in text.splitlines():
        if line.startswith("event:"):
            event_type = line.removeprefix("event:").strip()
            continue
        if line.startswith("data:"):
            data_lines.append(line.removeprefix("data:").strip())
            continue
        if line == "" and event_type and data_lines:
            payload = json.loads("\n".join(data_lines))
            assert payload["type"] == event_type
            events.append(payload)
            event_type = None
            data_lines = []

    if event_type and data_lines:
        payload = json.loads("\n".join(data_lines))
        assert payload["type"] == event_type
        events.append(payload)

    return events


def test_health_returns_configuration_flags() -> None:
    response = client.get("/agent/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "UP"
    assert body["service"] == "ai-arrange-agent-service"
    assert "deepseekConfigured" in body
    assert "amapConfigured" in body


def test_planner_response_uses_ascii_safe_utf8_json_for_windows_shells() -> None:
    response = client.post(
        "/agent/planner/run",
        json={
            "conversationId": "00000000-0000-0000-0000-000000000017",
            "userId": "00000000-0000-0000-0000-000000000001",
            "coreSlots": {
                "city": "Shanghai",
                "peopleCount": 2,
            },
            "userMessage": "Plan a trip.",
        },
    )

    assert response.status_code == 200
    assert "application/json" in response.headers["content-type"]
    assert "charset=utf-8" in response.headers["content-type"].lower()
    assert b"\\u5f00\\u59cb\\u751f\\u6210\\u65c5\\u884c\\u89c4\\u5212" in response.content
    assert "开始生成旅行规划".encode("utf-8") not in response.content
    assert response.json()["userFacingEvents"][0]["message"] == "开始生成旅行规划。"


def test_run_planner_without_external_keys_returns_structured_fallback() -> None:
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
            "userMessage": "Please keep the route relaxed.",
            "userContext": {
                "travelPreferences": {"budgetLevel": "standard"},
                "historicalTrips": [],
                "familyProfile": {"withChildren": False},
                "budgetProfile": {"level": "standard"},
            },
            "selectedPlaceIds": [],
            "latestSnapshot": {"version": 0, "markdown": "", "places": [], "routes": []},
            "history": [],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] in {"SUCCESS", "PARTIAL_SUCCESS"}
    assert body["title"]
    assert body["traceId"]
    assert body["markdown"].startswith("#")
    assert isinstance(body["places"], list)
    assert isinstance(body["routes"], list)
    assert isinstance(body["recommendationGroups"], list)
    assert body["recommendationGroups"]
    assert body["snapshotDraft"]
    assert body["snapshotDraft"]["proposedVersion"] == 1
    assert body["snapshotDraft"]["scope"] == "DAY_PLAN"
    assert body["snapshotDraft"]["targetDayIndex"] == 1
    assert body["snapshotDraft"]["currentDayPlan"]["dayIndex"] == 1
    assert body["snapshotDraft"]["currentDayPlan"]["markdown"] == body["snapshotDraft"]["markdown"]
    assert body["snapshotDraft"]["dayPlans"][0]["dayIndex"] == 1
    assert body["nextAction"] in {"ASK_USER_SELECTION", "PLAN_UPDATED"}
    assert "## 第 1 天" in body["markdown"]
    assert "## 第 2 天" not in body["markdown"]
    assert isinstance(body["userFacingEvents"], list)
    assert body["userFacingEvents"]
    assert any(call["tool"] == "deepseek_chat_completion" for call in body["toolCalls"])
    assert any(call["tool"] == "search_hotels" for call in body["toolCalls"])
    assert any(call["tool"] == "get_weather" for call in body["toolCalls"])
    assert any(call["tool"] == "search_flights" for call in body["toolCalls"])
    assert any(call["tool"] == "estimate_budget" for call in body["toolCalls"])
    assert "预算估算" in body["markdown"]
    assert any(place["type"] != "HOTEL" for place in body["places"])


def test_stream_planner_returns_stage_events_and_final_response() -> None:
    response = client.post(
        "/agent/planner/stream",
        json={
            "conversationId": "00000000-0000-0000-0000-000000000018",
            "userId": "00000000-0000-0000-0000-000000000001",
            "coreSlots": {
                "city": "Shanghai",
                "travelStartDate": "2026-06-01",
                "travelEndDate": "2026-06-03",
                "peopleCount": 2,
                "travelStyle": "relaxed",
                "mustVisitKeywords": ["museum"],
            },
            "userMessage": "Please keep the route relaxed.",
            "latestSnapshot": {"version": 0, "markdown": "", "places": [], "routes": []},
        },
        headers={"accept": "text/event-stream"},
    )

    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]
    events = _parse_sse_events(response.text)
    event_types = [event["type"] for event in events]

    assert event_types[0] == "RUN_STARTED"
    assert "TOOL_STARTED" in event_types
    assert "MODEL_STARTED" in event_types
    assert "MODEL_FINISHED" in event_types
    assert "FALLBACK_USED" in event_types
    assert "OPTIONS_READY" in event_types
    assert "SNAPSHOT_DRAFT_READY" in event_types
    assert event_types[-1] == "RUN_FINISHED"

    final_event = events[-1]
    final_response = final_event["data"]["response"]
    assert final_event["traceId"] == final_response["traceId"]
    assert final_response["status"] in {"SUCCESS", "PARTIAL_SUCCESS"}
    assert final_response["snapshotDraft"]["scope"] == "DAY_PLAN"
    assert final_response["recommendationGroups"]
    assert final_response["markdown"].startswith("#")
    assert all("Authorization" not in json.dumps(event) for event in events)
    assert all("Bearer" not in json.dumps(event) for event in events)


def test_stream_planner_reports_missing_required_slots_in_final_event() -> None:
    response = client.post(
        "/agent/planner/stream",
        json={
            "conversationId": "00000000-0000-0000-0000-000000000019",
            "userId": "00000000-0000-0000-0000-000000000001",
            "coreSlots": {
                "city": "Shanghai",
                "peopleCount": 2,
            },
            "userMessage": "Plan a trip.",
        },
        headers={"accept": "text/event-stream"},
    )

    assert response.status_code == 200
    events = _parse_sse_events(response.text)
    event_types = [event["type"] for event in events]

    assert event_types[0] == "RUN_STARTED"
    assert "SNAPSHOT_DRAFT_READY" not in event_types
    assert events[-1]["type"] == "RUN_FINISHED"
    final_response = events[-1]["data"]["response"]
    assert final_response["status"] == "PARTIAL_SUCCESS"
    assert final_response["warnings"][0]["code"] == "MISSING_REQUIRED_SLOTS"
    assert "出行开始日期" in final_response["nextQuestion"]


def test_run_planner_refine_mode_returns_snapshot_draft_and_interactive_groups() -> None:
    response = client.post(
        "/agent/planner/run",
        json={
            "conversationId": "00000000-0000-0000-0000-000000000011",
            "userId": "00000000-0000-0000-0000-000000000001",
            "planningMode": "REFINE_WITH_SELECTION",
            "coreSlots": {
                "city": "Shanghai",
                "travelStartDate": "2026-06-01",
                "travelEndDate": "2026-06-03",
                "peopleCount": 2,
                "travelStyle": "relaxed",
                "mustVisitKeywords": ["museum", "river view"],
            },
            "userMessage": "Please keep it relaxed and include the selected places.",
            "selectedPlaceIds": [],
            "interaction": {
                "selectedOptionIds": ["style:relaxed"],
                "rejectedOptionIds": ["place:night-market"],
                "selectedPlaceIds": [],
                "rejectedPlaceIds": [],
                "freeText": "希望少走路。",
                "confirmCurrentPlan": False,
            },
            "latestSnapshot": {
                "version": 3,
                "markdown": "# Existing plan",
                "places": [],
                "routes": [],
            },
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] in {"SUCCESS", "PARTIAL_SUCCESS"}
    assert body["nextAction"] == "PLAN_UPDATED"
    assert body["snapshotDraft"]["baseVersion"] == 3
    assert body["snapshotDraft"]["proposedVersion"] == 4
    assert body["snapshotDraft"]["selectedPlaceIds"] == []
    assert body["recommendationGroups"]
    assert any(group["groupId"] == "recommended_places" for group in body["recommendationGroups"])
    assert any(group["groupId"] == "planning_style" for group in body["recommendationGroups"])
    assert any(group["groupId"] == "day_plan_actions" for group in body["recommendationGroups"])
    assert any(group["groupId"] == "finalize_plan" for group in body["recommendationGroups"])
    assert any(
        option["selected"] is True
        for group in body["recommendationGroups"]
        for option in group["options"]
        if option["optionId"] == "style:relaxed"
    )


def test_run_planner_day_plan_scope_merges_current_day_into_snapshot() -> None:
    response = client.post(
        "/agent/planner/run",
        json={
            "conversationId": "00000000-0000-0000-0000-000000000013",
            "userId": "00000000-0000-0000-0000-000000000001",
            "planningScope": "DAY_PLAN",
            "targetDayIndex": 2,
            "coreSlots": {
                "city": "Shanghai",
                "travelStartDate": "2026-06-01",
                "travelEndDate": "2026-06-03",
                "peopleCount": 2,
            },
            "userMessage": "Plan the second day with museums and food.",
            "latestSnapshot": {
                "version": 7,
                "markdown": "# Existing day-by-day plan",
                "places": [],
                "routes": [],
                "dayPlans": [
                    {
                        "dayIndex": 1,
                        "date": "2026-06-01",
                        "status": "CONFIRMED",
                        "title": "Shanghai Day 1",
                        "markdown": "# Day 1\n\nConfirmed river-view route.",
                        "places": [],
                        "routes": [],
                        "selectedPlaceIds": [],
                        "rejectedPlaceIds": [],
                        "checksum": "day-1-checksum",
                    }
                ],
                "currentDayIndex": 2,
                "completedDayIndexes": [1],
            },
        },
    )

    assert response.status_code == 200
    body = response.json()
    draft = body["snapshotDraft"]
    assert draft["baseVersion"] == 7
    assert draft["proposedVersion"] == 8
    assert draft["scope"] == "DAY_PLAN"
    assert draft["targetDayIndex"] == 2
    assert draft["currentDayPlan"]["dayIndex"] == 2
    assert draft["currentDayPlan"]["date"] == "2026-06-02"
    assert draft["currentDayPlan"]["markdown"] == draft["markdown"]
    assert [day_plan["dayIndex"] for day_plan in draft["dayPlans"]] == [1, 2]
    assert draft["dayPlans"][0]["status"] == "CONFIRMED"
    assert any(op["path"] == "/dayPlans/2" for op in draft["patchOps"])
    assert "## 第 2 天" in draft["markdown"]
    assert "## 第 1 天" not in draft["markdown"]
    day_action_group = next(group for group in body["recommendationGroups"] if group["groupId"] == "day_plan_actions")
    option_ids = {option["optionId"] for option in day_action_group["options"]}
    assert {"day:confirm_current_day", "day:rewrite_current_day", "day:next_day"}.issubset(option_ids)


def test_run_planner_replans_from_rollback_snapshot_with_stable_checksum() -> None:
    selected_place_id = "11111111-1111-1111-1111-111111111111"
    rejected_place_id = "22222222-2222-2222-2222-222222222222"

    day1_v1_snapshot = {
        "version": 1,
        "markdown": "# Day 1 v1\n\n- Shanghai Museum\n- Night Market",
        "places": [
            {
                "placeId": selected_place_id,
                "name": "Shanghai Museum",
                "type": "SCENIC",
                "source": "AI",
                "description": "Original cultural anchor.",
            },
            {
                "placeId": rejected_place_id,
                "name": "Night Market",
                "type": "RESTAURANT",
                "source": "AI",
                "description": "Rejected crowded food stop.",
            },
        ],
        "routes": [],
        "dayPlans": [
            {
                "dayIndex": 1,
                "date": "2026-06-01",
                "status": "DRAFT",
                "title": "Day 1 v1",
                "markdown": "# Day 1 v1\n\n- Shanghai Museum\n- Night Market",
                "places": [
                    {
                        "placeId": selected_place_id,
                        "name": "Shanghai Museum",
                        "type": "SCENIC",
                        "source": "AI",
                    },
                    {
                        "placeId": rejected_place_id,
                        "name": "Night Market",
                        "type": "RESTAURANT",
                        "source": "AI",
                    },
                ],
                "routes": [],
                "checksum": "day-1-v1",
            }
        ],
        "currentDayIndex": 1,
        "completedDayIndexes": [],
    }
    day1_v2_snapshot = deepcopy(day1_v1_snapshot) | {
        "version": 2,
        "markdown": "# Day 1 v2\n\n- Shanghai Museum\n- Rest time",
        "completedDayIndexes": [1],
    }
    day1_v2_snapshot["dayPlans"][0]["status"] = "CONFIRMED"
    day1_v2_snapshot["dayPlans"][0]["markdown"] = "# Day 1 v2\n\n- Shanghai Museum\n- Rest time"
    day2_v3_snapshot = deepcopy(day1_v2_snapshot) | {
        "version": 3,
        "currentDayIndex": 2,
        "completedDayIndexes": [1],
    }
    day2_v3_snapshot["dayPlans"].append(
        {
            "dayIndex": 2,
            "date": "2026-06-02",
            "status": "DRAFT",
            "title": "Day 2 v3",
            "markdown": "# Day 2 v3\n\n- Food route",
            "places": [],
            "routes": [],
            "checksum": "day-2-v3",
        }
    )

    request_json = {
        "conversationId": "00000000-0000-0000-0000-000000000014",
        "userId": "00000000-0000-0000-0000-000000000001",
        "planningMode": "REFINE_WITH_SELECTION",
        "planningScope": "DAY_REFINE",
        "targetDayIndex": 1,
        "coreSlots": {
            "city": "Shanghai",
            "travelStartDate": "2026-06-01",
            "travelEndDate": "2026-06-03",
            "peopleCount": 2,
        },
        "userMessage": "Rollback to the first Day 1 version, keep the museum, remove the night market.",
        "interaction": {
            "selectedOptionIds": [f"place:{selected_place_id}", "style:relaxed"],
            "rejectedOptionIds": [f"place:{rejected_place_id}"],
            "freeText": "基于旧版 Day 1 重新规划，保留博物馆，删掉夜市。",
        },
        "latestSnapshot": day1_v1_snapshot,
    }

    first_response = client.post("/agent/planner/run", json=request_json)
    second_response = client.post("/agent/planner/run", json=request_json)

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    first_body = first_response.json()
    second_body = second_response.json()
    first_draft = first_body["snapshotDraft"]
    second_draft = second_body["snapshotDraft"]

    assert first_draft["baseVersion"] == 1
    assert first_draft["proposedVersion"] == 2
    assert first_draft["targetDayIndex"] == 1
    assert [day_plan["dayIndex"] for day_plan in first_draft["dayPlans"]] == [1]
    assert all(day_plan["title"] != "Day 2 v3" for day_plan in first_draft["dayPlans"])
    assert first_draft["checksum"] == second_draft["checksum"]
    assert first_draft["currentDayPlan"]["checksum"] == second_draft["currentDayPlan"]["checksum"]
    assert any(op["path"] == "/dayPlans/1" for op in first_draft["patchOps"])
    assert any(op["path"] == "/interaction/rejectedPlaceIds" for op in first_draft["patchOps"])
    assert selected_place_id in first_draft["selectedPlaceIds"]
    assert rejected_place_id in first_draft["rejectedPlaceIds"]
    assert any(place["placeId"] == selected_place_id and place["selected"] is True for place in first_body["places"])
    assert all(place["placeId"] != rejected_place_id for place in first_body["places"])
    assert all(
        option.get("placeId") != rejected_place_id
        for group in first_body["recommendationGroups"]
        for option in group["options"]
    )

    day2_request = deepcopy(request_json)
    day2_request["targetDayIndex"] = 2
    day2_request["latestSnapshot"] = day2_v3_snapshot
    day2_response = client.post("/agent/planner/run", json=day2_request)

    assert day2_response.status_code == 200
    day2_draft = day2_response.json()["snapshotDraft"]
    assert day2_draft["baseVersion"] == 3
    assert day2_draft["targetDayIndex"] == 2
    assert day2_draft["checksum"] != first_draft["checksum"]
    assert any(op["path"] == "/dayPlans/2" for op in day2_draft["patchOps"])


def test_run_planner_trip_assemble_returns_final_plan_from_confirmed_days() -> None:
    response = client.post(
        "/agent/planner/run",
        json={
            "conversationId": "00000000-0000-0000-0000-000000000015",
            "userId": "00000000-0000-0000-0000-000000000001",
            "planningScope": "TRIP_ASSEMBLE",
            "coreSlots": {
                "city": "Shanghai",
                "travelStartDate": "2026-06-01",
                "travelEndDate": "2026-06-03",
                "peopleCount": 2,
            },
            "latestSnapshot": {
                "version": 10,
                "markdown": "# Day 3 draft",
                "places": [],
                "routes": [],
                "dayPlans": [
                    {
                        "dayIndex": 1,
                        "date": "2026-06-01",
                        "status": "CONFIRMED",
                        "title": "Day 1",
                        "markdown": "# Day 1\n\n- Walk the Bund.\n- Keep the evening light.",
                        "places": [
                            {
                                "placeId": "11111111-1111-1111-1111-111111111111",
                                "name": "The Bund",
                                "type": "SCENIC",
                                "source": "AI",
                                "description": "River-view walk.",
                            }
                        ],
                        "routes": [
                            {
                                "summary": "The Bund walking route.",
                                "transportMode": "walk",
                                "estimatedMinutes": 45,
                            }
                        ],
                        "checksum": "day-1",
                    },
                    {
                        "dayIndex": 2,
                        "date": "2026-06-02",
                        "status": "CONFIRMED",
                        "title": "Day 2",
                        "markdown": "# Day 2\n\n- Museum and relaxed lunch.",
                        "places": [
                            {
                                "placeId": "22222222-2222-2222-2222-222222222222",
                                "name": "Shanghai Museum",
                                "type": "SCENIC",
                                "source": "AI",
                            }
                        ],
                        "routes": [],
                        "checksum": "day-2",
                    },
                    {
                        "dayIndex": 3,
                        "date": "2026-06-03",
                        "status": "CONFIRMED",
                        "title": "Day 3",
                        "markdown": "# Day 3\n\n- Food route and departure buffer.",
                        "places": [
                            {
                                "placeId": "33333333-3333-3333-3333-333333333333",
                                "name": "Local Restaurant",
                                "type": "RESTAURANT",
                                "source": "AI",
                            }
                        ],
                        "routes": [],
                        "checksum": "day-3",
                    },
                ],
                "currentDayIndex": 3,
                "completedDayIndexes": [1, 2, 3],
            },
        },
    )

    assert response.status_code == 200
    body = response.json()
    draft = body["snapshotDraft"]
    assert body["status"] == "SUCCESS"
    assert body["nextAction"] == "COMPLETE"
    assert body["toolCalls"] == []
    assert body["recommendationGroups"] == []
    assert "# Shanghai最终完整行程" in body["markdown"]
    assert "### 第 1 天 (2026-06-01)" in body["markdown"]
    assert "Walk the Bund." in body["markdown"]
    assert "### 第 3 天 (2026-06-03)" in body["markdown"]
    assert "预订、支付和实时库存" in body["markdown"]
    assert [place["name"] for place in body["places"]] == ["The Bund", "Shanghai Museum", "Local Restaurant"]
    assert body["places"][0]["dayIndexes"] == [1]
    assert body["routes"][0]["dayIndex"] == 1
    assert draft["baseVersion"] == 10
    assert draft["proposedVersion"] == 11
    assert draft["scope"] == "TRIP_ASSEMBLE"
    assert draft["targetDayIndex"] is None
    assert draft["currentDayPlan"] is None
    assert [day_plan["dayIndex"] for day_plan in draft["dayPlans"]] == [1, 2, 3]
    assert any(op["path"] == "/markdown" for op in draft["patchOps"])


def test_run_planner_trip_assemble_blocks_until_all_days_confirmed() -> None:
    response = client.post(
        "/agent/planner/run",
        json={
            "conversationId": "00000000-0000-0000-0000-000000000016",
            "userId": "00000000-0000-0000-0000-000000000001",
            "planningScope": "TRIP_ASSEMBLE",
            "coreSlots": {
                "city": "Shanghai",
                "travelStartDate": "2026-06-01",
                "travelEndDate": "2026-06-03",
                "peopleCount": 2,
            },
            "latestSnapshot": {
                "version": 11,
                "markdown": "# Partial plan",
                "places": [],
                "routes": [],
                "dayPlans": [
                    {
                        "dayIndex": 1,
                        "date": "2026-06-01",
                        "status": "CONFIRMED",
                        "title": "Day 1",
                        "markdown": "# Day 1\n\nConfirmed.",
                        "places": [],
                        "routes": [],
                    },
                    {
                        "dayIndex": 2,
                        "date": "2026-06-02",
                        "status": "DRAFT",
                        "title": "Day 2",
                        "markdown": "# Day 2\n\nStill draft.",
                        "places": [],
                        "routes": [],
                    },
                ],
                "completedDayIndexes": [1],
            },
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "PARTIAL_SUCCESS"
    assert body["nextAction"] == "ASK_USER_SELECTION"
    assert body["snapshotDraft"] is None
    assert body["toolCalls"] == []
    assert body["warnings"][0]["code"] == "TRIP_ASSEMBLY_NOT_READY"
    assert "第 2 天、第 3 天" in body["markdown"]
    assert "第 2 天" in body["nextQuestion"]


def test_run_planner_applies_selected_and_rejected_places_from_snapshot() -> None:
    selected_place_id = "11111111-1111-1111-1111-111111111111"
    rejected_place_id = "22222222-2222-2222-2222-222222222222"

    response = client.post(
        "/agent/planner/run",
        json={
            "conversationId": "00000000-0000-0000-0000-000000000012",
            "userId": "00000000-0000-0000-0000-000000000001",
            "planningMode": "REFINE_WITH_SELECTION",
            "coreSlots": {
                "city": "Shanghai",
                "travelStartDate": "2026-06-01",
                "travelEndDate": "2026-06-03",
                "peopleCount": 2,
            },
            "userMessage": "Keep the museum, remove the night market, and make the route less tiring.",
            "interaction": {
                "selectedOptionIds": [f"place:{selected_place_id}", "style:relaxed"],
                "rejectedOptionIds": [f"place:{rejected_place_id}"],
                "freeText": "少走路，下午安排休息。",
            },
            "latestSnapshot": {
                "version": 5,
                "markdown": "# Existing Shanghai plan\n\n- Shanghai Museum\n- Night Market",
                "places": [
                    {
                        "placeId": selected_place_id,
                        "name": "Shanghai Museum",
                        "type": "SCENIC",
                        "source": "AI",
                        "description": "Selected cultural stop from the previous snapshot.",
                    },
                    {
                        "placeId": rejected_place_id,
                        "name": "Night Market",
                        "type": "RESTAURANT",
                        "source": "AI",
                        "description": "Rejected stop from the previous snapshot.",
                    },
                ],
                "routes": [],
            },
        },
    )

    assert response.status_code == 200
    body = response.json()
    place_names = [place["name"] for place in body["places"]]
    assert "Shanghai Museum" in place_names
    assert "Night Market" not in place_names
    assert any(place["placeId"] == selected_place_id and place["selected"] is True for place in body["places"])
    assert body["snapshotDraft"]["baseVersion"] == 5
    assert body["snapshotDraft"]["proposedVersion"] == 6
    assert selected_place_id in body["snapshotDraft"]["selectedPlaceIds"]
    assert rejected_place_id in body["snapshotDraft"]["rejectedPlaceIds"]
    assert "已保留用户选择的地点约束" in body["snapshotDraft"]["changeSummary"]
    assert "已移除用户拒绝的地点约束" in body["snapshotDraft"]["changeSummary"]
    assert any(op["path"] == "/interaction/selectedPlaceIds" for op in body["snapshotDraft"]["patchOps"])
    assert any(op["path"] == "/interaction/rejectedPlaceIds" for op in body["snapshotDraft"]["patchOps"])
    assert any(op["path"] == "/interaction/freeText" for op in body["snapshotDraft"]["patchOps"])
    assert "用户补充要求：少走路，下午安排休息。" in body["markdown"]
    assert all(
        option.get("placeId") != rejected_place_id
        for group in body["recommendationGroups"]
        for option in group["options"]
    )


def test_run_planner_reports_missing_required_slots() -> None:
    response = client.post(
        "/agent/planner/run",
        json={
            "conversationId": "00000000-0000-0000-0000-000000000010",
            "userId": "00000000-0000-0000-0000-000000000001",
            "coreSlots": {
                "city": "Shanghai",
                "peopleCount": 2,
            },
            "userMessage": "Plan a trip.",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "PARTIAL_SUCCESS"
    assert body["traceId"]
    assert body["userFacingEvents"]
    assert body["warnings"][0]["code"] == "MISSING_REQUIRED_SLOTS"
    assert "出行开始日期" in body["nextQuestion"]
