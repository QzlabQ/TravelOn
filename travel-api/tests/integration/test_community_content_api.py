"""社区内容：评价、景点、路线。

这三块此前在 API 层完全没有覆盖，而它们承担了 BS-07 里除发帖之外的全部业务。
景点的修改与删除只对管理员开放（AttractionService.update/delete 走 requireAdmin），
所以这里既验证普通用户被拒，也在有管理员凭据时验证管理员可以改。
"""

from __future__ import annotations

import pytest

from conftest import ApiClient


pytestmark = pytest.mark.integration

CITY_ID = "C001"


def create_attraction(api_client: ApiClient, token: str, unique_id: str, suffix: str = "") -> dict:
    # 景点按 name + cityId 去重，名字必须唯一，否则拿回的是上一次运行留下的那条。
    return api_client.request(
        f"API-COM-ATTR-CREATE{suffix}", "POST", "/community/attractions", expected=201, token=token,
        json_body={
            "name": f"集成测试景点 {unique_id}{suffix}",
            "cityId": CITY_ID,
            "description": "由 API 集成测试创建。",
            "imageUrls": [],
        },
    ).data


def test_review_lifecycle(api_client: ApiClient, registered_user: dict, unique_id: str) -> None:
    token = registered_user["token"]
    review = api_client.request(
        "API-COM-REVIEW-CREATE", "POST", "/community/reviews", expected=201, token=token,
        json_body={
            "targetType": "HOTEL", "targetId": f"hotel-{unique_id}", "targetName": "集成测试酒店",
            "rating": 5, "content": "房间干净，位置好。", "category": "HOTEL", "imageUrls": [],
        },
    ).data
    review_id = review["id"]
    assert review["rating"] == 5

    listed = api_client.request(
        "API-COM-REVIEW-LIST", "GET",
        f"/community/reviews?targetType=HOTEL&targetId=hotel-{unique_id}", token=token,
    ).data
    assert review_id in {item["id"] for item in listed["content"]}

    liked = api_client.request(
        "API-COM-REVIEW-LIKE", "POST", f"/community/reviews/{review_id}/likes", token=token
    ).data
    assert liked["liked"] is True and liked["likeCount"] == 1
    unliked = api_client.request(
        "API-COM-REVIEW-UNLIKE", "POST", f"/community/reviews/{review_id}/likes", token=token
    ).data
    assert unliked["liked"] is False and unliked["likeCount"] == 0

    summary = api_client.request(
        "API-COM-SUMMARY", "GET",
        f"/community/summary?targetType=HOTEL&targetId=hotel-{unique_id}",
    ).data
    assert summary["reviewCount"] >= 1

    mine = api_client.request("API-COM-MY-REVIEWS", "GET", "/community/me/reviews", token=token).data
    assert review_id in {item["id"] for item in mine}

    api_client.request(
        "API-COM-REVIEW-UNAUTH-DELETE", "DELETE", f"/community/reviews/{review_id}", expected=401
    )
    api_client.request(
        "API-COM-REVIEW-DELETE", "DELETE", f"/community/reviews/{review_id}", expected=204, token=token
    )
    after = api_client.request(
        "API-COM-REVIEW-LIST-AFTER", "GET",
        f"/community/reviews?targetType=HOTEL&targetId=hotel-{unique_id}",
    ).data
    assert review_id not in {item["id"] for item in after["content"]}


def test_attraction_read_paths_and_review(api_client: ApiClient, registered_user: dict, unique_id: str) -> None:
    token = registered_user["token"]
    attraction = create_attraction(api_client, token, unique_id)
    attraction_id = attraction["id"]
    try:
        detail = api_client.request(
            "API-COM-ATTR-DETAIL", "GET", f"/community/attractions/{attraction_id}", token=token
        ).data
        assert detail["name"] == attraction["name"]
        assert detail["favoritedByCurrentUser"] is False

        listed = api_client.request(
            "API-COM-ATTR-LIST", "GET", f"/community/attractions?cityId={CITY_ID}&keyword={unique_id}"
        ).data
        assert attraction_id in {item["id"] for item in listed["content"]}

        review = api_client.request(
            "API-COM-ATTR-REVIEW", "POST", f"/community/attractions/{attraction_id}/reviews",
            expected=201, token=token,
            json_body={"rating": 4, "content": "景色不错，人有点多。", "imageUrls": []},
        ).data
        assert review["targetId"] == attraction_id
        assert review["rating"] == 4

        rated = api_client.request(
            "API-COM-ATTR-DETAIL-RATED", "GET", f"/community/attractions/{attraction_id}", token=token
        ).data
        assert rated["reviewCount"] >= 1
        assert rated["latestReviews"]

        api_client.request(
            "API-COM-ATTR-REVIEW-UNAUTH", "POST", f"/community/attractions/{attraction_id}/reviews",
            expected=401, json_body={"rating": 4, "content": "未登录不应通过。", "imageUrls": []},
        )
        api_client.request(
            "API-COM-REVIEW-CLEANUP", "DELETE", f"/community/reviews/{review['id']}",
            expected=(204, 404), token=token,
        )
    finally:
        api_client.request(
            "API-COM-ATTR-USER-DELETE", "DELETE", f"/community/attractions/{attraction_id}",
            expected=403, token=token,
        )


def test_attraction_admin_write_paths(
    api_client: ApiClient, registered_user: dict, admin_token: str, unique_id: str
) -> None:
    attraction = create_attraction(api_client, registered_user["token"], unique_id, suffix="-admin")
    attraction_id = attraction["id"]
    updated = api_client.request(
        "API-COM-ATTR-ADMIN-UPDATE", "PUT", f"/community/attractions/{attraction_id}", token=admin_token,
        json_body={
            "name": f"集成测试景点 {unique_id}-admin-updated",
            "cityId": CITY_ID,
            "description": "管理员更新后的描述。",
            "imageUrls": [],
        },
    ).data
    assert updated["name"].endswith("-admin-updated")
    assert updated["description"] == "管理员更新后的描述。"

    api_client.request(
        "API-COM-ATTR-ADMIN-DELETE", "DELETE", f"/community/attractions/{attraction_id}",
        expected=204, token=admin_token,
    )
    api_client.request(
        "API-COM-ATTR-GONE", "GET", f"/community/attractions/{attraction_id}", expected=404
    )


def test_route_lifecycle(api_client: ApiClient, registered_user: dict, admin_token: str, unique_id: str) -> None:
    token = registered_user["token"]
    attraction = create_attraction(api_client, token, unique_id, suffix="-route")
    route_id = None
    try:
        route = api_client.request(
            "API-COM-ROUTE-CREATE", "POST", "/community/routes", expected=201, token=token,
            json_body={
                "title": f"集成测试路线 {unique_id}",
                "summary": "两天一夜的测试路线。",
                "days": 2, "peopleCount": 2, "budget": 1500,
                "style": "LEISURE", "cityId": CITY_ID, "imageUrls": [],
                "stops": [
                    {"attractionId": attraction["id"], "dayNumber": 1, "sortOrder": 0, "note": "上午出发"},
                ],
            },
        ).data
        route_id = route["id"]

        detail = api_client.request(
            "API-COM-ROUTE-DETAIL", "GET", f"/community/routes/{route_id}", token=token
        ).data
        assert detail["title"] == route["title"]
        assert [stop["attractionId"] for stop in detail["stops"]] == [attraction["id"]]

        listed = api_client.request(
            "API-COM-ROUTE-LIST", "GET", f"/community/routes?cityId={CITY_ID}&keyword={unique_id}"
        ).data
        assert route_id in {item["id"] for item in listed["content"]}

        review = api_client.request(
            "API-COM-ROUTE-REVIEW", "POST", f"/community/routes/{route_id}/reviews", expected=201, token=token,
            json_body={"rating": 5, "content": "路线安排很合理。", "imageUrls": []},
        ).data
        assert review["targetId"] == route_id

        mine = api_client.request("API-COM-MY-ROUTES", "GET", "/community/me/routes", token=token).data
        assert route_id in {item["id"] for item in mine}

        # 路线不存在更新接口，引用了不存在景点的创建请求必须被拒。
        api_client.request(
            "API-COM-ROUTE-BAD-STOP", "POST", "/community/routes", expected=400, token=token,
            json_body={
                "title": f"非法路线 {unique_id}", "summary": "", "days": 1, "peopleCount": 1,
                "budget": 0, "style": "LEISURE", "cityId": CITY_ID, "imageUrls": [],
                "stops": [
                    {"attractionId": "00000000-0000-0000-0000-000000000000",
                     "dayNumber": 1, "sortOrder": 0, "note": ""},
                ],
            },
        )
    finally:
        if route_id:
            api_client.request(
                "API-COM-ROUTE-DELETE", "DELETE", f"/community/routes/{route_id}",
                expected=(204, 404), token=token,
            )
        api_client.request(
            "API-COM-ROUTE-ATTR-CLEANUP", "DELETE", f"/community/attractions/{attraction['id']}",
            expected=(204, 404), token=admin_token,
        )
