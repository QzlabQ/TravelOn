from __future__ import annotations

import json
import os
import re
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
import pytest


@dataclass
class ApiResponse:
    status_code: int
    data: Any
    text: str


class ApiClient:
    def __init__(self, base_url: str, evidence_dir: Path) -> None:
        self.base_url = base_url.rstrip("/")
        self.evidence_dir = evidence_dir
        self.evidence_dir.mkdir(parents=True, exist_ok=True)
        self.client = httpx.Client(base_url=self.base_url, timeout=90)
        self.run_id = uuid.uuid4().hex[:10]

    def close(self) -> None:
        self.client.close()

    def request(
        self,
        evidence_name: str,
        method: str,
        path: str,
        *,
        expected: int | tuple[int, ...] = 200,
        token: str | None = None,
        json_body: Any = None,
        timeout: float | None = None,
    ) -> ApiResponse:
        safe_name = f"{self.run_id}-{re.sub(r'[^A-Za-z0-9_.-]', '_', evidence_name)}"
        headers = {"Accept": "application/json"}
        if token:
            headers["X-User-Token"] = token
        request_record = {
            "method": method,
            "url": f"{self.base_url}{path}",
            "headers": {**headers, "X-User-Token": "<redacted>"} if token else headers,
            "body": json_body,
        }
        (self.evidence_dir / f"{safe_name}-request.json").write_text(
            json.dumps(request_record, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        response = self.client.request(method, path, headers=headers, json=json_body, timeout=timeout)
        try:
            data = response.json()
            response_text = json.dumps(data, ensure_ascii=False, indent=2)
        except ValueError:
            data = None
            response_text = response.text
        (self.evidence_dir / f"{safe_name}-response.json").write_text(response_text, encoding="utf-8")
        expected_values = (expected,) if isinstance(expected, int) else expected
        assert response.status_code in expected_values, (
            f"{method} {path}: expected {expected_values}, got {response.status_code}: {response.text}"
        )
        return ApiResponse(response.status_code, data, response.text)


@pytest.fixture
def api_client() -> ApiClient:
    client = ApiClient(
        os.getenv("TRAVEL_TEST_GATEWAY_URL", "http://localhost:58082"),
        Path(os.getenv("TRAVEL_TEST_EVIDENCE_DIR", "evidence")),
    )
    try:
        yield client
    finally:
        client.close()


@pytest.fixture
def unique_id() -> str:
    return f"{int(time.time() * 1000)}-{uuid.uuid4().hex[:10]}"


@pytest.fixture
def registered_user(api_client: ApiClient, unique_id: str) -> dict[str, Any]:
    password = "TravelTest123!"
    response = api_client.request(
        f"user-{unique_id}-register",
        "POST",
        "/users/auth/register",
        expected=201,
        json_body={
            "email": f"integration.{unique_id}@example.test",
            "password": password,
            "name": "Integration",
            "surname": "Tester",
            "phone": "13800138000",
        },
    )
    assert response.data["token"]
    assert response.data["user"]["id"]
    return {**response.data, "password": password}
