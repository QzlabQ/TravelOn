from __future__ import annotations

import os
import subprocess
import time
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import httpx
import pytest

from conftest import ApiClient


pytestmark = pytest.mark.integration
API_ROOT = Path(__file__).resolve().parents[2]
COMPOSE_FILE = API_ROOT / "docker-compose.yml"


def compose(*arguments: str) -> str:
    completed = subprocess.run(
        ["docker", "compose", "-f", str(COMPOSE_FILE), *arguments],
        cwd=API_ROOT, text=True, capture_output=True, check=False,
    )
    assert completed.returncode == 0, completed.stdout + completed.stderr
    return completed.stdout.strip()


def postgres_scalar(database: str, query: str) -> int:
    output = compose(
        "exec", "-T", "postgres", "psql", "-U", os.getenv("POSTGRES_USER", "admin"),
        "-d", database, "-tAc", query,
    )
    return int(output.strip())


def wait_until(description: str, timeout: float, condition) -> None:
    deadline = time.monotonic() + timeout
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            if condition():
                return
        except Exception as exc:  # noqa: BLE001
            last_error = exc
        time.sleep(2)
    raise AssertionError(f"Timed out waiting for {description}: {last_error or 'condition remained false'}")


def hotel_context(api_client: ApiClient, registered_user: dict, offset: int = 65) -> dict:
    start = date.today() + timedelta(days=offset)
    end = start + timedelta(days=2)
    destinations = api_client.request("REMEDIATION-DEST", "GET", "/hotels/destinations").data
    destination = next((item for item in destinations if item.get("cityId") == "C005"), destinations[0])
    hotel = api_client.request(
        "REMEDIATION-SEARCH", "GET",
        f"/hotels/search?destinationId={destination['idLocation']}&dateFrom={start}&dateTo={end}&adults=2&sortBy=price",
    ).data[0]
    details = api_client.request(
        "REMEDIATION-DETAIL", "GET", f"/hotels/{hotel['hotelId']}?dateFrom={start}&dateTo={end}&adults=2"
    ).data
    configuration = details["roomsConfigurations"][0]
    return {
        "token": registered_user["token"], "user_id": registered_user["user"]["id"],
        "start": start.isoformat(), "end": end.isoformat(), "hotel": hotel,
        "price": configuration["pricePerAdult"],
        "room_ids": [room["roomId"] for room in configuration["rooms"]],
    }


def reservation_payload(context: dict, room_ids: list[int] | None = None, include_rooms: bool = True) -> dict:
    payload = {
        "userId": context["user_id"], "hotelId": context["hotel"]["hotelId"],
        "hotelName": context["hotel"]["name"], "dateFrom": context["start"], "dateTo": context["end"],
        "adultsQuantity": 2, "childrenUnder3Quantity": 0, "childrenUnder10Quantity": 0,
        "childrenUnder18Quantity": 0, "price": context["price"], "roomName": "integration room",
        "travelers": [],
    }
    if include_rooms:
        payload["roomIds"] = context["room_ids"] if room_ids is None else room_ids
    return payload


def cleanup_hotel_reservation(api_client: ApiClient, token: str, reservation_id: str) -> None:
    reservation_exists = postgres_scalar(
        "reservation_db", f"select count(*) from reservation where id = '{reservation_id}';"
    ) > 0
    if reservation_exists:
        # Wait for the asynchronous create projection before publishing its delete,
        # otherwise messages on the two fanout queues can race and leave inventory behind.
        try:
            wait_until(
                "hotel reservation projection before cleanup", 15,
                lambda: postgres_scalar(
                    "travel_core_db",
                    f"select count(*) from room_reservation where main_reservation_id = '{reservation_id}';",
                ) > 0,
            )
        except AssertionError:
            pass
        api_client.request(
            "INT-HOTEL-CLEANUP", "POST", f"/reservations/{reservation_id}/cancel",
            expected=(200, 404), token=token,
            json_body={"reason": "Integration test cleanup"},
        )
    wait_until(
        "hotel inventory cleanup", 30,
        lambda: postgres_scalar(
            "travel_core_db",
            f"select count(*) from room_reservation where main_reservation_id = '{reservation_id}';",
        ) == 0,
    )


def test_invalid_room_ids_are_rejected_before_publish(api_client: ApiClient, registered_user: dict) -> None:
    context = hotel_context(api_client, registered_user)
    api_client.request(
        "INT-HOTEL-MISSING-ROOMS", "POST", "/reservations/hotels", expected=400,
        token=context["token"], json_body=reservation_payload(context, include_rooms=False),
    )
    api_client.request(
        "INT-HOTEL-INVALID-ROOM", "POST", "/reservations/hotels", expected=400,
        token=context["token"], json_body=reservation_payload(context, room_ids=[999999999]),
    )
    queues = compose("exec", "-T", "rabbitmq", "rabbitmqctl", "list_queues", "name", "messages")
    assert "reservation" in queues.lower()


@pytest.mark.resilience
def test_real_hotel_reservation_is_projected_and_timeout_rolls_back(
    api_client: ApiClient, registered_user: dict
) -> None:
    context = hotel_context(api_client, registered_user, offset=70)
    reservation_id = None
    try:
        created = api_client.request(
            "INT-HOTEL-CREATE", "POST", "/reservations/hotels",
            token=context["token"], json_body=reservation_payload(context),
        ).data
        reservation_id = created["id"]
        deadline = datetime.fromisoformat(created["paymentDeadline"].replace("Z", "+00:00"))
        remaining = (deadline - datetime.now(timezone.utc)).total_seconds()
        configured_timeout = int(os.getenv("TRAVEL_TEST_PAYMENT_TIMEOUT_SECONDS", "10"))
        if remaining > configured_timeout + 20:
            message = (
                "支付超时测试要求以 APP_PAYMENT_TIMEOUT_SECONDS="
                f"{configured_timeout} 启动服务；当前截止时间仍有 {remaining:.0f} 秒。"
            )
            # 运行器重建过 order 服务时会设置这个标志，此时前置条件不满足说明重建
            # 没有真正生效，必须报错——否则这条用例会年复一年地静默跳过。
            if os.getenv("TRAVEL_TEST_EXPECT_SHORT_PAYMENT_TIMEOUT") == "1":
                raise AssertionError(message + " 运行器已声明应用短超时，配置未生效。")
            pytest.skip(message + " 本次运行未应用短超时，超时补偿未被验证。")

        wait_until(
            "travel-core room reservation projection", configured_timeout,
            lambda: postgres_scalar(
                "travel_core_db", f"select count(*) from room_reservation where main_reservation_id = '{reservation_id}';"
            ) == len(context["room_ids"]),
        )
        wait_until(
            "payment timeout rollback", configured_timeout + 45,
            lambda: postgres_scalar(
                "reservation_db", f"select count(*) from reservation where id = '{reservation_id}';"
            ) == 0 and postgres_scalar(
                "travel_core_db", f"select count(*) from room_reservation where main_reservation_id = '{reservation_id}';"
            ) == 0,
        )
    finally:
        if reservation_id is not None:
            cleanup_hotel_reservation(api_client, context["token"], reservation_id)


@pytest.mark.resilience
def test_community_restart_deregisters_and_recovers(api_client: ApiClient) -> None:
    api_client.request("INT-COM-BEFORE", "GET", "/community/posts")
    compose("stop", "community")
    try:
        wait_until(
            "community endpoint to become unavailable", 45,
            lambda: httpx.get(f"{api_client.base_url}/community/posts", timeout=10).status_code != 200,
        )
        eureka_url = os.getenv("TRAVEL_TEST_EUREKA_URL", "http://localhost:58010").rstrip("/")

        def instance_count() -> int:
            response = httpx.get(
                f"{eureka_url}/eureka/apps/COMMUNITY-SERVICE",
                headers={"Accept": "application/json"}, timeout=10,
            )
            if response.status_code == 404:
                return 0
            response.raise_for_status()
            instances = response.json().get("application", {}).get("instance", [])
            return len(instances if isinstance(instances, list) else [instances])

        wait_until("community Eureka deregistration", 60, lambda: instance_count() == 0)
    finally:
        compose("start", "community")
    wait_until(
        "community Gateway recovery", 180,
        lambda: httpx.get(f"{api_client.base_url}/community/posts", timeout=10).status_code == 200,
    )
    wait_until("one community Eureka instance", 180, lambda: instance_count() == 1)
    for index in range(5):
        api_client.request(f"INT-COM-RECOVERY-{index}", "GET", "/community/posts")


@pytest.mark.external
def test_real_model_response_is_persisted(api_client: ApiClient) -> None:
    user_id = str(uuid.uuid4())
    travel_day = (date.today() + timedelta(days=75)).isoformat()
    conversation = api_client.request(
        "INT-AI-CREATE", "POST", "/ai-arrange/api/conversations", timeout=90,
        json_body={
            "userId": user_id,
            "coreSlots": {
                "city": "Shanghai", "departureCity": "Beijing", "travelStartDate": travel_day,
                "travelEndDate": travel_day, "peopleCount": 2, "budget": "moderate", "travelStyle": "relaxed",
            },
        },
    ).data
    conversation_id = conversation["id"]
    snapshot = api_client.request(
        "INT-AI-RUN", "POST", f"/ai-arrange/api/conversations/{conversation_id}/planner/run", timeout=300,
        json_body={
            "userId": user_id,
            "message": "Create a concise one-day Shanghai itinerary with two attractions, one local meal, transit advice, and backup plans.",
            "planningMode": "INITIAL_PLAN", "planningScope": "DAY_PLAN", "modelVariant": "FLASH",
            "targetDayIndex": 1, "targetDate": travel_day, "selectedPlaceIds": [],
        },
    ).data
    trace_id = snapshot["traceId"]
    # 工具名随「只支持 DeepSeek → OpenAI 兼容」的改造从 deepseek_chat_completion 改成了
    # model_chat_completion，这里的过滤条件当时没跟着改，永远匹配不到；因为用例带 external
    # 标记、只在 test:full 里跑，一直没暴露。
    model_calls = [call for call in snapshot["agentToolCalls"] if call["tool"] == "model_chat_completion"]
    assert model_calls, (
        "快照里没有 model_chat_completion 调用记录；"
        f"实际出现的工具：{sorted({call['tool'] for call in snapshot['agentToolCalls']})}"
    )
    assert model_calls[0]["status"] in {"SUCCESS", "PARTIAL_SUCCESS"}
    snapshots = api_client.request(
        "INT-AI-SNAPSHOTS", "GET",
        f"/ai-arrange/api/conversations/{conversation_id}/snapshots?userId={user_id}",
    ).data
    assert trace_id in {item["traceId"] for item in snapshots}
    mongo_count = compose(
        "exec", "-T", "mongo", "mongosh", "--quiet", "--eval",
        f"db.getSiblingDB('ai-arrange-db').planner_snapshots.countDocuments({{traceId: '{trace_id}'}})",
    )
    assert int(mongo_count) >= 1
