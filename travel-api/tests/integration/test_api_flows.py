from __future__ import annotations

import time
from datetime import date, timedelta
from urllib.parse import quote

import pytest

from conftest import ApiClient


pytestmark = pytest.mark.integration


def future_dates(offset: int = 40) -> tuple[str, str]:
    start = date.today() + timedelta(days=offset)
    return start.isoformat(), (start + timedelta(days=2)).isoformat()


# 票务种子数据只覆盖以生成日为基准的滚动窗口（见 scripts/generate_dated_ticket_offers.py），
# 落在窗口外的日期查询必然为空，断言就会变得毫无意义。酒店没有这个限制。
TICKET_OFFSET_DAYS = 14


def auth(user: dict) -> str:
    return user["token"]


def wait_for_room_release(
    api_client: ApiClient,
    hotel_id: int,
    room_id: int,
    date_from: str,
    date_to: str,
    timeout: float = 30,
) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        details = api_client.request(
            "API-ORDER-CLEANUP-ROOMS",
            "GET",
            f"/hotels/{hotel_id}?dateFrom={date_from}&dateTo={date_to}&adults=1",
        ).data
        available_ids = {
            room["roomId"]
            for configuration in details["roomsConfigurations"]
            for room in configuration["rooms"]
        }
        if room_id in available_ids:
            return
        time.sleep(1)
    raise AssertionError(f"Room {room_id} was not released after cancelling the test reservation")


def test_gateway_exposes_hotel_and_transport_catalogs(api_client: ApiClient) -> None:
    destinations = api_client.request("INT-001", "GET", "/hotels/destinations").data
    assert destinations
    available = api_client.request("INT-002", "GET", "/transports/available").data
    assert available["departures"] is not None
    assert available["arrivals"] is not None
    transports = api_client.request("INT-003", "GET", "/transports/").data
    assert isinstance(transports, list)


def test_registration_login_and_current_user(api_client: ApiClient, registered_user: dict) -> None:
    user = registered_user["user"]
    login = api_client.request(
        "API-USER-002", "POST", "/users/auth/login",
        json_body={"email": user["email"], "password": registered_user["password"]},
    ).data
    assert login["token"]
    current = api_client.request("API-USER-003", "GET", "/users/me", token=login["token"]).data
    assert current["id"] == user["id"]


def test_authentication_validation_errors(api_client: ApiClient, registered_user: dict) -> None:
    email = registered_user["user"]["email"]
    api_client.request(
        "API-USER-004", "POST", "/users/auth/login", expected=401,
        json_body={"email": email, "password": "wrong-password"},
    )
    api_client.request("API-USER-005", "GET", "/users/me", expected=400)
    api_client.request(
        "API-USER-006", "POST", "/users/auth/register", expected=400,
        json_body={"email": "invalid-email", "password": "123", "name": ""},
    )


def test_traveler_create_list_and_delete(api_client: ApiClient, registered_user: dict, unique_id: str) -> None:
    token = auth(registered_user)
    created = api_client.request(
        "API-USER-007", "POST", "/users/me/travelers", expected=201, token=token,
        json_body={
            "name": "Integration Traveler", "travelerType": "ADULT", "documentType": "PASSPORT",
            "documentNumber": f"TEST-{unique_id}", "phone": "13800138000", "defaultTraveler": True,
        },
    ).data
    travelers = api_client.request("API-USER-007-LIST", "GET", "/users/me/travelers", token=token).data
    assert created["id"] in {item["id"] for item in travelers}
    api_client.request("API-USER-008", "DELETE", f"/users/me/travelers/{created['id']}", expected=204, token=token)


def test_hotel_search_details_and_validation(api_client: ApiClient) -> None:
    start, end = future_dates()
    destinations = api_client.request("API-HOTEL-DEST", "GET", "/hotels/destinations").data
    destination = next((item for item in destinations if item.get("cityId") == "C005"), destinations[0])
    offers = api_client.request(
        "API-HOTEL-001", "GET",
        f"/hotels/search?destinationId={destination['idLocation']}&dateFrom={start}&dateTo={end}&adults=2&sortBy=price",
    ).data
    assert offers
    details = api_client.request(
        "API-HOTEL-004", "GET",
        f"/hotels/{offers[0]['hotelId']}?dateFrom={start}&dateTo={end}&adults=2",
    ).data
    assert details["roomsConfigurations"]
    rated = api_client.request(
        "API-HOTEL-002", "GET",
        f"/hotels/search?destinationId={destination['idLocation']}&dateFrom={start}&dateTo={end}&adults=2&minRating=4.5&sortBy=rating",
    ).data
    assert isinstance(rated, list)
    api_client.request(
        "API-HOTEL-003", "GET", f"/hotels/search?dateFrom={start}&dateTo={end}&adults=2", expected=400
    )


@pytest.mark.parametrize("transport_type", ["TRAIN", "FLIGHT"])
def test_transport_options_and_search(api_client: ApiClient, transport_type: str) -> None:
    start, _ = future_dates(TICKET_OFFSET_DAYS)
    options = api_client.request(
        f"API-TRANS-{transport_type}-OPTIONS", "GET", f"/transports/tickets/options?type={transport_type}"
    ).data
    assert options["departures"] and options["arrivals"]
    # 城市名必须用目录里真实存在的中文名：cities.csv 没有英文别名，传 "Beijing"
    # 不会报错，只会解析成一个不存在的 cityId 并静默返回空列表。
    departure, arrival = "北京市", "上海市"
    assert departure in options["departures"]
    response = api_client.request(
        f"API-TRANS-{transport_type}-SEARCH", "GET",
        f"/transports/tickets?type={transport_type}&departureCity={quote(departure)}"
        f"&arrivalCity={quote(arrival)}&departureDate={start}",
    ).data
    assert response, (
        f"{start} 没有 {departure} → {arrival} 的 {transport_type} 班次。"
        "票务种子窗口可能已过期，先运行 travel-api/scripts/generate_dated_ticket_offers.py。"
    )
    for offer in response:
        assert offer["departureTime"].startswith(start)
        assert offer["code"] and offer["carrier"]


def test_transport_requires_departure_date(api_client: ApiClient) -> None:
    api_client.request(
        "API-TRANS-005", "GET",
        "/transports/tickets?type=TRAIN&departureCity=Beijing&arrivalCity=Shanghai", expected=400,
    )


def test_community_post_lifecycle(api_client: ApiClient, registered_user: dict, unique_id: str) -> None:
    token = auth(registered_user)
    page = api_client.request("API-COM-001", "GET", "/community/posts").data
    assert "content" in page
    api_client.request(
        "API-COM-005", "POST", "/community/posts", expected=400,
        json_body={"title": "", "content": "", "category": "TRAVEL_NOTE"},
    )
    created = api_client.request(
        "API-COM-002", "POST", "/community/posts", expected=201, token=token,
        json_body={
            "title": f"Integration test post {unique_id}",
            "content": "Created by pytest integration test.",
            "contentFormat": "PLAIN_TEXT", "category": "TRAVEL_NOTE", "destinationCityId": "C005", "imageUrls": [],
        },
    ).data
    post_id = created["id"]
    try:
        api_client.request("API-COM-003", "GET", f"/community/posts/{post_id}", token=token)
        api_client.request("API-COM-004", "POST", f"/community/posts/{post_id}/likes", token=token)
    finally:
        api_client.request("API-COM-006", "DELETE", f"/community/posts/{post_id}", expected=204, token=token)


def test_hotel_order_payment_history_and_duplicate_payment(
    api_client: ApiClient, registered_user: dict, unique_id: str
) -> None:
    token = auth(registered_user)
    user_id = registered_user["user"]["id"]
    start, end = future_dates(50)
    destinations = api_client.request("API-ORDER-DEST", "GET", "/hotels/destinations").data
    destination = next((item for item in destinations if item.get("cityId") == "C005"), destinations[0])
    hotel = api_client.request(
        "API-ORDER-HOTEL", "GET",
        f"/hotels/search?destinationId={destination['idLocation']}&dateFrom={start}&dateTo={end}&adults=1&sortBy=price",
    ).data[0]
    details = api_client.request(
        "API-ORDER-ROOMS", "GET", f"/hotels/{hotel['hotelId']}?dateFrom={start}&dateTo={end}&adults=1"
    ).data
    room_ids = [room["roomId"] for room in details["roomsConfigurations"][0]["rooms"]]
    traveler = {
        "name": "Integration Traveler", "travelerType": "ADULT", "documentType": "PASSPORT",
        "documentNumber": f"PAY-{unique_id}", "phone": "13800138000",
    }
    body = {
        "userId": user_id, "hotelId": hotel["hotelId"], "hotelName": hotel["name"],
        "dateFrom": start, "dateTo": end, "adultsQuantity": 1,
        "childrenUnder3Quantity": 0, "childrenUnder10Quantity": 0, "childrenUnder18Quantity": 0,
        "price": hotel["pricePerAdult"], "roomName": "Integration Test Room",
        "travelers": [traveler], "roomIds": room_ids,
    }
    reservation_id = None
    try:
        reservation = api_client.request(
            "API-ORDER-001", "POST", "/reservations/hotels", token=token, json_body=body
        ).data
        reservation_id = reservation["id"]
        api_client.request("API-ORDER-002", "GET", f"/reservations/{reservation_id}", token=token)
        api_client.request(
            "API-ORDER-003", "POST", "/reservations/purchase", expected=400, token=token,
            json_body={"reservationId": reservation_id, "cardNumber": "6200000000000000"},
        )
        api_client.request(
            "API-ORDER-004", "POST", "/reservations/purchase", token=token,
            json_body={"reservationId": reservation_id, "cardNumber": "6222021234567894"},
        )
        history = api_client.request(
            "API-ORDER-005", "GET", f"/reservations/{reservation_id}/payments", token=token
        ).data
        assert len(history) >= 2
        api_client.request(
            "API-ORDER-006", "POST", "/reservations/purchase", expected=200, token=token,
            json_body={"reservationId": reservation_id, "cardNumber": "6222021234567894"},
        )
    finally:
        if reservation_id is not None:
            api_client.request(
                "API-ORDER-CLEANUP", "POST", f"/reservations/{reservation_id}/cancel",
                expected=(200, 404), token=token,
                json_body={"reason": "Integration test cleanup"},
            )
            wait_for_room_release(
                api_client, hotel["hotelId"], room_ids[0], start, end,
            )


def test_legacy_package_endpoint_returns_rebuild_notice(api_client: ApiClient) -> None:
    """旧版套餐入口只保留兼容外壳，必须继续返回重建提示而不是真的建单。"""
    start, end = future_dates(60)
    response = api_client.request(
        "API-ORDER-LEGACY", "POST", "/reservations/reservation",
        json_body={
            "hotelTimeFrom": f"{start}T14:00:00", "hotelTimeTo": f"{end}T12:00:00",
            "adultsQuantity": 1, "childrenUnder3Quantity": 0, "childrenUnder10Quantity": 0,
            "childrenUnder18Quantity": 0, "price": 100, "hotelId": 1,
            "roomReservationsIds": [], "transportReservationsIds": [],
            "hotelName": "Legacy", "roomReservationsNames": [], "transportType": "PLANE",
        },
    )
    assert "rebuilt" in response.text


def test_refund_completion_requires_admin(
    api_client: ApiClient, registered_user: dict, admin_token: str
) -> None:
    """退款完成是财务动作，只有管理员能触发。"""
    token = registered_user["token"]
    start, end = future_dates(75)
    destinations = api_client.request("API-REFUND-DEST", "GET", "/hotels/destinations").data
    hotel = api_client.request(
        "API-REFUND-SEARCH", "GET",
        f"/hotels/search?destinationId={destinations[0]['idLocation']}&dateFrom={start}&dateTo={end}&adults=1&sortBy=price",
    ).data[0]
    details = api_client.request(
        "API-REFUND-DETAIL", "GET", f"/hotels/{hotel['hotelId']}?dateFrom={start}&dateTo={end}&adults=1"
    ).data
    room_ids = [details["roomsConfigurations"][0]["rooms"][0]["roomId"]]
    reservation = api_client.request(
        "API-REFUND-ORDER", "POST", "/reservations/hotels", token=token,
        json_body={
            "userId": registered_user["user"]["id"], "hotelId": hotel["hotelId"], "hotelName": hotel["name"],
            "dateFrom": start, "dateTo": end, "adultsQuantity": 1,
            "childrenUnder3Quantity": 0, "childrenUnder10Quantity": 0, "childrenUnder18Quantity": 0,
            "price": hotel["pricePerAdult"], "roomName": "Refund test room",
            "travelers": [{"name": "Refund Tester", "travelerType": "ADULT"}], "roomIds": room_ids,
        },
    ).data
    reservation_id = reservation["id"]
    try:
        api_client.request(
            "API-REFUND-PAY", "POST", "/reservations/purchase", token=token,
            json_body={"reservationId": reservation_id, "cardNumber": "6222021234567894"},
        )
        api_client.request(
            "API-REFUND-CANCEL", "POST", f"/reservations/{reservation_id}/cancel", token=token,
            json_body={"reason": "Refund completion test"},
        )
        api_client.request(
            "API-REFUND-COMPLETE-USER", "POST", f"/reservations/{reservation_id}/refunds/complete",
            expected=403, token=token,
        )
        api_client.request(
            "API-REFUND-COMPLETE-ANON", "POST", f"/reservations/{reservation_id}/refunds/complete",
            expected=401,
        )
        completed = api_client.request(
            "API-REFUND-COMPLETE-ADMIN", "POST", f"/reservations/{reservation_id}/refunds/complete",
            token=admin_token,
        ).data
        assert completed["status"] == "REFUNDED"
        refunds = api_client.request(
            "API-REFUND-RECORDS", "GET", f"/reservations/{reservation_id}/refunds", token=token
        ).data
        assert refunds and refunds[0]["amount"] > 0
    finally:
        wait_for_room_release(api_client, hotel["hotelId"], room_ids[0], start, end)


def test_booked_room_is_hidden_from_every_overlapping_range(
    api_client: ApiClient, registered_user: dict
) -> None:
    """房态查询按区间重叠判定，任何与已订区间相交的查询都不能再返回该房型。

    RoomRepository 的可用性查询曾经用 `:dateFrom BETWEEN rr.dateFrom AND rr.dateTo`
    这种端点包含式写法，查询区间完全包住已订区间时判不出冲突，会把已售房型当空房返回。
    """
    token = registered_user["token"]
    base = date.today() + timedelta(days=120)
    booked_from, booked_to = base.isoformat(), (base + timedelta(days=2)).isoformat()

    destinations = api_client.request("API-OVERLAP-DEST", "GET", "/hotels/destinations").data
    hotel = api_client.request(
        "API-OVERLAP-SEARCH", "GET",
        f"/hotels/search?destinationId={destinations[0]['idLocation']}&dateFrom={booked_from}&dateTo={booked_to}&adults=1&sortBy=price",
    ).data[0]
    details = api_client.request(
        "API-OVERLAP-DETAIL", "GET",
        f"/hotels/{hotel['hotelId']}?dateFrom={booked_from}&dateTo={booked_to}&adults=1",
    ).data
    room_id = details["roomsConfigurations"][0]["rooms"][0]["roomId"]

    reservation = api_client.request(
        "API-OVERLAP-ORDER", "POST", "/reservations/hotels", token=token,
        json_body={
            "userId": registered_user["user"]["id"], "hotelId": hotel["hotelId"], "hotelName": hotel["name"],
            "dateFrom": booked_from, "dateTo": booked_to, "adultsQuantity": 1,
            "childrenUnder3Quantity": 0, "childrenUnder10Quantity": 0, "childrenUnder18Quantity": 0,
            "price": hotel["pricePerAdult"], "roomName": "Overlap test room",
            "travelers": [{"name": "Overlap Tester", "travelerType": "ADULT"}], "roomIds": [room_id],
        },
    ).data
    try:
        def available_rooms(date_from: str, date_to: str, label: str) -> set[int]:
            data = api_client.request(
                f"API-OVERLAP-{label}", "GET",
                f"/hotels/{hotel['hotelId']}?dateFrom={date_from}&dateTo={date_to}&adults=1",
            ).data
            return {
                room["roomId"]
                for configuration in data["roomsConfigurations"]
                for room in configuration["rooms"]
            }

        overlapping = {
            # 查询区间后半段与已订区间相交
            "TAIL": ((base + timedelta(days=1)).isoformat(), (base + timedelta(days=3)).isoformat()),
            # 前半段相交
            "HEAD": ((base - timedelta(days=1)).isoformat(), (base + timedelta(days=1)).isoformat()),
            # 完全落在已订区间内
            "INNER": ((base + timedelta(days=1)).isoformat(), (base + timedelta(days=2)).isoformat()),
            # 完全包住已订区间——历史 bug 正是漏掉了这一种
            "OUTER": ((base - timedelta(days=1)).isoformat(), (base + timedelta(days=3)).isoformat()),
        }
        for label, (date_from, date_to) in overlapping.items():
            assert room_id not in available_rooms(date_from, date_to, label), (
                f"{label} 区间 {date_from}~{date_to} 与已订区间 {booked_from}~{booked_to} 重叠，"
                f"房型 {room_id} 不应可订"
            )

        # 完全不重叠的区间必须仍然可订，否则就是把房态判太严了。
        free_from = (base + timedelta(days=10)).isoformat()
        free_to = (base + timedelta(days=12)).isoformat()
        assert room_id in available_rooms(free_from, free_to, "FREE")
    finally:
        api_client.request(
            "API-OVERLAP-CLEANUP", "POST", f"/reservations/{reservation['id']}/cancel",
            expected=(200, 404), token=token, json_body={"reason": "Overlap test cleanup"},
        )
        wait_for_room_release(api_client, hotel["hotelId"], room_id, booked_from, booked_to)


def test_ai_conversation_storage(api_client: ApiClient, registered_user: dict) -> None:
    user_id = registered_user["user"]["id"]
    start, end = future_dates(55)
    conversation = api_client.request(
        "API-AI-001", "POST", "/ai-arrange/api/conversations", timeout=90,
        json_body={
            "userId": user_id,
            "coreSlots": {"city": "Shanghai", "travelStartDate": start, "travelEndDate": end, "peopleCount": 2},
        },
    ).data
    conversation_id = conversation["id"]
    api_client.request(
        "API-AI-002", "GET", f"/ai-arrange/api/conversations/{conversation_id}?userId={user_id}"
    )
    snapshots = api_client.request(
        "API-AI-003", "GET", f"/ai-arrange/api/conversations/{conversation_id}/snapshots?userId={user_id}"
    ).data
    assert isinstance(snapshots, list)
    api_client.request(
        "API-AI-004", "POST", "/ai-arrange/api/conversations", expected=400, json_body={"userId": user_id}
    )
