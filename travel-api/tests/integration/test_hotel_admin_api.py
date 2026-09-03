"""酒店后台写接口。

`/hotels/admin` 下的 6 个写接口此前没有任何 API 测试：既没验证管理员能改，也没验证
普通用户和未登录会被拒。鉴权逻辑见 AdminAuthorizationService.requireAdmin。
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from conftest import ApiClient


pytestmark = pytest.mark.integration

# 与种子数据里的酒店 id 拉开距离，避免和真实数据撞号。
TEST_HOTEL_ID = 99001


def hotel_payload(hotel_id: int, location_id: str, name: str, room: dict | None = None) -> dict:
    return {
        "hotelId": hotel_id,
        "name": name,
        "rating": 4.5,
        "description": "由 API 集成测试创建的酒店。",
        "location": {"idLocation": location_id},
        "photos": [],
        "rooms": [room] if room else [],
    }


def room_payload(hotel_id: int, room_id: int, name: str) -> dict:
    return {
        "roomId": room_id,
        "hotelId": hotel_id,
        "name": name,
        "guestCapacity": 2,
        "roomType": "STANDARD",
        "pricePerAdult": 288.00,
        "description": "测试房型",
    }


@pytest.fixture
def location_id(api_client: ApiClient) -> str:
    destinations = api_client.request("API-HOTEL-ADMIN-DEST", "GET", "/hotels/destinations").data
    assert destinations, "没有可用目的地，酒店后台用例无法构造数据"
    return destinations[0]["idLocation"]


def test_admin_endpoints_reject_non_admins(
    api_client: ApiClient, registered_user: dict, location_id: str, unique_id: str
) -> None:
    token = registered_user["token"]
    body = hotel_payload(TEST_HOTEL_ID, location_id, f"越权测试 {unique_id}")

    api_client.request("API-HOTEL-ADMIN-CREATE-ANON", "POST", "/hotels/admin", expected=401, json_body=body)
    api_client.request(
        "API-HOTEL-ADMIN-CREATE-USER", "POST", "/hotels/admin", expected=403, token=token, json_body=body
    )
    api_client.request(
        "API-HOTEL-ADMIN-UPDATE-USER", "PUT", f"/hotels/admin/{TEST_HOTEL_ID}",
        expected=403, token=token, json_body=body,
    )
    api_client.request(
        "API-HOTEL-ADMIN-DELETE-USER", "DELETE", f"/hotels/admin/{TEST_HOTEL_ID}", expected=403, token=token
    )
    api_client.request(
        "API-HOTEL-ADMIN-ROOM-CREATE-USER", "POST", f"/hotels/admin/{TEST_HOTEL_ID}/rooms",
        expected=403, token=token, json_body=room_payload(TEST_HOTEL_ID, 990011, "越权房型"),
    )
    api_client.request(
        "API-HOTEL-ADMIN-ROOM-UPDATE-USER", "PUT", f"/hotels/admin/{TEST_HOTEL_ID}/rooms/990011",
        expected=403, token=token, json_body=room_payload(TEST_HOTEL_ID, 990011, "越权房型"),
    )
    api_client.request(
        "API-HOTEL-ADMIN-ROOM-DELETE-USER", "DELETE", "/hotels/admin/rooms/990011", expected=403, token=token
    )


def test_admin_hotel_and_room_crud(
    api_client: ApiClient, admin_token: str, location_id: str, unique_id: str
) -> None:
    hotel_id = TEST_HOTEL_ID
    room_id = 990011
    name = f"后台测试酒店 {unique_id}"
    api_client.request(
        "API-HOTEL-ADMIN-CREATE", "POST", "/hotels/admin", expected=201, token=admin_token,
        json_body=hotel_payload(hotel_id, location_id, name, room_payload(hotel_id, room_id, "初始房型")),
    )
    try:
        start = (date.today() + timedelta(days=200)).isoformat()
        end = (date.today() + timedelta(days=202)).isoformat()
        created = api_client.request(
            "API-HOTEL-ADMIN-READ", "GET", f"/hotels/{hotel_id}?dateFrom={start}&dateTo={end}&adults=1"
        ).data
        assert created["hotelName"] == name
        room_names = {
            room["name"]
            for configuration in created["roomsConfigurations"]
            for room in configuration["rooms"]
        }
        assert "初始房型" in room_names

        api_client.request(
            "API-HOTEL-ADMIN-UPDATE", "PUT", f"/hotels/admin/{hotel_id}", token=admin_token,
            json_body=hotel_payload(hotel_id, location_id, f"{name} 已更新"),
        )
        updated = api_client.request(
            "API-HOTEL-ADMIN-READ-UPDATED", "GET",
            f"/hotels/{hotel_id}?dateFrom={start}&dateTo={end}&adults=1",
        ).data
        assert updated["hotelName"] == f"{name} 已更新"

        api_client.request(
            "API-HOTEL-ADMIN-ROOM-UPDATE", "PUT", f"/hotels/admin/{hotel_id}/rooms/{room_id}",
            token=admin_token, json_body=room_payload(hotel_id, room_id, "改名后的房型"),
        )
        api_client.request(
            "API-HOTEL-ADMIN-ROOM-CREATE", "POST", f"/hotels/admin/{hotel_id}/rooms", expected=201,
            token=admin_token, json_body=room_payload(hotel_id, room_id + 1, "新增房型"),
        )
        after = api_client.request(
            "API-HOTEL-ADMIN-READ-2", "GET", f"/hotels/{hotel_id}?dateFrom={start}&dateTo={end}&adults=1"
        ).data
        names = {
            room["name"]
            for configuration in after["roomsConfigurations"]
            for room in configuration["rooms"]
        }
        assert {"改名后的房型", "新增房型"} <= names

        api_client.request(
            "API-HOTEL-ADMIN-ROOM-DELETE", "DELETE", f"/hotels/admin/rooms/{room_id + 1}",
            expected=204, token=admin_token,
        )
        remaining = api_client.request(
            "API-HOTEL-ADMIN-READ-3", "GET", f"/hotels/{hotel_id}?dateFrom={start}&dateTo={end}&adults=1"
        ).data
        assert "新增房型" not in {
            room["name"]
            for configuration in remaining["roomsConfigurations"]
            for room in configuration["rooms"]
        }
    finally:
        api_client.request(
            "API-HOTEL-ADMIN-DELETE", "DELETE", f"/hotels/admin/{hotel_id}",
            expected=(204, 404), token=admin_token,
        )
