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
        return self._check(method, path, expected, response, data, response_text)

    def request_multipart(
        self,
        evidence_name: str,
        method: str,
        path: str,
        *,
        files: dict[str, tuple[str, bytes, str]],
        expected: int | tuple[int, ...] = 200,
        token: str | None = None,
        timeout: float | None = None,
    ) -> ApiResponse:
        """multipart 上传。证据里只记录文件名与大小，不落盘文件内容。"""
        safe_name = f"{self.run_id}-{re.sub(r'[^A-Za-z0-9_.-]', '_', evidence_name)}"
        headers = {"Accept": "application/json"}
        if token:
            headers["X-User-Token"] = token
        request_record = {
            "method": method,
            "url": f"{self.base_url}{path}",
            "headers": {**headers, "X-User-Token": "<redacted>"} if token else headers,
            "files": {
                field: {"filename": filename, "contentType": content_type, "bytes": len(content)}
                for field, (filename, content, content_type) in files.items()
            },
        }
        (self.evidence_dir / f"{safe_name}-request.json").write_text(
            json.dumps(request_record, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        response = self.client.request(method, path, headers=headers, files=files, timeout=timeout)
        try:
            data = response.json()
            response_text = json.dumps(data, ensure_ascii=False, indent=2)
        except ValueError:
            data = None
            response_text = response.text
        (self.evidence_dir / f"{safe_name}-response.json").write_text(response_text, encoding="utf-8")
        return self._check(method, path, expected, response, data, response_text)

    @staticmethod
    def _check(
        method: str,
        path: str,
        expected: int | tuple[int, ...],
        response: httpx.Response,
        data: Any,
        response_text: str,
    ) -> ApiResponse:
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


def admin_credentials() -> tuple[str, str]:
    """管理员凭据：环境变量优先，其次仓库根目录的 admin_account.txt。"""
    email = os.getenv("ADMIN_EMAIL", "")
    password = os.getenv("ADMIN_PASSWORD", "")
    repo_root = Path(__file__).resolve().parents[2]
    account_file = Path(os.getenv("ADMIN_ACCOUNT_FILE", str(repo_root / "admin_account.txt")))
    if (not email or not password) and account_file.exists():
        values: dict[str, str] = {}
        for line in account_file.read_text(encoding="utf-8").splitlines():
            key, separator, value = line.partition(":")
            if separator:
                values[key.strip()] = value.strip()
        email = email or values.get("email", "")
        password = password or values.get("password", "")
    return email, password


@pytest.fixture
def admin_token(api_client: ApiClient) -> str:
    """后台接口用例的管理员令牌；没有凭据时跳过，不影响其它用例。"""
    email, password = admin_credentials()
    if not email or not password:
        pytest.skip("需要 ADMIN_EMAIL/ADMIN_PASSWORD 或仓库根目录 admin_account.txt")
    return api_client.request(
        "admin-login", "POST", "/users/auth/login",
        json_body={"email": email, "password": password},
    ).data["token"]
