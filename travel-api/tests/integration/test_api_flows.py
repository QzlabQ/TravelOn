from __future__ import annotations

from datetime import date, timedelta
from urllib.parse import quote

import pytest

from conftest import ApiClient


pytestmark = pytest.mark.integration


def future_dates(offset: int = 40) -> tuple[str, str]:
    start = date.today() + timedelta(days=offset)
    return start.isoformat(), (start + timedelta(days=2)).isoformat()


def auth(user: dict) -> str:
    return user["token"]


def test_gateway_exposes_hotel_and_transport_catalogs(api_client: ApiClient) -> None:
    destinations = api_client.request("INT-001", "GET", "/hotels/destinations").data
    assert destinations
    available = api_client.request("INT-002", "GET", "/transports/available").data
    assert available["departures"] is not None
    assert available["arrivals"] is not None


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
    start, _ = future_dates(45)
    options = api_client.request(
        f"API-TRANS-{transport_type}-OPTIONS", "GET", f"/transports/tickets/options?type={transport_type}"
    ).data
    assert options["departures"] and options["arrivals"]
    response = api_client.request(
        f"API-TRANS-{transport_type}-SEARCH", "GET",
        f"/transports/tickets?type={transport_type}&departureCity={quote('Beijing')}&arrivalCity={quote('Shanghai')}&departureDate={start}",
    ).data
    assert isinstance(response, list)


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
