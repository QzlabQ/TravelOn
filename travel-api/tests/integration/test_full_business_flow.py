from __future__ import annotations

from datetime import date, timedelta
from urllib.parse import quote

import pytest

from conftest import ApiClient
from test_remediation import postgres_scalar


pytestmark = pytest.mark.integration

# 票务种子数据是以生成日为基准的滚动窗口（见 travel-api/scripts/generate_dated_ticket_offers.py）。
# 取窗口内靠前的一天，既能查到班次，也不会随窗口尾部漂移而失效。
TICKET_OFFSET_DAYS = 14


def create_ticket_order(
    api_client: ApiClient,
    kind: str,
    departure: str,
    arrival: str,
    travel_date: str,
    token: str,
    user_id: str,
    traveler: dict,
) -> dict:
    offers = api_client.request(
        f"FULL-{kind}-SEARCH", "GET",
        f"/transports/tickets?type={kind}&departureCity={quote(departure)}&arrivalCity={quote(arrival)}"
        f"&departureDate={travel_date}&onlyAvailable=true&sortBy=departure",
    ).data
    assert offers, (
        f"{travel_date} 没有 {departure} → {arrival} 的 {kind} 班次。"
        "票务种子窗口可能已过期，先运行 travel-api/scripts/generate_dated_ticket_offers.py。"
    )
    offer = offers[0]
    return api_client.request(
        f"FULL-{kind}-ORDER", "POST", "/reservations/tickets", token=token,
        json_body={
            "userId": user_id, "transportType": kind, "departureDate": travel_date,
            "departureTime": offer["departureTime"], "arrivalTime": offer["arrivalTime"],
            "provider": offer["carrier"], "bookingCode": offer["code"], "passengerCount": 1,
            "price": offer["price"], "travelers": [traveler], "ticketOfferId": offer["ticketOfferId"],
        },
    ).data


def test_complete_api_business_flow(api_client: ApiClient, registered_user: dict, unique_id: str) -> None:
    token = registered_user["token"]
    user_id = registered_user["user"]["id"]
    travel_day = date.today() + timedelta(days=TICKET_OFFSET_DAYS)
    stay_from = (travel_day + timedelta(days=2)).isoformat()
    stay_to = (travel_day + timedelta(days=4)).isoformat()
    travel_date = travel_day.isoformat()

    traveler = api_client.request(
        "FULL-TRAVELER-CREATE", "POST", "/users/me/travelers", expected=201, token=token,
        json_body={
            "name": "Full Flow Traveler", "travelerType": "ADULT", "documentType": "PASSPORT",
            "documentNumber": f"FULL-{unique_id}", "phone": "13800138000", "defaultTraveler": True,
        },
    ).data
    booking_traveler = {
        "travelerId": traveler["id"], "name": traveler["name"], "travelerType": "ADULT",
        "documentType": "PASSPORT", "documentNumber": f"FULL-{unique_id}", "phone": "13800138000",
    }
    post_id = None
    train_order = None
    try:
        destinations = api_client.request("FULL-DEST", "GET", "/hotels/destinations").data
        destination = next((item for item in destinations if item.get("cityId") == "C001"), destinations[0])
        hotel = api_client.request(
            "FULL-HOTEL-SEARCH", "GET",
            f"/hotels/search?destinationId={destination['idLocation']}&dateFrom={stay_from}&dateTo={stay_to}&adults=1&minRating=0&sortBy=price",
        ).data[0]
        details = api_client.request(
            "FULL-HOTEL-DETAIL", "GET",
            f"/hotels/{hotel['hotelId']}?dateFrom={stay_from}&dateTo={stay_to}&adults=1",
        ).data
        room_ids = [room["roomId"] for room in details["roomsConfigurations"][0]["rooms"]]
        hotel_order_body = {
            "userId": user_id, "hotelId": hotel["hotelId"], "hotelName": hotel["name"],
            "dateFrom": stay_from, "dateTo": stay_to, "adultsQuantity": 1,
            "childrenUnder3Quantity": 0, "childrenUnder10Quantity": 0, "childrenUnder18Quantity": 0,
            "price": hotel["pricePerAdult"], "roomName": "Full flow room",
            "travelers": [booking_traveler], "roomIds": room_ids,
        }
        hotel_order = api_client.request(
            "FULL-HOTEL-ORDER", "POST", "/reservations/hotels", token=token, json_body=hotel_order_body
        ).data
        api_client.request(
            "FULL-HOTEL-UNAUTH", "POST", "/reservations/hotels", expected=401, json_body=hotel_order_body
        )

        flight_order = create_ticket_order(
            api_client, "FLIGHT", "北京市", "上海市", travel_date, token, user_id, booking_traveler
        )
        train_order = create_ticket_order(
            api_client, "TRAIN", "上海市", "北京市", travel_date, token, user_id, booking_traveler
        )
        api_client.request(
            "FULL-PAY-INVALID", "POST", "/reservations/purchase", expected=400, token=token,
            json_body={"reservationId": hotel_order["id"], "cardNumber": "6200000000000000"},
        )
        api_client.request(
            "FULL-PAY-VALID", "POST", "/reservations/purchase", token=token,
            json_body={"reservationId": hotel_order["id"], "cardNumber": "6222020000078888"},
        )
        paid = api_client.request("FULL-PAID-ORDER", "GET", f"/reservations/{hotel_order['id']}", token=token).data
        assert paid["status"] == "PAID" and paid["paid"] is True
        statuses = {
            item["status"] for item in api_client.request(
                "FULL-PAY-HISTORY", "GET", f"/reservations/{hotel_order['id']}/payments", token=token
            ).data
        }
        assert {"FAILED", "SUCCESS"}.issubset(statuses)
        cancelled = api_client.request(
            "FULL-CANCEL-FLIGHT", "POST", f"/reservations/{flight_order['id']}/cancel", token=token,
            json_body={"reason": "Full-flow alternate cancellation"},
        ).data
        assert cancelled["status"] == "CANCELLED"
        api_client.request(
            "FULL-CANCEL-HOTEL", "POST", f"/reservations/{hotel_order['id']}/cancel", token=token,
            json_body={"reason": "Full-flow paid-order refund"},
        )
        refunds = api_client.request(
            "FULL-REFUNDS", "GET", f"/reservations/{hotel_order['id']}/refunds", token=token
        ).data
        assert refunds and refunds[0]["amount"] > 0
        orders = api_client.request("FULL-ORDERS", "GET", f"/reservations/user/{user_id}", token=token).data
        assert {hotel_order["id"], flight_order["id"], train_order["id"]}.issubset({item["id"] for item in orders})

        api_client.request(
            "FULL-POST-UNAUTH", "POST", "/community/posts", expected=401,
            json_body={"title": "unauth", "content": "rejected", "contentFormat": "PLAIN_TEXT", "category": "TRAVEL_NOTE"},
        )
        post = api_client.request(
            "FULL-POST", "POST", "/community/posts", expected=201, token=token,
            json_body={
                "title": f"Full flow {unique_id}", "content": "End-to-end community post.",
                "contentFormat": "PLAIN_TEXT", "category": "TRAVEL_NOTE", "destinationCityId": "C001", "imageUrls": [],
            },
        ).data
        post_id = post["id"]
        api_client.request("FULL-POST-LIKE", "POST", f"/community/posts/{post_id}/likes", token=token)
        api_client.request(
            "FULL-POST-COMMENT", "POST", f"/community/posts/{post_id}/comments", expected=201,
            token=token, json_body={"content": "E2E comment"},
        )
        api_client.request(
            "FULL-POST-FAVORITE", "POST", "/community/favorites/toggle", token=token,
            json_body={"type": "POST", "targetId": post_id},
        )
        assert post_id in {item["id"] for item in api_client.request("FULL-MY-POSTS", "GET", "/community/me/posts", token=token).data}

        conversation = api_client.request(
            "FULL-AI-CONVERSATION", "POST", "/ai-arrange/api/conversations",
            json_body={
                "userId": user_id,
                "coreSlots": {
                    "city": "上海", "departureCity": "北京", "travelStartDate": travel_date,
                    "travelEndDate": travel_date, "peopleCount": 1, "budget": "2000",
                    "travelStyle": "休闲", "mustVisitKeywords": ["外滩"], "avoidKeywords": [],
                },
            },
        ).data
        conversation_id = conversation["id"]
        api_client.request(
            "FULL-AI-RUN", "POST", f"/ai-arrange/api/conversations/{conversation_id}/planner/run", timeout=300,
            json_body={
                "userId": user_id, "message": "请生成包含外滩的一日行程。", "planningMode": "INITIAL_PLAN",
                "planningScope": "DAY_PLAN", "modelVariant": "FLASH", "targetDayIndex": 1,
                "targetDate": travel_date, "selectedPlaceIds": [],
            },
        )
        # 外部模型不可用时 planner/run 会返回降级结果，响应体形状可能不同；
        # 版本号一律以快照列表为准，让这条用例不依赖模型是否真的可用。
        stored = api_client.request(
            "FULL-AI-SNAPSHOT-LIST", "GET",
            f"/ai-arrange/api/conversations/{conversation_id}/snapshots?userId={user_id}",
        ).data
        assert stored, "planner/run 之后没有产生任何快照"
        base_version = max(item["version"] for item in stored)
        snapshot_v1 = api_client.request(
            "FULL-AI-SNAPSHOT-1", "POST", f"/ai-arrange/api/conversations/{conversation_id}/markdown-snapshots",
            json_body={"userId": user_id, "markdown": "# 上海一日行程\n- 外滩", "mode": "TRIP", "baseVersion": base_version},
        ).data
        snapshot_v2 = api_client.request(
            "FULL-AI-SNAPSHOT-2", "POST", f"/ai-arrange/api/conversations/{conversation_id}/markdown-snapshots",
            json_body={
                "userId": user_id, "markdown": "# 上海一日行程\n- 外滩\n- 上海博物馆",
                "mode": "TRIP", "baseVersion": snapshot_v1["version"],
            },
        ).data
        api_client.request(
            "FULL-AI-DIFF", "GET",
            f"/ai-arrange/api/conversations/{conversation_id}/snapshots/{snapshot_v1['version']}/diff/{snapshot_v2['version']}?userId={user_id}",
        )
        api_client.request(
            "FULL-AI-ROLLBACK", "POST",
            f"/ai-arrange/api/conversations/{conversation_id}/snapshots/{snapshot_v1['version']}/rollback?userId={user_id}",
            json_body={},
        )
        assert postgres_scalar("user_db", f"select count(*) from travelers where user_id = '{user_id}';") >= 1
        assert postgres_scalar("reservation_db", f"select count(*) from reservation where user_id = '{user_id}';") >= 3
        assert postgres_scalar("community_db", f"select count(*) from community_post where author_user_id = '{user_id}';") >= 1
    finally:
        if post_id:
            api_client.request("FULL-CLEAN-POST", "DELETE", f"/community/posts/{post_id}", expected=204, token=token)
        if train_order:
            # 车票订单没有在主流程里被支付或取消，主动释放座位，避免多次运行耗尽库存。
            api_client.request(
                "FULL-CLEAN-TRAIN-ORDER", "POST", f"/reservations/{train_order['id']}/cancel",
                expected=(200, 404), token=token, json_body={"reason": "Full-flow cleanup"},
            )
