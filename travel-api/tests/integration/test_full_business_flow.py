from __future__ import annotations

import os
from datetime import date, timedelta
from pathlib import Path

import pytest

from conftest import ApiClient
from test_remediation import postgres_scalar


pytestmark = [pytest.mark.integration, pytest.mark.external]
REPO_ROOT = Path(__file__).resolve().parents[3]


def admin_credentials() -> tuple[str, str]:
    email = os.getenv("ADMIN_EMAIL", "")
    password = os.getenv("ADMIN_PASSWORD", "")
    account_file = Path(os.getenv("ADMIN_ACCOUNT_FILE", str(REPO_ROOT / "admin_account.txt")))
    if (not email or not password) and account_file.exists():
        values = {}
        for line in account_file.read_text(encoding="utf-8").splitlines():
            key, separator, value = line.partition(":")
            if separator:
                values[key.strip()] = value.strip()
        email = email or values.get("email", "")
        password = password or values.get("password", "")
    assert email and password, "full 测试需要 ADMIN_EMAIL/ADMIN_PASSWORD 或仓库根目录 admin_account.txt"
    return email, password


def test_complete_api_business_flow(api_client: ApiClient, registered_user: dict, unique_id: str) -> None:
    token = registered_user["token"]
    user_id = registered_user["user"]["id"]
    travel_day = date.today() + timedelta(days=90)
    stay_from = (travel_day - timedelta(days=5)).isoformat()
    stay_to = (travel_day - timedelta(days=3)).isoformat()
    travel_date = travel_day.isoformat()
    admin_email, admin_password = admin_credentials()

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
    flight_fixture_id = None
    train_fixture_id = None
    post_id = None
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

        admin_token = api_client.request(
            "FULL-ADMIN-LOGIN", "POST", "/users/auth/login",
            json_body={"email": admin_email, "password": admin_password},
        ).data["token"]
        flight_fixture = api_client.request(
            "FULL-FLIGHT-FIXTURE", "POST", "/transports/tickets/templates", expected=201, token=admin_token,
            json_body={
                "type": "FLIGHT", "departureCityId": "C039", "arrivalCityId": "C005",
                "departureStationCode": "E2E-PEK", "departureTerminalName": "E2E Terminal",
                "departureStationName": "E2E Beijing", "arrivalStationCode": "E2E-PVG",
                "arrivalTerminalName": "E2E Terminal", "arrivalStationName": "E2E Shanghai",
                "departureDateTime": f"{travel_date}T09:00:00", "arrivalDateTime": f"{travel_date}T11:30:00",
                "carrier": "E2E Air", "code": f"E2E-F-{unique_id}", "seatClass": "ECONOMY",
                "price": 588.88, "remainingSeats": 5, "totalSeats": 5,
            },
        ).data
        flight_fixture_id = flight_fixture["id"]
        train_fixture = api_client.request(
            "FULL-TRAIN-FIXTURE", "POST", "/transports/tickets/templates", expected=201, token=admin_token,
            json_body={
                "type": "TRAIN", "departureCityId": "C005", "arrivalCityId": "C039",
                "departureStationCode": "E2E-SH", "departureTerminalName": "E2E Station",
                "departureStationName": "E2E Shanghai", "arrivalStationCode": "E2E-BJ",
                "arrivalTerminalName": "E2E Station", "arrivalStationName": "E2E Beijing",
                "departureDateTime": f"{travel_date}T14:00:00", "arrivalDateTime": f"{travel_date}T18:30:00",
                "carrier": "E2E Rail", "code": f"E2E-T-{unique_id}", "seatClass": "SECOND_CLASS",
                "price": 288.88, "remainingSeats": 5, "totalSeats": 5,
            },
        ).data
        train_fixture_id = train_fixture["id"]

        def create_ticket_order(kind: str, departure: str, arrival: str) -> dict:
            offers = api_client.request(
                f"FULL-{kind}-SEARCH", "GET",
                f"/transports/tickets?type={kind}&departureCity={departure}&arrivalCity={arrival}"
                f"&departureDate={travel_date}&onlyAvailable=true&sortBy=departure",
            ).data
            expected_code = f"E2E-{'F' if kind == 'FLIGHT' else 'T'}-{unique_id}"
            offer = next(item for item in offers if item["code"] == expected_code)
            return api_client.request(
                f"FULL-{kind}-ORDER", "POST", "/reservations/tickets", token=token,
                json_body={
                    "userId": user_id, "transportType": kind, "departureDate": travel_date,
                    "departureTime": offer["departureTime"], "arrivalTime": offer["arrivalTime"],
                    "provider": offer["carrier"], "bookingCode": offer["code"], "passengerCount": 1,
                    "price": offer["price"], "travelers": [booking_traveler], "ticketOfferId": offer["ticketOfferId"],
                },
            ).data

        flight_order = create_ticket_order("FLIGHT", "北京市", "上海市")
        train_order = create_ticket_order("TRAIN", "上海市", "北京市")
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
        initial = api_client.request(
            "FULL-AI-RUN", "POST", f"/ai-arrange/api/conversations/{conversation_id}/planner/run", timeout=300,
            json_body={
                "userId": user_id, "message": "请生成包含外滩的一日行程。", "planningMode": "INITIAL_PLAN",
                "planningScope": "DAY_PLAN", "modelVariant": "FLASH", "targetDayIndex": 1,
                "targetDate": travel_date, "selectedPlaceIds": [],
            },
        ).data
        snapshot_v1 = api_client.request(
            "FULL-AI-SNAPSHOT-1", "POST", f"/ai-arrange/api/conversations/{conversation_id}/markdown-snapshots",
            json_body={"userId": user_id, "markdown": "# 上海一日行程\n- 外滩", "mode": "TRIP", "baseVersion": initial["version"]},
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
        if flight_fixture_id:
            api_client.request(
                "FULL-CLEAN-FLIGHT", "DELETE", f"/transports/tickets/templates/{flight_fixture_id}", expected=204,
                token=admin_token,
            )
        if train_fixture_id:
            api_client.request(
                "FULL-CLEAN-TRAIN", "DELETE", f"/transports/tickets/templates/{train_fixture_id}", expected=204,
                token=admin_token,
            )
