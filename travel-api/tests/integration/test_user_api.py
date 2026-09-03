"""用户资料与常用旅客的写接口。

现有 test_api_flows.py 只覆盖注册、登录、查资料和旅客的增/查/删；这里补上剩下的
`PUT /users/me`、`POST /users/auth/logout` 和 `PUT /users/me/travelers/{id}`。
"""

from __future__ import annotations

import pytest

from conftest import ApiClient


pytestmark = pytest.mark.integration


def test_profile_update_persists_and_requires_token(api_client: ApiClient, registered_user: dict) -> None:
    token = registered_user["token"]
    updated = api_client.request(
        "API-USER-PROFILE-UPDATE", "PUT", "/users/me", token=token,
        json_body={"name": "Updated", "surname": "Name", "phone": "13900139000"},
    ).data
    assert updated["name"] == "Updated"
    assert updated["surname"] == "Name"
    assert updated["phone"] == "13900139000"

    reread = api_client.request("API-USER-PROFILE-REREAD", "GET", "/users/me", token=token).data
    assert reread["name"] == "Updated"
    assert reread["phone"] == "13900139000"

    api_client.request(
        "API-USER-PROFILE-UNAUTH", "PUT", "/users/me", expected=(400, 401),
        json_body={"name": "NoToken", "surname": "NoToken", "phone": "13900139000"},
    )


def test_logout_invalidates_the_token(api_client: ApiClient, registered_user: dict) -> None:
    token = registered_user["token"]
    api_client.request("API-USER-LOGOUT-BEFORE", "GET", "/users/me", token=token)
    api_client.request("API-USER-LOGOUT", "POST", "/users/auth/logout", expected=204, token=token)
    # 登出的意义就在于旧令牌立刻失效，这一步失败说明会话没有真正被销毁。
    api_client.request("API-USER-LOGOUT-AFTER", "GET", "/users/me", expected=401, token=token)

    login = api_client.request(
        "API-USER-RELOGIN", "POST", "/users/auth/login",
        json_body={"email": registered_user["user"]["email"], "password": registered_user["password"]},
    ).data
    assert login["token"] and login["token"] != token


def test_traveler_update(api_client: ApiClient, registered_user: dict, unique_id: str) -> None:
    token = registered_user["token"]
    created = api_client.request(
        "API-USER-TRAVELER-CREATE", "POST", "/users/me/travelers", expected=201, token=token,
        json_body={
            "name": "Before Update", "travelerType": "ADULT", "documentType": "ID_CARD",
            "documentNumber": f"UP-{unique_id}", "phone": "13800138000", "defaultTraveler": False,
        },
    ).data

    updated = api_client.request(
        "API-USER-TRAVELER-UPDATE", "PUT", f"/users/me/travelers/{created['id']}", token=token,
        json_body={
            "name": "After Update", "travelerType": "ADULT", "documentType": "PASSPORT",
            "documentNumber": f"UP2-{unique_id}", "phone": "13700137000", "defaultTraveler": True,
        },
    ).data
    assert updated["id"] == created["id"]
    assert updated["name"] == "After Update"
    assert updated["documentType"] == "PASSPORT"

    listed = api_client.request("API-USER-TRAVELER-LIST", "GET", "/users/me/travelers", token=token).data
    stored = next(item for item in listed if item["id"] == created["id"])
    assert stored["name"] == "After Update"
    assert stored["documentNumber"] == f"UP2-{unique_id}"

    api_client.request(
        "API-USER-TRAVELER-UPDATE-UNAUTH", "PUT", f"/users/me/travelers/{created['id']}", expected=(400, 401),
        json_body={
            "name": "No Token", "travelerType": "ADULT", "documentType": "PASSPORT",
            "documentNumber": f"UP3-{unique_id}", "phone": "13700137000", "defaultTraveler": False,
        },
    )
    api_client.request(
        "API-USER-TRAVELER-CLEANUP", "DELETE", f"/users/me/travelers/{created['id']}",
        expected=204, token=token,
    )
