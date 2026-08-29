#!/usr/bin/env python3
"""Cross-platform test orchestrator for TravelOn."""

from __future__ import annotations

import argparse
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import time
import urllib.request
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Sequence


ROOT = Path(__file__).resolve().parents[1]
API_ROOT = ROOT / "travel-api"
UI_ROOT = ROOT / "travel-ui"
DEFAULT_ARTIFACTS = ROOT / "artifacts" / "test-results"
JAVA_MODULES = tuple(sorted(path.parent for path in API_ROOT.glob("*/pom.xml")))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")


ESC = chr(27)
CR = chr(13)


def _enable_windows_ansi() -> bool:
    """Windows 控制台默认不解析 ANSI 序列，尝试打开 VT 模式；失败则退回无颜色输出。"""
    if os.name != "nt":
        return True
    try:
        import ctypes

        kernel32 = ctypes.windll.kernel32
        handle = kernel32.GetStdHandle(-11)  # STD_OUTPUT_HANDLE
        mode = ctypes.c_uint32()
        if not kernel32.GetConsoleMode(handle, ctypes.byref(mode)):
            return False
        return bool(kernel32.SetConsoleMode(handle, mode.value | 4))  # ENABLE_VIRTUAL_TERMINAL_PROCESSING
    except Exception:  # noqa: BLE001
        return False


def _encodable(text: str) -> bool:
    try:
        text.encode(sys.stdout.encoding or "utf-8")
    except (UnicodeEncodeError, LookupError):
        return False
    return True


IS_TTY = bool(getattr(sys.stdout, "isatty", lambda: False)())
USE_COLOR = IS_TTY and not os.environ.get("NO_COLOR") and _enable_windows_ansi()
# 旧版 Windows 控制台代码页可能无法编码这些字符，此时整体退回 ASCII。
UNICODE_OK = _encodable("✓✗█░")

GREEN, RED, DIM, BOLD = "32", "31", "2", "1"
MARK_PASS = "✓" if UNICODE_OK else "OK"
MARK_FAIL = "✗" if UNICODE_OK else "XX"
BAR_FULL = "█" if UNICODE_OK else "#"
BAR_EMPTY = "░" if UNICODE_OK else "-"


def paint(text: str, code: str) -> str:
    return ESC + "[" + code + "m" + text + ESC + "[0m" if USE_COLOR else text


@dataclass
class Result:
    name: str
    category: str
    command: list[str]
    status: str
    duration_seconds: float
    log: str


class Progress:
    """终端进度显示。子进程输出仍然只写日志文件，这里只呈现进度、结果和耗时。"""

    def __init__(self, category: str, total: int) -> None:
        self.category = category
        self.total = total
        self.done = 0
        self._line_open = False
        self._last_note = 0.0
        print()
        print(paint(f"== {category} ==", BOLD), f"共 {total} 项")
        sys.stdout.flush()

    def _bar(self, width: int = 20) -> str:
        filled = round(width * self.done / self.total) if self.total else width
        return f"[{BAR_FULL * filled}{BAR_EMPTY * (width - filled)}] {self.done}/{self.total}"

    def _clear(self) -> None:
        if self._line_open:
            print(CR + " " * 90 + CR, end="", flush=True)
            self._line_open = False

    def start(self, name: str) -> None:
        self._last_note = 0.0
        if IS_TTY:
            print(CR + f"{self._bar()} {name} 运行中…", end="", flush=True)
            self._line_open = True
        else:
            print(f"  [{self.done + 1}/{self.total}] {name} 开始", flush=True)

    def tick(self, name: str, elapsed: float, detail: str = "") -> None:
        """任务运行期间刷新耗时，避免长任务（E2E、前端构建）中途完全静默。"""
        suffix = f"  {detail}" if detail else ""
        text = f"{self._bar()} {name} {int(elapsed)}s{suffix}"
        if IS_TTY:
            print(CR + text.ljust(88)[:88], end="", flush=True)
            self._line_open = True
        elif elapsed - self._last_note >= 30:
            self._last_note = elapsed
            print(f"  [{self.done + 1}/{self.total}] {name} {int(elapsed)}s{suffix}", flush=True)

    def finish(self, result: Result) -> Result:
        self.done += 1
        self._clear()
        passed = result.status == "passed"
        mark = paint(MARK_PASS, GREEN) if passed else paint(MARK_FAIL, RED)
        tail = "" if passed else "  " + paint(f"日志：{result.log}", DIM)
        print(f"{self._bar()} {mark} {result.name} {result.duration_seconds}s{tail}", flush=True)
        return result

    def note(self, text: str) -> None:
        self._clear()
        print(paint(f"  · {text}", DIM), flush=True)


def command_version(command: Sequence[str], cwd: Path = ROOT) -> str:
    completed = subprocess.run(command, cwd=cwd, text=True, capture_output=True, check=False)
    return (completed.stdout or completed.stderr).strip().splitlines()[0] if (completed.stdout or completed.stderr) else ""


def require_command(name: str, remediation: str) -> str:
    resolved = shutil.which(name)
    if not resolved:
        raise RuntimeError(f"缺少必需工具 {name}。{remediation}")
    return resolved


def preflight(category: str, browser: str) -> dict[str, str]:
    versions: dict[str, str] = {"os": platform.platform(), "python": platform.python_version()}
    if sys.version_info[:2] != (3, 12):
        raise RuntimeError(f"需要 Python 3.12，当前为 {platform.python_version()}。请使用 Python 3.12 重新运行本脚本。")

    java = require_command("java", "请安装 JDK 21 并配置 PATH。")
    versions["java"] = command_version([java, "-version"])
    java_match = re.search(r'"(\d+)', versions["java"])
    if not java_match or java_match.group(1) != "21":
        raise RuntimeError(f"需要 Java 21，当前检测结果：{versions['java']}")

    if category in {"unit", "e2e", "all", "full"}:
        node = require_command("node", "请安装 Node.js 22.22.3。")
        versions["node"] = command_version([node, "--version"])
        if versions["node"].lstrip("v") != "22.22.3":
            raise RuntimeError(f"需要 Node.js 22.22.3，当前为 {versions['node']}。")
        corepack = require_command("corepack", "Node.js 安装后请启用 Corepack。")
        versions["corepack"] = command_version([corepack, "--version"])
        versions["yarn"] = command_version([corepack, "yarn", "--version"], cwd=UI_ROOT)
        if versions["yarn"] != "4.2.2":
            raise RuntimeError(f"需要 Yarn 4.2.2，当前为 {versions['yarn']}。")

    if category in {"integration", "e2e", "all", "full"}:
        docker = require_command("docker", "请安装并启动 Docker Desktop 或 Docker Engine。")
        versions["docker"] = command_version([docker, "--version"])
        compose = subprocess.run([docker, "compose", "version"], text=True, capture_output=True, check=False)
        if compose.returncode != 0:
            raise RuntimeError("需要 Docker Compose V2（docker compose）。")
        versions["compose"] = compose.stdout.strip()

    try:
        import httpx  # noqa: F401
        import pytest  # noqa: F401
    except ImportError as exc:
        # 注意不要直接推荐 sys.executable：mise 首次创建 .venv 的那一次调用里，
        # PATH 尚未包含 .venv/Scripts，sys.executable 会指向 mise 自带的解释器，
        # 照着装会污染全局环境而 .venv 依然缺依赖。
        venv_python = ROOT / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
        hint = f"{venv_python} -m pip install -r {ROOT / 'tests' / 'requirements.txt'}"
        if not venv_python.exists():
            hint = f"先创建 Python 3.12 虚拟环境，再执行：{hint}"
        raise RuntimeError(
            "缺少 Python 测试依赖。使用 mise 时执行：mise run setup:py"
            f"；否则执行：{hint}"
        ) from exc

    if category in {"e2e", "all", "full"} and browser:
        browser_cache = Path(os.environ.get("PLAYWRIGHT_BROWSERS_PATH", Path.home() / ".cache" / "ms-playwright"))
        if platform.system() == "Windows":
            browser_cache = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "ms-playwright"
        if not browser_cache.exists():
            raise RuntimeError("未发现 Playwright 浏览器。请在 travel-ui 执行 yarn playwright install chromium。")
    return versions


def corepack_command(args: Sequence[str]) -> list[str]:
    """Windows 上 corepack 是 .CMD 脚本，CreateProcess 不按 PATHEXT 解析，必须传完整路径。"""
    return [require_command("corepack", "Node.js 安装后请启用 Corepack。"), *args]


def maven_command(module: Path) -> list[str]:
    wrapper = module / ("mvnw.cmd" if os.name == "nt" else "mvnw")
    if not wrapper.exists():
        raise RuntimeError(f"{module.name} 缺少 Maven Wrapper。")
    return [str(wrapper)] if os.name == "nt" else ["sh", str(wrapper)]


def run_process(
    name: str,
    category: str,
    command: Sequence[str],
    cwd: Path,
    artifacts: Path,
    progress: Progress | None = None,
    env: dict[str, str] | None = None,
    log_name: str | None = None,
    detail_fn: "Callable[[Path], str] | None" = None,
) -> Result:
    log_dir = artifacts / category / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / f"{log_name or name}.log"
    if progress:
        progress.start(name)
    started = time.monotonic()
    with log_path.open("w", encoding="utf-8") as log:
        process = subprocess.Popen(
            list(command), cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT
        )
        while True:
            # 用 wait(timeout) 而非 poll()+sleep：进程一结束立即返回，耗时不会被量化到整秒
            try:
                returncode = process.wait(timeout=1.0)
                break
            except subprocess.TimeoutExpired:
                if progress:
                    elapsed = time.monotonic() - started
                    progress.tick(name, elapsed, detail_fn(log_path) if detail_fn else "")
    result = Result(
        name=name,
        category=category,
        command=list(command),
        status="passed" if returncode == 0 else "failed",
        duration_seconds=round(time.monotonic() - started, 2),
        log=str(log_path.relative_to(ROOT)).replace(chr(92), "/"),
    )
    return progress.finish(result) if progress else result


def compose(
    args: Sequence[str], check: bool = True, env: dict[str, str] | None = None
) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(
        ["docker", "compose", "-f", str(API_ROOT / "docker-compose.yml"), *args],
        cwd=API_ROOT,
        text=True,
        capture_output=True,
        check=False,
        env=env,
    )
    if check and completed.returncode != 0:
        # CalledProcessError 只会显示命令和退出码，Docker 的真实报错在 stderr 里，必须原样带出。
        detail = (completed.stderr or completed.stdout or "").strip()
        raise RuntimeError(
            f"docker compose {' '.join(args)} 失败（退出码 {completed.returncode}）："
            + (chr(10) + detail if detail else "无输出")
        )
    return completed


class ManagedServices:
    def __init__(
        self,
        enabled: bool,
        gateway_url: str,
        short_payment_timeout: bool = False,
        build: bool = True,
    ) -> None:
        self.enabled = enabled
        self.gateway_url = gateway_url.rstrip("/")
        self.preexisting: set[str] = set()
        self.started: set[str] = set()
        self.short_payment_timeout = short_payment_timeout
        self.build = build

    def __enter__(self) -> "ManagedServices":
        if not self.enabled:
            return self
        before = compose(["ps", "--services", "--status", "running"], check=False)
        self.preexisting = {line.strip() for line in before.stdout.splitlines() if line.strip()}
        compose_env = os.environ.copy()
        if self.short_payment_timeout and not self.preexisting:
            compose_env["APP_PAYMENT_TIMEOUT_SECONDS"] = "10"
        try:
            print()
            print(paint("== 服务栈 ==", BOLD))
            up_args = ["up", "-d", "--build"] if self.build else ["up", "-d"]
            hint = "（首次构建可能较久）" if self.build else "（--no-build：使用已有镜像，可能滞后于当前源码）"
            print(paint(f"  · docker compose {' '.join(up_args)}{hint}", DIM), flush=True)
            compose(up_args, env=compose_env)
            after = compose(["ps", "--services", "--status", "running"], check=False)
            self.started = {line.strip() for line in after.stdout.splitlines() if line.strip()} - self.preexisting
            print(paint(f"  · 本次新启动 {len(self.started)} 个服务，此前已运行 {len(self.preexisting)} 个", DIM), flush=True)
            deadline = time.monotonic() + 1200
            last_error = ""
            waited = 0
            while time.monotonic() < deadline:
                try:
                    with urllib.request.urlopen(f"{self.gateway_url}/hotels/destinations", timeout=10) as response:
                        if response.status == 200:
                            if waited:
                                print()
                            print(paint(f"  {MARK_PASS} Gateway 就绪，等待 {waited}s", GREEN), flush=True)
                            return self
                except Exception as exc:  # noqa: BLE001
                    last_error = str(exc)
                time.sleep(5)
                waited += 5
                if IS_TTY:
                    print(CR + paint(f"  · 等待 Gateway 就绪… {waited}s / 1200s", DIM), end="", flush=True)
                elif waited % 60 == 0:
                    print(paint(f"  · 等待 Gateway 就绪… {waited}s / 1200s", DIM), flush=True)
            if waited and IS_TTY:
                print()
            raise RuntimeError(f"等待 Gateway 就绪超时：{last_error}")
        except Exception:
            after = compose(["ps", "--services", "--status", "running"], check=False)
            self.started = {line.strip() for line in after.stdout.splitlines() if line.strip()} - self.preexisting
            if self.started:
                compose(["stop", *sorted(self.started)], check=False)
            raise

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> None:
        if self.enabled and self.started:
            compose(["stop", *sorted(self.started)], check=False)


def playwright_progress(log_path: Path) -> str:
    """从 Playwright list reporter 的日志解析用例进度。

    并行执行时行首数字是用例序号而非完成数，因此统计匹配行数；失败详情会把日志
    撑大，只读尾部会丢掉开头的 "Running N tests"，所以读取范围放宽到 1 MB。
    """
    try:
        with log_path.open("rb") as handle:
            handle.seek(0, os.SEEK_END)
            handle.seek(max(0, handle.tell() - 1_000_000))
            text = handle.read().decode("utf-8", errors="replace")
    except OSError:
        return ""
    # 每个用例完成时输出形如 "  ✓  3 [chromium] › file:line › title (3.2s)"
    done = len(re.findall(r"^\s*\S{1,3}\s+\d+\s+\[", text, re.M))
    totals = re.findall(r"Running (\d+) test", text)
    if totals:
        return f"用例 {done}/{totals[0]}"
    if done:
        return f"已完成 {done} 个用例"
    return "准备中（构建并启动前端）…"


def run_unit(args: argparse.Namespace, artifacts: Path) -> list[Result]:
    selected = set(args.module or [])
    jobs: list[tuple[str, list[str], Path]] = []
    for module in JAVA_MODULES:
        if selected and module.name not in selected:
            continue
        jobs.append((module.name, [*maven_command(module), "test", "jacoco:report"], module))
    if not selected or "ai-arrange-agent-service" in selected:
        junit = artifacts / "unit" / "python" / "junit.xml"
        junit.parent.mkdir(parents=True, exist_ok=True)
        jobs.append((
            "ai-arrange-agent-service",
            [sys.executable, "-m", "pytest", "-q", "tests/unit", f"--junitxml={junit}"],
            API_ROOT / "ai-arrange-agent-service",
        ))
    if not selected or "travel-ui" in selected:
        frontend_json = artifacts / "unit" / "ui" / "jest-results.json"
        frontend_json.parent.mkdir(parents=True, exist_ok=True)
        jobs.append((
            "travel-ui",
            corepack_command(["yarn", "test:unit:coverage", "--json", "--outputFile", str(frontend_json)]),
            UI_ROOT,
        ))
    progress = Progress("unit", len(jobs))
    return [run_process(name, "unit", command, cwd, artifacts, progress) for name, command, cwd in jobs]


def run_integration(args: argparse.Namespace, artifacts: Path, include_heavy: bool = False) -> list[Result]:
    selected = set(args.module or [])
    jobs: list[tuple[str, list[str], Path, dict[str, str] | None]] = []
    for module in JAVA_MODULES:
        if selected and module.name not in selected:
            continue
        command = [*maven_command(module), "test-compile", "failsafe:integration-test", "failsafe:verify", "jacoco:report"]
        jobs.append((f"{module.name}-it", command, module, None))
    if not selected or "ai-arrange-agent-service" in selected:
        junit = artifacts / "integration" / "python-agent-junit.xml"
        jobs.append((
            "ai-arrange-agent-service-it",
            [sys.executable, "-m", "pytest", "-q", "tests/integration", f"--junitxml={junit}"],
            API_ROOT / "ai-arrange-agent-service",
            None,
        ))
    if not selected or "api" in selected:
        marker = "integration" if include_heavy else "integration and not external and not disruptive"
        junit = artifacts / "integration" / "api-junit.xml"
        evidence = artifacts / "integration" / "evidence"
        env = os.environ.copy()
        env.update({
            "TRAVEL_TEST_GATEWAY_URL": args.gateway_url,
            "TRAVEL_TEST_EUREKA_URL": args.eureka_url,
            "TRAVEL_TEST_EVIDENCE_DIR": str(evidence),
        })
        jobs.append((
            "api",
            [sys.executable, "-m", "pytest", "-q", "-m", marker, f"--junitxml={junit}"],
            API_ROOT / "tests",
            env,
        ))
    progress = Progress("integration", len(jobs))
    return [
        run_process(name, "integration", command, cwd, artifacts, progress, env=env)
        for name, command, cwd, env in jobs
    ]


def run_e2e(args: argparse.Namespace, artifacts: Path) -> list[Result]:
    command = corepack_command(["yarn", "playwright", "test", "--project", args.browser])
    if args.browser == "all":
        command = corepack_command(["yarn", "test:e2e:all"])
    env = os.environ.copy()
    env.update({
        "TRAVEL_UI_URL": args.ui_url,
        "PLAYWRIGHT_REPORT_DIR": str(artifacts / "e2e"),
    })
    progress = Progress("e2e", 1)
    return [
        run_process(
            "travel-ui-e2e", "e2e", command, UI_ROOT, artifacts, progress,
            env=env, log_name="playwright", detail_fn=playwright_progress
        )
    ]


def write_summary(results: list[Result], artifacts: Path, versions: dict[str, str]) -> None:
    artifacts.mkdir(parents=True, exist_ok=True)
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "overallStatus": "passed" if all(result.status == "passed" for result in results) else "failed",
        "versions": versions,
        "results": [asdict(result) for result in results],
    }
    (artifacts / "summary.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = ["# 测试汇总", "", f"- 总体状态：{payload['overallStatus']}", "", "| 类别 | 模块 | 状态 | 用时（秒） | 日志 |", "| --- | --- | --- | ---: | --- |"]
    for result in results:
        lines.append(f"| {result.category} | {result.name} | {result.status} | {result.duration_seconds} | `{result.log}` |")
    (artifacts / "latest.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def print_summary(results: list[Result], artifacts: Path) -> None:
    failed = [result for result in results if result.status != "passed"]
    elapsed = round(sum(result.duration_seconds for result in results), 1)
    print()
    print(paint("== 汇总 ==", BOLD))
    passed_text = paint(str(len(results) - len(failed)), GREEN)
    failed_text = paint(str(len(failed)), RED if failed else DIM)
    print(f"  通过 {passed_text} / 失败 {failed_text} / 共 {len(results)}，累计耗时 {elapsed}s")
    for result in failed:
        print(f"  {paint(MARK_FAIL, RED)} {result.category}/{result.name}  日志：{result.log}")
    print(paint(f"  报告：{artifacts / 'latest.md'}", DIM))
    verdict = paint("全部通过", GREEN) if not failed else paint(f"{len(failed)} 项失败", RED)
    print(f"  结果：{verdict}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="TravelOn 跨平台测试入口")
    parser.add_argument("category", choices=("unit", "integration", "e2e", "all", "full"))
    parser.add_argument("--module", action="append", help="只运行指定模块，可重复")
    parser.add_argument("--manage-services", action="store_true", help="自动启动并恢复 Docker 服务")
    parser.add_argument(
        "--no-build",
        action="store_true",
        help=(
            "启动服务时跳过 docker compose --build，直接使用本地已有镜像"
            "（离线或 Docker Hub 不可达时用；镜像可能滞后于当前源码，失败结果需自行甄别）"
        ),
    )
    parser.add_argument("--gateway-url", default="http://localhost:58082")
    parser.add_argument("--eureka-url", default="http://localhost:58010")
    parser.add_argument("--ui-url", default="http://localhost:53000")
    parser.add_argument("--browser", choices=("chromium", "firefox", "webkit", "all"))
    parser.add_argument("--artifacts-dir", type=Path, default=DEFAULT_ARTIFACTS)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    args.browser = args.browser or ("all" if args.category == "full" else "chromium")
    artifacts = args.artifacts_dir.resolve()
    try:
        print(paint("== 环境预检 ==", BOLD), flush=True)
        versions = preflight(args.category, args.browser)
        for key in ("os", "python", "java", "node", "yarn", "docker"):
            if versions.get(key):
                print(paint(f"  {key:<7} {versions[key]}", DIM))
        print(paint(f"  {MARK_PASS} 预检通过", GREEN), flush=True)
        results: list[Result] = []
        needs_services = args.category in {"integration", "e2e", "all", "full"}
        with ManagedServices(
            args.manage_services and needs_services,
            args.gateway_url,
            short_payment_timeout=args.category == "full",
            build=not args.no_build,
        ):
            if args.category in {"unit", "all", "full"}:
                results.extend(run_unit(args, artifacts))
            if args.category in {"integration", "all", "full"}:
                results.extend(run_integration(args, artifacts, include_heavy=args.category == "full"))
            if args.category in {"e2e", "all", "full"}:
                results.extend(run_e2e(args, artifacts))
        write_summary(results, artifacts, versions)
        print_summary(results, artifacts)
        return 0 if all(result.status == "passed" for result in results) else 1
    except RuntimeError as exc:
        print(paint(f"{MARK_FAIL} 预检或执行失败：{exc}", RED), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
