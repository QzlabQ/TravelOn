from __future__ import annotations

import json
import re
import tomllib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
API_ROOT = ROOT / "travel-api"
UI_ROOT = ROOT / "travel-ui"


def test_node_and_yarn_versions_are_consistent() -> None:
    mise = tomllib.loads((ROOT / "mise.toml").read_text(encoding="utf-8"))
    package = json.loads((UI_ROOT / "package.json").read_text(encoding="utf-8"))
    dockerfile = (UI_ROOT / "Dockerfile").read_text(encoding="utf-8")

    node_version = mise["tools"]["node"]
    yarn_version = package["packageManager"].removeprefix("yarn@")

    assert node_version == "22.22.3"
    assert yarn_version == "4.2.2"
    assert dockerfile.startswith(f"FROM node:{node_version}-alpine AS build\n")
    assert f"corepack prepare yarn@{yarn_version} --activate" in dockerfile

    tasks = set(mise["tasks"])
    assert {
        "build",
        "ui:dev",
        "ui:build",
        "ui:serve",
        "services:up",
        "services:up_build",
        "services:status",
        "services:stop",
        "services:down",
        "deploy:images",
        "deploy:k3s",
    } <= tasks
    assert {
        "dev",
        "services:logs",
        "services:restart",
        "db:migrate",
        "tickets:generate",
        "tickets:apply",
        "test:report",
        "test:full",
    }.isdisjoint(tasks)
    assert mise["tasks"]["services:up_build"]["run"] == "docker compose up -d --build"


def test_java_version_is_consistent() -> None:
    mise = tomllib.loads((ROOT / "mise.toml").read_text(encoding="utf-8"))
    java_match = re.search(r"(\d+)", mise["tools"]["java"])
    assert java_match
    java_major = java_match.group(1)

    modules = sorted(path.parent for path in API_ROOT.glob("*/pom.xml"))
    assert modules
    for module in modules:
        pom = (module / "pom.xml").read_text(encoding="utf-8")
        dockerfile = (module / "Dockerfile").read_text(encoding="utf-8")
        assert f"<java.version>{java_major}</java.version>" in pom, module.name
        assert f"openjdk-{java_major}" in dockerfile, module.name
        assert f"eclipse-temurin:{java_major}-jre" in dockerfile, module.name


def test_python_host_and_container_versions_are_intentionally_distinct() -> None:
    mise = tomllib.loads((ROOT / "mise.toml").read_text(encoding="utf-8"))
    assert mise["tools"]["python"] == "3.12"

    for relative_path in (
        "ai-arrange-agent-service/Dockerfile",
        "llm-stub/Dockerfile",
    ):
        dockerfile = (API_ROOT / relative_path).read_text(encoding="utf-8")
        assert dockerfile.startswith("FROM python:3.13-slim\n"), relative_path


def test_cd_prune_allowlist_uses_full_group_version_kind() -> None:
    """Keep kubectl's prune allowlist syntax valid for core API resources."""
    scripts = (
        ROOT / "ops" / "runner" / "travelon-deploy-k3s",
        ROOT / "scripts" / "deploy-k3s.sh",
    )
    for script_path in scripts:
        script = script_path.read_text(encoding="utf-8")
        assert "--prune-allowlist=core/v1/Service" in script, script_path
        assert "--prune-allowlist=core/v1/ConfigMap" in script, script_path
        assert "--prune-allowlist=v1/Service" not in script, script_path
        assert "--prune-allowlist=v1/ConfigMap" not in script, script_path


def test_cd_smoke_checks_retry_until_service_discovery_is_stable() -> None:
    """冒烟检查应容忍 Eureka 短暂缓存旧 Pod，但仍保持明确失败上限。"""
    scripts = (
        ROOT / "ops" / "runner" / "travelon-deploy-k3s",
        ROOT / "scripts" / "deploy-k3s.sh",
    )
    expected_checks = (
        "run_smoke_check discovery http://discovery:8010/",
        "run_smoke_check ai-arrange-agent http://ai-arrange-agent:8090/agent/health",
        "run_smoke_check gateway-hotels http://gateway:8082/hotels/destinations 3",
    )
    for script_path in scripts:
        script = script_path.read_text(encoding="utf-8")
        assert "run_smoke_check()" in script, script_path
        assert "local max_attempts=36" in script, script_path
        assert "local retry_delay_seconds=5" in script, script_path
        assert "local command_timeout_seconds=10" in script, script_path
        assert "consecutive_successes >= required_successes" in script, script_path
        for check in expected_checks:
            assert check in script, script_path
