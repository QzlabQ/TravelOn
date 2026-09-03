"""AI 规划会话的版本管理接口。

test_api_flows.py 只覆盖了建会话、查会话、查快照列表；会话列表、选点更新、按版本取
快照、日计划版本列表/激活/恢复、行程组装这几个接口此前完全没有被调用过。

这里刻意不依赖外部模型：只用 markdown 快照造版本，其余用 404/409 这类结构性断言，
保证没有模型 key 时结果也是确定的。
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest

from conftest import ApiClient


pytestmark = pytest.mark.integration


@pytest.fixture
def conversation(api_client: ApiClient, registered_user: dict) -> dict:
    user_id = registered_user["user"]["id"]
    start = (date.today() + timedelta(days=30)).isoformat()
    end = (date.today() + timedelta(days=32)).isoformat()
    created = api_client.request(
        "API-PLAN-CREATE", "POST", "/ai-arrange/api/conversations", timeout=90,
        json_body={
            "userId": user_id,
            "coreSlots": {
                "city": "Shanghai", "travelStartDate": start, "travelEndDate": end, "peopleCount": 2
            },
        },
    ).data
    # 新建会话只有 latestSnapshotVersion=0 的占位值，并没有实际快照。
    # 选点更新不依赖外部模型，并会建立可供 Markdown 编辑使用的基线快照。
    initialized = api_client.request(
        "API-PLAN-INITIALIZE", "PUT", f"/ai-arrange/api/conversations/{created['id']}/selection",
        json_body={"userId": user_id, "selectedPlaceIds": []},
    ).data
    return {
        "id": created["id"],
        "userId": user_id,
        "baseVersion": initialized["latestSnapshotVersion"],
    }


def test_conversation_list_and_ownership(
    api_client: ApiClient, conversation: dict
) -> None:
    user_id = conversation["userId"]
    listed = api_client.request(
        "API-PLAN-LIST", "GET", f"/ai-arrange/api/conversations?userId={user_id}"
    ).data
    assert conversation["id"] in {item["id"] for item in listed}

    # 换一个 userId 就应该查不到别人的会话——这条链路上没有令牌，userId 就是唯一的归属凭据。
    other_user = uuid.uuid4()
    assert api_client.request(
        "API-PLAN-LIST-OTHER", "GET", f"/ai-arrange/api/conversations?userId={other_user}"
    ).data == []
    api_client.request(
        "API-PLAN-GET-OTHER", "GET",
        f"/ai-arrange/api/conversations/{conversation['id']}?userId={other_user}", expected=404,
    )
    api_client.request(
        "API-PLAN-LIST-NO-USER", "GET", "/ai-arrange/api/conversations", expected=400
    )


def test_message_history_is_scoped_to_the_owner(api_client: ApiClient, conversation: dict) -> None:
    conversation_id, user_id = conversation["id"], conversation["userId"]
    messages = api_client.request(
        "API-PLAN-MESSAGES", "GET",
        f"/ai-arrange/api/conversations/{conversation_id}/messages?userId={user_id}",
    ).data
    # 刚建的会话还没有对话记录，应返回空列表而不是报错。
    assert messages == []

    # 消息历史和会话本身一样按 userId 归属，换个人就取不到。
    api_client.request(
        "API-PLAN-MESSAGES-OTHER", "GET",
        f"/ai-arrange/api/conversations/{conversation_id}/messages?userId={uuid.uuid4()}",
        expected=404,
    )
    api_client.request(
        "API-PLAN-MESSAGES-NO-USER", "GET",
        f"/ai-arrange/api/conversations/{conversation_id}/messages", expected=400,
    )


def test_selection_update_is_persisted(api_client: ApiClient, conversation: dict) -> None:
    conversation_id, user_id = conversation["id"], conversation["userId"]
    place_ids = [str(uuid.uuid4()), str(uuid.uuid4())]
    updated = api_client.request(
        "API-PLAN-SELECTION", "PUT", f"/ai-arrange/api/conversations/{conversation_id}/selection",
        json_body={"userId": user_id, "selectedPlaceIds": place_ids},
    ).data
    assert updated["selectedPlaceIds"] == place_ids

    reread = api_client.request(
        "API-PLAN-SELECTION-REREAD", "GET",
        f"/ai-arrange/api/conversations/{conversation_id}?userId={user_id}",
    ).data
    assert reread["selectedPlaceIds"] == place_ids

    api_client.request(
        "API-PLAN-SELECTION-OTHER", "PUT",
        f"/ai-arrange/api/conversations/{conversation_id}/selection", expected=404,
        json_body={"userId": str(uuid.uuid4()), "selectedPlaceIds": []},
    )


def test_snapshot_versions_can_be_read_and_rolled_back(
    api_client: ApiClient, conversation: dict
) -> None:
    conversation_id, user_id = conversation["id"], conversation["userId"]
    first = api_client.request(
        "API-PLAN-SNAPSHOT-1", "POST",
        f"/ai-arrange/api/conversations/{conversation_id}/markdown-snapshots",
        json_body={
            "userId": user_id, "markdown": "# 第一版\n- 外滩",
            "mode": "TRIP", "baseVersion": conversation["baseVersion"],
        },
    ).data
    second = api_client.request(
        "API-PLAN-SNAPSHOT-2", "POST",
        f"/ai-arrange/api/conversations/{conversation_id}/markdown-snapshots",
        json_body={
            "userId": user_id, "markdown": "# 第二版\n- 外滩\n- 豫园",
            "mode": "TRIP", "baseVersion": first["version"],
        },
    ).data
    assert second["version"] > first["version"]

    fetched = api_client.request(
        "API-PLAN-SNAPSHOT-BY-VERSION", "GET",
        f"/ai-arrange/api/conversations/{conversation_id}/snapshots/{first['version']}?userId={user_id}",
    ).data
    assert fetched["version"] == first["version"]
    assert "第一版" in fetched["markdown"]

    api_client.request(
        "API-PLAN-SNAPSHOT-MISSING", "GET",
        f"/ai-arrange/api/conversations/{conversation_id}/snapshots/9999?userId={user_id}",
        expected=404,
    )

    rolled_back = api_client.request(
        "API-PLAN-ROLLBACK", "POST",
        f"/ai-arrange/api/conversations/{conversation_id}/snapshots/{first['version']}/rollback?userId={user_id}",
        json_body={},
    ).data
    # 回滚产生的是新版本而不是就地改写，历史必须保留。
    assert rolled_back["version"] > second["version"]
    assert "第一版" in rolled_back["markdown"]

    versions = {
        item["version"]
        for item in api_client.request(
            "API-PLAN-SNAPSHOT-LIST", "GET",
            f"/ai-arrange/api/conversations/{conversation_id}/snapshots?userId={user_id}",
        ).data
    }
    assert {first["version"], second["version"], rolled_back["version"]} <= versions


def test_day_plan_version_endpoints_reject_unknown_versions(
    api_client: ApiClient, conversation: dict
) -> None:
    conversation_id, user_id = conversation["id"], conversation["userId"]

    # 基线快照还没有日计划，版本列表应为空而不是报错。
    assert api_client.request(
        "API-PLAN-DAY-VERSIONS", "GET",
        f"/ai-arrange/api/conversations/{conversation_id}/day-plans/1/versions?userId={user_id}",
    ).data == []

    api_client.request(
        "API-PLAN-DAY-ACTIVATE-MISSING", "POST",
        f"/ai-arrange/api/conversations/{conversation_id}/day-plans/1/versions/99/activate?userId={user_id}",
        expected=404, json_body={},
    )
    api_client.request(
        "API-PLAN-DAY-ACTIVATE-INVALID", "POST",
        f"/ai-arrange/api/conversations/{conversation_id}/day-plans/1/versions/0/activate?userId={user_id}",
        expected=400, json_body={},
    )
    api_client.request(
        "API-PLAN-DAY-RESTORE-MISSING", "POST",
        f"/ai-arrange/api/conversations/{conversation_id}/day-plans/1/snapshots/9999/restore?userId={user_id}",
        expected=404, json_body={},
    )


def test_assemble_requires_day_plans(api_client: ApiClient, conversation: dict) -> None:
    conversation_id, user_id = conversation["id"], conversation["userId"]
    # 一份日计划都没有时组装必须被拒绝（409），而不是产出一份空行程。
    api_client.request(
        "API-PLAN-ASSEMBLE-EMPTY", "POST",
        f"/ai-arrange/api/conversations/{conversation_id}/day-plans/assemble?userId={user_id}",
        expected=409, json_body={},
    )
