#!/usr/bin/env python3
"""Build every TravelOn application with the repository-pinned toolchain."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Sequence


ROOT = Path(__file__).resolve().parents[1]
API_ROOT = ROOT / "travel-api"
UI_ROOT = ROOT / "travel-ui"
AGENT_ROOT = API_ROOT / "ai-arrange-agent-service"
JAVA_MODULES = tuple(sorted(path.parent for path in API_ROOT.glob("*/pom.xml")))


def run(label: str, command: Sequence[str], cwd: Path) -> None:
    print(f"\n== {label} ==", flush=True)
    completed = subprocess.run(list(command), cwd=cwd, check=False)
    if completed.returncode != 0:
        raise SystemExit(f"{label} failed with exit code {completed.returncode}")


def maven_command(module: Path) -> list[str]:
    if os.name == "nt":
        return [str(module / "mvnw.cmd")]
    return ["sh", "./mvnw"]


def required_command(name: str) -> str:
    command = shutil.which(name)
    if not command:
        raise SystemExit(f"Cannot find {name}; run mise install, then use mise run build.")
    return command


def main() -> int:
    for module in JAVA_MODULES:
        run(
            f"Java - {module.name}",
            [
                *maven_command(module),
                "--batch-mode",
                "--no-transfer-progress",
                "-DskipTests",
                "package",
            ],
            module,
        )

    run(
        "Python - ai-arrange-agent-service",
        [sys.executable, "-m", "compileall", "-q", "app"],
        AGENT_ROOT,
    )
    run(
        "Frontend - travel-ui",
        [required_command("corepack"), "yarn", "build"],
        UI_ROOT,
    )
    print("\nAll application builds passed.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
