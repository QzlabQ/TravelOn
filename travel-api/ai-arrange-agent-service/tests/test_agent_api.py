from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health_returns_configuration_flags() -> None:
    response = client.get("/agent/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "UP"
    assert body["service"] == "ai-arrange-agent-service"
    assert "deepseekConfigured" in body
    assert "amapConfigured" in body


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
    assert isinstance(body["userFacingEvents"], list)
    assert body["userFacingEvents"]
    assert any(call["tool"] == "deepseek_chat_completion" for call in body["toolCalls"])
    assert any(call["tool"] == "search_hotels" for call in body["toolCalls"])
    assert any(call["tool"] == "get_weather" for call in body["toolCalls"])
    assert any(call["tool"] == "search_flights" for call in body["toolCalls"])
    assert any(call["tool"] == "estimate_budget" for call in body["toolCalls"])
    assert "Budget estimate" in body["markdown"]
    assert any(place["type"] != "HOTEL" for place in body["places"])


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
    assert "travelStartDate" in body["nextQuestion"]
