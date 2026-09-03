from __future__ import annotations

import json
import os
import uuid
from datetime import date, timedelta

import pytest
from websockets.sync.client import connect

from conftest import ApiClient


pytestmark = pytest.mark.integration


def test_planner_websocket_refresh_is_saved(api_client: ApiClient) -> None:
    user_id = str(uuid.uuid4())
    start = date.today() + timedelta(days=80)
    conversation = api_client.request(
        "WS-CREATE", "POST", "/ai-arrange/api/conversations", timeout=90,
        json_body={
            "userId": user_id,
            "coreSlots": {
                "city": "Shanghai", "travelStartDate": start.isoformat(),
                "travelEndDate": (start + timedelta(days=2)).isoformat(), "peopleCount": 2,
            },
        },
    ).data
    conversation_id = conversation["id"]
    gateway = os.getenv("TRAVEL_TEST_GATEWAY_URL", "http://localhost:58082").rstrip("/")
    ws_url = gateway.replace("https://", "wss://").replace("http://", "ws://")
    ws_url += f"/ai-arrange/ws/planner?conversationId={conversation_id}&userId={user_id}"
    refresh = None
    with connect(ws_url, open_timeout=90, close_timeout=10) as websocket:
        websocket.send(json.dumps({
            "type": "PLANNER_CHAT_SEND", "conversationId": conversation_id, "userId": user_id,
            "payload": {
                "message": "Create a relaxed three-day Shanghai plan with attractions and one local meal.",
                "selectedPlaceIds": [],
            },
        }))
        for _ in range(30):
            message = json.loads(websocket.recv(timeout=120))
            if message.get("type") == "PLANNER_ERROR":
                pytest.fail(f"Planner error: {message.get('payload')}")
            if message.get("type") == "PLANNER_DATA_REFRESH":
                refresh = message
                break
    assert refresh is not None
    snapshots = api_client.request(
        "WS-SNAPSHOTS", "GET",
        f"/ai-arrange/api/conversations/{conversation_id}/snapshots?userId={user_id}",
    ).data
    assert snapshots
