"""社区互动：评论、收藏、我的内容、图片上传。

test_api_flows.py 的帖子用例只发了一条评论就结束了；评论列表、评论点赞、评论删除、
收藏状态查询和 `/community/me/favorites/*` 这一整片此前没有任何断言。
"""

from __future__ import annotations

import pytest

from conftest import ApiClient


pytestmark = pytest.mark.integration

CITY_ID = "C001"


@pytest.fixture
def post(api_client: ApiClient, registered_user: dict, unique_id: str) -> dict:
    token = registered_user["token"]
    created = api_client.request(
        "API-COM-INT-POST", "POST", "/community/posts", expected=201, token=token,
        json_body={
            "title": f"互动测试帖 {unique_id}", "content": "用于评论与收藏的测试帖子。",
            "contentFormat": "PLAIN_TEXT", "category": "TRAVEL_NOTE",
            "destinationCityId": CITY_ID, "imageUrls": [],
        },
    ).data
    yield created
    api_client.request(
        "API-COM-INT-POST-CLEANUP", "DELETE", f"/community/posts/{created['id']}",
        expected=(204, 404), token=token,
    )


def test_post_comment_list_like_and_delete(
    api_client: ApiClient, registered_user: dict, post: dict
) -> None:
    token = registered_user["token"]
    post_id = post["id"]

    empty = api_client.request(
        "API-COM-COMMENT-EMPTY", "GET", f"/community/posts/{post_id}/comments", token=token
    ).data
    assert empty == []

    comment = api_client.request(
        "API-COM-COMMENT-CREATE", "POST", f"/community/posts/{post_id}/comments", expected=201,
        token=token, json_body={"content": "第一条评论"},
    ).data
    comment_id = comment["id"]

    listed = api_client.request(
        "API-COM-COMMENT-LIST", "GET", f"/community/posts/{post_id}/comments?sort=likes", token=token
    ).data
    assert [item["id"] for item in listed] == [comment_id]
    assert listed[0]["content"] == "第一条评论"
    assert listed[0]["likeCount"] == 0

    liked = api_client.request(
        "API-COM-COMMENT-LIKE", "POST", f"/community/posts/{post_id}/comments/{comment_id}/likes",
        token=token,
    ).data
    assert liked["liked"] is True and liked["likeCount"] == 1
    after_like = api_client.request(
        "API-COM-COMMENT-LIST-LIKED", "GET", f"/community/posts/{post_id}/comments", token=token
    ).data
    assert after_like[0]["likeCount"] == 1
    assert after_like[0]["likedByCurrentUser"] is True

    unliked = api_client.request(
        "API-COM-COMMENT-UNLIKE", "POST", f"/community/posts/{post_id}/comments/{comment_id}/likes",
        token=token,
    ).data
    assert unliked["liked"] is False and unliked["likeCount"] == 0

    api_client.request(
        "API-COM-COMMENT-DELETE-UNAUTH", "DELETE",
        f"/community/posts/{post_id}/comments/{comment_id}", expected=401,
    )
    api_client.request(
        "API-COM-COMMENT-DELETE", "DELETE", f"/community/posts/{post_id}/comments/{comment_id}",
        expected=204, token=token,
    )
    assert api_client.request(
        "API-COM-COMMENT-LIST-AFTER", "GET", f"/community/posts/{post_id}/comments", token=token
    ).data == []


def test_favorite_status_and_my_favorites(
    api_client: ApiClient, registered_user: dict, post: dict, unique_id: str
) -> None:
    token = registered_user["token"]
    post_id = post["id"]

    before = api_client.request(
        "API-COM-FAV-STATUS-BEFORE", "GET",
        f"/community/favorites/status?type=POST&targetId={post_id}", token=token,
    ).data
    assert before["favorited"] is False

    toggled = api_client.request(
        "API-COM-FAV-ON", "POST", "/community/favorites/toggle", token=token,
        json_body={"type": "POST", "targetId": post_id},
    ).data
    assert toggled["favorited"] is True

    after = api_client.request(
        "API-COM-FAV-STATUS-AFTER", "GET",
        f"/community/favorites/status?type=POST&targetId={post_id}", token=token,
    ).data
    assert after["favorited"] is True

    favorites = api_client.request(
        "API-COM-MY-FAV-POSTS", "GET", "/community/me/favorites/posts", token=token
    ).data
    assert post_id in {item["id"] for item in favorites}

    # 另外两个收藏列表此前完全没有被调用过，至少确认它们能返回并且不含本帖。
    assert api_client.request(
        "API-COM-MY-FAV-ROUTES", "GET", "/community/me/favorites/routes", token=token
    ).data == []
    assert api_client.request(
        "API-COM-MY-FAV-ATTRACTIONS", "GET", "/community/me/favorites/attractions", token=token
    ).data == []

    off = api_client.request(
        "API-COM-FAV-OFF", "POST", "/community/favorites/toggle", token=token,
        json_body={"type": "POST", "targetId": post_id},
    ).data
    assert off["favorited"] is False
    assert api_client.request(
        "API-COM-MY-FAV-POSTS-AFTER", "GET", "/community/me/favorites/posts", token=token
    ).data == []

    api_client.request(
        "API-COM-FAV-UNAUTH", "POST", "/community/favorites/toggle", expected=401,
        json_body={"type": "POST", "targetId": post_id},
    )


def test_image_upload_returns_servable_url(
    api_client: ApiClient, registered_user: dict, unique_id: str
) -> None:
    # 1x1 透明 PNG，避免把二进制样例文件塞进仓库。
    png = bytes.fromhex(
        "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
        "1f15c4890000000a49444154789c636000000200010005fe02fa000000"
        "0049454e44ae426082"
    )
    uploaded = api_client.request_multipart(
        "API-COM-UPLOAD", "POST", "/community/uploads", expected=201,
        token=registered_user["token"],
        files={"file": (f"{unique_id}.png", png, "image/png")},
    ).data
    assert uploaded["url"], "上传接口没有返回可访问的图片地址"

    # 非图片必须被拒（FileStorageService.store 只放行 image/*）。
    # 注意：该接口接收 X-User-Token 但从不校验，未登录同样能上传，这里没有对应的
    # 负向断言——先补上鉴权再补断言，不要用测试把当前行为固化下来。
    api_client.request_multipart(
        "API-COM-UPLOAD-NOT-IMAGE", "POST", "/community/uploads", expected=400,
        token=registered_user["token"],
        files={"file": (f"{unique_id}.txt", b"not an image", "text/plain")},
    )
