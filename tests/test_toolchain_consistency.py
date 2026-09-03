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
