"""账户中心：实名信息、预订偏好、银联卡。

这三组接口此前只有服务层单元测试（AccountIdentityServiceTest、SavedBankCardServiceTest），
没有任何经网关的接口测试。它们都要求 `X-User-Token`，且「尚未设置」与「已设置」返回的
状态码不同（204 / 200），这条分支只有走真实 HTTP 才能验证。
"""

from __future__ import annotations

import pytest

from conftest import ApiClient


pytestmark = pytest.mark.integration

# UnionPay 测试卡号：以 62 开头且通过 Luhn 校验（SavedBankCardService.validateUnionPayCard）。
VALID_CARD = "6222021234567894"
ANOTHER_VALID_CARD = "6222020000078888"


def test_identity_is_empty_until_saved(api_client: ApiClient, registered_user: dict, unique_id: str) -> None:
    token = registered_user["token"]
    # 尚未填写实名信息时返回 204 而不是 200 + 空对象，前端据此决定是否展示引导。
    api_client.request("API-ACCT-IDENTITY-EMPTY", "GET", "/users/me/identity", expected=204, token=token)

    saved = api_client.request(
        "API-ACCT-IDENTITY-SAVE", "PUT", "/users/me/identity", token=token,
        json_body={"realName": "张三", "documentType": "ID_CARD", "documentNumber": "11010519491231002X"},
    ).data
    assert saved["realName"] == "张三"
    assert saved["documentType"] == "ID_CARD"

    reread = api_client.request("API-ACCT-IDENTITY-READ", "GET", "/users/me/identity", token=token).data
    assert reread["documentNumber"] == "11010519491231002X"

    # 再次保存是更新而不是新增一条。
    updated = api_client.request(
        "API-ACCT-IDENTITY-UPDATE", "PUT", "/users/me/identity", token=token,
        json_body={"realName": "李四", "documentType": "PASSPORT", "documentNumber": f"E{unique_id[:8]}"},
    ).data
    assert updated["realName"] == "李四"
    assert updated["id"] == saved["id"]

    api_client.request(
        "API-ACCT-IDENTITY-INVALID", "PUT", "/users/me/identity", expected=400, token=token,
        json_body={"realName": "", "documentType": "ID_CARD", "documentNumber": "11010519491231002X"},
    )
    api_client.request(
        "API-ACCT-IDENTITY-UNAUTH", "GET", "/users/me/identity", expected=(400, 401)
    )


def test_booking_preferences_round_trip(api_client: ApiClient, registered_user: dict) -> None:
    token = registered_user["token"]
    api_client.request(
        "API-ACCT-PREF-EMPTY", "GET", "/users/me/booking-preferences", expected=204, token=token
    )

    saved = api_client.request(
        "API-ACCT-PREF-SAVE", "PUT", "/users/me/booking-preferences", token=token,
        json_body={
            "defaultDepartureCity": "北京市", "defaultArrivalCity": "上海市",
            "preferredHotelMinRating": 4.5, "preferredHotelMaxPrice": "800",
            "preferredTrainTypes": ["GC", "D"], "onlyAvailableTickets": True,
        },
    ).data
    assert saved["preferredTrainTypes"] == ["GC", "D"]
    assert saved["onlyAvailableTickets"] is True
    assert float(saved["preferredHotelMinRating"]) == 4.5

    reread = api_client.request(
        "API-ACCT-PREF-READ", "GET", "/users/me/booking-preferences", token=token
    ).data
    assert reread["defaultDepartureCity"] == saved["defaultDepartureCity"]
    assert reread["defaultArrivalCity"] == saved["defaultArrivalCity"]

    # 未在白名单里的车次类型会被静默丢弃，而不是原样存下来。
    filtered = api_client.request(
        "API-ACCT-PREF-FILTER", "PUT", "/users/me/booking-preferences", token=token,
        json_body={
            "defaultDepartureCity": "北京市", "defaultArrivalCity": "广州市",
            "preferredHotelMinRating": 0, "preferredHotelMaxPrice": "",
            "preferredTrainTypes": ["GC", "NOT_A_TYPE"], "onlyAvailableTickets": False,
        },
    ).data
    assert filtered["preferredTrainTypes"] == ["GC"]

    # 出发地与目的地相同、以及无法识别的城市都必须被拒。
    api_client.request(
        "API-ACCT-PREF-SAME-CITY", "PUT", "/users/me/booking-preferences", expected=400, token=token,
        json_body={
            "defaultDepartureCity": "北京市", "defaultArrivalCity": "北京市",
            "preferredHotelMinRating": 3, "preferredHotelMaxPrice": "",
            "preferredTrainTypes": ["GC"], "onlyAvailableTickets": False,
        },
    )
    api_client.request(
        "API-ACCT-PREF-UNKNOWN-CITY", "PUT", "/users/me/booking-preferences", expected=400, token=token,
        json_body={
            "defaultDepartureCity": "不存在的城市", "defaultArrivalCity": "上海市",
            "preferredHotelMinRating": 3, "preferredHotelMaxPrice": "",
            "preferredTrainTypes": ["GC"], "onlyAvailableTickets": False,
        },
    )
    api_client.request(
        "API-ACCT-PREF-UNAUTH", "GET", "/users/me/booking-preferences", expected=(400, 401)
    )


def test_bank_card_add_list_and_delete(api_client: ApiClient, registered_user: dict) -> None:
    token = registered_user["token"]
    assert api_client.request(
        "API-ACCT-CARD-EMPTY", "GET", "/users/me/bank-cards", token=token
    ).data == []

    created = api_client.request(
        "API-ACCT-CARD-CREATE", "POST", "/users/me/bank-cards", expected=201, token=token,
        json_body={"cardNumber": VALID_CARD, "label": "常用卡"},
    ).data
    assert created["label"] == "常用卡"
    # 注意：接口目前原样返回完整卡号（SavedBankCardResponse 未做脱敏），
    # 这里只断言能定位到这张卡，不把「返回明文卡号」这个行为固化成期望。
    assert created["cardNumber"].endswith(VALID_CARD[-4:])

    # 同一张卡重复添加应返回已有记录而不是新建一条。
    again = api_client.request(
        "API-ACCT-CARD-DUPLICATE", "POST", "/users/me/bank-cards", expected=201, token=token,
        json_body={"cardNumber": VALID_CARD, "label": "重复添加"},
    ).data
    assert again["id"] == created["id"]

    second = api_client.request(
        "API-ACCT-CARD-CREATE-2", "POST", "/users/me/bank-cards", expected=201, token=token,
        json_body={"cardNumber": ANOTHER_VALID_CARD, "label": "备用卡"},
    ).data
    listed = api_client.request("API-ACCT-CARD-LIST", "GET", "/users/me/bank-cards", token=token).data
    assert {created["id"], second["id"]} == {item["id"] for item in listed}

    # 非银联卡号（不以 62 开头 / Luhn 不通过）必须被拒。
    api_client.request(
        "API-ACCT-CARD-INVALID", "POST", "/users/me/bank-cards", expected=400, token=token,
        json_body={"cardNumber": "6200000000000000", "label": "非法卡"},
    )
    api_client.request(
        "API-ACCT-CARD-NOT-UNIONPAY", "POST", "/users/me/bank-cards", expected=400, token=token,
        json_body={"cardNumber": "4111111111111111", "label": "非银联"},
    )

    api_client.request(
        "API-ACCT-CARD-DELETE", "DELETE", f"/users/me/bank-cards/{created['id']}",
        expected=204, token=token,
    )
    remaining = api_client.request(
        "API-ACCT-CARD-LIST-AFTER", "GET", "/users/me/bank-cards", token=token
    ).data
    assert [item["id"] for item in remaining] == [second["id"]]

    # 删除别人的卡（这里用一个不存在的 id 代表）应 404，而不是静默成功。
    api_client.request(
        "API-ACCT-CARD-DELETE-MISSING", "DELETE",
        "/users/me/bank-cards/00000000-0000-0000-0000-000000000000", expected=404, token=token,
    )
    api_client.request(
        "API-ACCT-CARD-UNAUTH", "GET", "/users/me/bank-cards", expected=(400, 401)
    )

    api_client.request(
        "API-ACCT-CARD-CLEANUP", "DELETE", f"/users/me/bank-cards/{second['id']}",
        expected=(204, 404), token=token,
    )
