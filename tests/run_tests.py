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
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Sequence


ROOT = Path(__file__).resolve().parents[1]
API_ROOT = ROOT / "travel-api"
UI_ROOT = ROOT / "travel-ui"
DEFAULT_ARTIFACTS = ROOT / "artifacts" / "test-results"
MIGRATION_TEST = ROOT / "tests" / "migration" / "run_migration_test.py"
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
    # 任务内部真正执行的用例数。进度条本身按任务计数（一个模块一个子进程），
    # 只看 "3/10" 无法判断跑了多少测试，这两个字段用来把粒度补到用例级。
    cases: int = 0
    cases_failed: int = 0


class Progress:
    """终端进度显示。子进程输出仍然只写日志文件，这里只呈现进度、结果和耗时。"""

    def __init__(self, category: str, total: int) -> None:
        self.category = category
        self.total = total
        self.done = 0
        self.cases = 0
        self.cases_failed = 0
        self._line_open = False
        self._last_note = 0.0
        print()
        print(paint(f"== {category} ==", BOLD), f"共 {total} 项")
        sys.stdout.flush()

    def _bar(self, width: int = 20, fraction: float | None = None) -> str:
        """fraction 是当前任务的完成比例，只有能拿到真实用例总数时才传。

        E2E 只有一个任务，跑五分钟条子一格不动；有了 fraction，条子按用例推进，
        而 done/total 仍然如实显示任务数，不会把两种口径混为一谈。
        """
        progress = self.done + min(max(fraction or 0.0, 0.0), 1.0)
        filled = round(width * progress / self.total) if self.total else width
        filled = min(filled, width)
        # 已完成任务累计的用例数：进度条按任务走，这里让读者同时看到测试量。
        cases = f" · 累计 {self.cases} 用例" if self.cases else ""
        return f"[{BAR_FULL * filled}{BAR_EMPTY * (width - filled)}] {self.done}/{self.total}{cases}"

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

    def tick(self, name: str, elapsed: float, detail: str = "", fraction: float | None = None) -> None:
        """任务运行期间刷新耗时，避免长任务（E2E、前端构建）中途完全静默。"""
        suffix = f"  {detail}" if detail else ""
        text = f"{self._bar(fraction=fraction)} {name} {int(elapsed)}s{suffix}"
        if IS_TTY:
            print(CR + text.ljust(88)[:88], end="", flush=True)
            self._line_open = True
        elif elapsed - self._last_note >= 30:
            self._last_note = elapsed
            print(f"  [{self.done + 1}/{self.total}] {name} {int(elapsed)}s{suffix}", flush=True)

    def finish(self, result: Result) -> Result:
        self.done += 1
        self.cases += result.cases
        self.cases_failed += result.cases_failed
        self._clear()
        passed = result.status == "passed"
        mark = paint(MARK_PASS, GREEN) if passed else paint(MARK_FAIL, RED)
        tail = "" if passed else "  " + paint(f"日志：{result.log}", DIM)
        cases = ""
        if result.cases:
            failed = f"，{result.cases_failed} 失败" if result.cases_failed else ""
            cases = paint(f"  {result.cases} 条用例{failed}", DIM)
        print(f"{self._bar()} {mark} {result.name} {result.duration_seconds}s{cases}{tail}", flush=True)
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

    if category != "migration":
        java = require_command("java", "请安装 JDK 21 并配置 PATH。")
        versions["java"] = command_version([java, "-version"])
        java_match = re.search(r'"(\d+)', versions["java"])
        if not java_match or java_match.group(1) != "21":
            raise RuntimeError(f"需要 Java 21，当前检测结果：{versions['java']}")

    if category in {"unit", "e2e", "ci"}:
        node = require_command("node", "请安装 Node.js 22.22.3。")
        versions["node"] = command_version([node, "--version"])
        if versions["node"].lstrip("v") != "22.22.3":
            raise RuntimeError(f"需要 Node.js 22.22.3，当前为 {versions['node']}。")
        corepack = require_command("corepack", "Node.js 安装后请启用 Corepack。")
        versions["corepack"] = command_version([corepack, "--version"])
        versions["yarn"] = command_version([corepack, "yarn", "--version"], cwd=UI_ROOT)
        if versions["yarn"] != "4.2.2":
            raise RuntimeError(f"需要 Yarn 4.2.2，当前为 {versions['yarn']}。")

    if category in {"migration", "integration", "e2e", "ci"}:
        docker = require_command("docker", "请安装并启动 Docker Desktop 或 Docker Engine。")
        versions["docker"] = command_version([docker, "--version"])
        compose = subprocess.run([docker, "compose", "version"], text=True, capture_output=True, check=False)
        if compose.returncode != 0:
            raise RuntimeError("需要 Docker Compose V2（docker compose）。")
        versions["compose"] = compose.stdout.strip()

    if category != "migration":
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

    if category in {"e2e", "ci"} and browser:
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
    fraction_fn: "Callable[[Path], float | None] | None" = None,
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
                    progress.tick(
                        name,
                        elapsed,
                        (detail_fn or case_progress)(log_path),
                        fraction_fn(log_path) if fraction_fn else None,
                    )
    cases, cases_failed = parse_case_counts(read_log_tail(log_path)) or (0, 0)
    result = Result(
        name=name,
        category=category,
        command=list(command),
        status="passed" if returncode == 0 else "failed",
        duration_seconds=round(time.monotonic() - started, 2),
        log=str(log_path.relative_to(ROOT)).replace(chr(92), "/"),
        cases=cases,
        cases_failed=cases_failed,
    )
    return progress.finish(result) if progress else result


def compose(
    args: Sequence[str], check: bool = True, env: dict[str, str] | None = None
) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(
        ["docker", "compose", "-f", str(API_ROOT / "docker-compose.yml"), "--profile", "test", *args],
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


# 经网关探测有 HTTP 路由的服务，判断后端是否真的可路由。网关在目标服务没有可用实例时返回 503，
# 因此只要状态码不是 503（哪怕是 401/404）就说明该服务已注册且路由已刷新。
# 只等 travel-core-service 的酒店路由是不够的：Eureka 注册成功后网关仍有最长 30 秒的注册表缓存，
# 期间下单等请求会被打到没有实例的路由上而失败。
GATEWAY_PROBES = (
    ("travel-core-service (hotels)", "/hotels/destinations"),
    ("travel-core-service (transports)", "/transports/tickets/options?type=TRAIN"),
    ("user-service", "/users/auth/ping"),
    ("order-service", "/reservations/ping"),
    ("community-service", "/community/posts"),
)


def routable(gateway_url: str, path: str) -> bool:
    """经网关请求 path，只要不是 503（无可用实例）即视为该服务已可路由。"""
    try:
        with urllib.request.urlopen(f"{gateway_url.rstrip('/')}{path}", timeout=10) as response:
            return response.status != 503
    except urllib.error.HTTPError as exc:
        return exc.code != 503
    except Exception:  # noqa: BLE001
        return False


class ManagedServices:
    def __init__(
        self,
        enabled: bool,
        gateway_url: str,
        build: bool = True,
    ) -> None:
        self.enabled = enabled
        self.gateway_url = gateway_url.rstrip("/")
        self.preexisting: set[str] = set()
        self.started: set[str] = set()
        self.build = build

    def __enter__(self) -> "ManagedServices":
        if not self.enabled:
            return self
        before = compose(["ps", "--services", "--status", "running"], check=False)
        self.preexisting = {line.strip() for line in before.stdout.splitlines() if line.strip()}
        compose_env = os.environ.copy()
        compose_env.update({
            "AI_BASE_URL": "http://llm-stub:9099",
            "AI_CHAT_COMPLETIONS_PATH": "/v1/chat/completions",
            "AI_API_KEY": "e2e-stub-key",
            "AI_MODEL": "stub-model",
        })
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
            waited = 0
            pending = [name for name, _ in GATEWAY_PROBES]
            while time.monotonic() < deadline:
                pending = [name for name, path in GATEWAY_PROBES if not self._routable(path)]
                if not pending:
                    if waited and IS_TTY:
                        print()
                    print(paint(f"  {MARK_PASS} 全部服务经网关可路由，等待 {waited}s", GREEN), flush=True)
                    return self
                time.sleep(5)
                waited += 5
                note = f"  · 等待服务就绪… {waited}s / 1200s（未就绪：{', '.join(pending)}）"
                if IS_TTY:
                    print(CR + paint(note.ljust(88)[:88], DIM), end="", flush=True)
                elif waited % 60 == 0:
                    print(paint(note, DIM), flush=True)
            last_error = "未就绪：" + ", ".join(pending)
            if waited and IS_TTY:
                print()
            raise RuntimeError(f"等待 Gateway 就绪超时：{last_error}")
        except Exception:
            after = compose(["ps", "--services", "--status", "running"], check=False)
            self.started = {line.strip() for line in after.stdout.splitlines() if line.strip()} - self.preexisting
            if self.started:
                compose(["stop", *sorted(self.started)], check=False)
            raise

    def _routable(self, path: str) -> bool:
        return routable(self.gateway_url, path)

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> None:
        if self.enabled and self.started:
            compose(["stop", *sorted(self.started)], check=False)


def read_log_tail(log_path: Path, limit: int = 1_000_000) -> str:
    """读取日志尾部。失败详情会把日志撑大，但进度信息都在末尾，1 MB 足够。"""
    try:
        with log_path.open("rb") as handle:
            handle.seek(0, os.SEEK_END)
            handle.seek(max(0, handle.tell() - limit))
            return handle.read().decode("utf-8", errors="replace")
    except OSError:
        return ""


# Surefire/Failsafe 每跑完一个测试类输出一行；末尾的汇总行没有 " -- in "，
# 只匹配带类名的行才不会把总数算两遍。
MAVEN_CASE_LINE = re.compile(r"Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+)[^\n]*? -- in ")
# pytest -q 的进度点：连续的结果符号，可能带 [ 42%] 后缀。
PYTEST_DOTS = re.compile(r"^(?:\S*?\.py\s+)?([.FEsxXuP]+)(?:\s+\[\s*\d+%\])?\s*$", re.M)
PYTEST_OUTCOME = re.compile(r"(\d+) (passed|failed|errors?|skipped|xfailed|xpassed)")
JEST_TOTAL_LINE = re.compile(r"^Tests:\s+(.+)$", re.M)
JEST_OUTCOME = re.compile(r"(\d+) (passed|failed|skipped|todo)")
PLAYWRIGHT_CASE_LINE = re.compile(r"^\s*\S{1,3}\s+\d+\s+\[", re.M)
PLAYWRIGHT_SUMMARY_LINE = re.compile(r"^\s*(\d+) (passed|failed|skipped|flaky)\b", re.M)


def parse_case_counts(text: str) -> tuple[int, int] | None:
    """从子进程日志里解出 (已完成用例数, 失败用例数)；识别不了就返回 None。"""
    maven = MAVEN_CASE_LINE.findall(text)
    if maven:
        done = sum(int(run) for run, _, _, _ in maven)
        failed = sum(int(f) + int(e) for _, f, e, _ in maven)
        return done, failed

    jest = JEST_TOTAL_LINE.findall(text)
    if jest:
        counts = {outcome: int(number) for number, outcome in JEST_OUTCOME.findall(jest[-1])}
        return sum(counts.values()), counts.get("failed", 0)

    # pytest 收尾行形如 "37 passed, 1 warning in 2.58s" 或 "2 failed, 35 passed in 3s"。
    for line in reversed([line.strip() for line in text.splitlines() if line.strip()][-8:]):
        outcomes = PYTEST_OUTCOME.findall(line)
        if outcomes and (" in " in line or line.startswith("=")):
            done = failed = 0
            for number, outcome in outcomes:
                count = int(number)
                done += count
                if outcome.startswith(("failed", "error")):
                    failed += count
            return done, failed

    # 还没跑完时退回统计进度点。
    dots = "".join(PYTEST_DOTS.findall(text))
    if dots:
        return len(dots), sum(dots.count(symbol) for symbol in "FE")

    playwright_summary = PLAYWRIGHT_SUMMARY_LINE.findall(text)
    if playwright_summary:
        counts: dict[str, int] = {}
        for number, outcome in playwright_summary:
            counts[outcome] = int(number)
        return sum(counts.values()), counts.get("failed", 0)

    playwright = len(PLAYWRIGHT_CASE_LINE.findall(text))
    return (playwright, 0) if playwright else None


def case_progress(log_path: Path) -> str:
    """run_process 的默认 detail_fn：把进度细化到用例。

    这里只报已完成数，不报 x/n：Maven 和 Jest 在跑完之前不会报出用例总数，
    分母只能拿上一轮的结果去猜，猜错时反而误导人。
    """
    counts = parse_case_counts(read_log_tail(log_path))
    if not counts:
        return ""
    done, failed = counts
    return f"用例 {done}" + (f"（{failed} 失败）" if failed else "")


def playwright_counts(log_path: Path) -> tuple[int, int | None]:
    """(已完成用例数, 本次运行的用例总数)。

    并行执行时行首数字是用例序号而非完成数，因此统计匹配行数而不是取最大序号。
    总数来自 Playwright 自己打印的 "Running N tests"，是本次运行的实数。
    """
    text = read_log_tail(log_path)
    done = len(PLAYWRIGHT_CASE_LINE.findall(text))
    totals = re.findall(r"Running (\d+) test", text)
    return done, int(totals[0]) if totals else None


def playwright_progress(log_path: Path) -> str:
    done, total = playwright_counts(log_path)
    if total:
        return f"用例 {done}/{total}"
    if done:
        return f"已完成 {done} 个用例"
    return "准备中（构建并启动前端）…"


def playwright_fraction(log_path: Path) -> float | None:
    """E2E 只有一个任务，用用例完成比例驱动进度条，否则条子五分钟不动一格。"""
    done, total = playwright_counts(log_path)
    return done / total if total else None


# Agent 服务单元测试的行覆盖率下限，与各 pom 的 jacoco 规则、travel-ui 的
# jest coverageThreshold 一样，按接入门禁时的实测值留 5 个百分点余量。
PYTHON_COVERAGE_MINIMUM = 48


PRE_TAG = "pre"


def modules_with_pre_tests() -> tuple[Path, ...]:
    """有 @Tag("pre") 测试的模块。

    与其对 7 个模块都空跑一遍 Maven（每次约 3 秒的 JVM 启动），不如扫一下源码；
    以后给别的模块加 pre 标记也不用再改这里。
    """
    modules = []
    for module in JAVA_MODULES:
        sources = (module / "src" / "test").rglob("*.java")
        if any(f'@Tag("{PRE_TAG}")' in path.read_text(encoding="utf-8", errors="replace") for path in sources):
            modules.append(module)
    return tuple(modules)


def run_pre(args: argparse.Namespace, artifacts: Path) -> list[Result]:
    """前置守卫：校验数据、资源与配置本身，跑在所有测试之前。

    这些用例断言的是种子数据窗口、迁移脚本、classpath 资源、MQ 队列声明和网关路由
    配置——不是业务逻辑，失败时继续往下跑没有意义，所以单独成段并排在最前。
    """
    selected = set(args.module or [])
    jobs: list[tuple[str, list[str], Path]] = []
    if not selected or "seed-data" in selected:
        # 票务种子数据是滚动窗口，过期后所有交通查询返回空。
        junit = artifacts / "pre" / "seed-data" / "junit.xml"
        junit.parent.mkdir(parents=True, exist_ok=True)
        jobs.append((
            "seed-data",
            [sys.executable, "-m", "pytest", "-q", "tests/test_seed_window.py", f"--junitxml={junit}"],
            API_ROOT,
        ))
    for module in modules_with_pre_tests():
        if selected and module.name not in selected:
            continue
        jobs.append((module.name, [*maven_command(module), f"-Dgroups={PRE_TAG}", "test"], module))
    progress = Progress("pre", len(jobs))
    return [run_process(name, "pre", command, cwd, artifacts, progress) for name, command, cwd in jobs]


def clear_stale_coverage(module: Path, exec_name: str, report_dir: str) -> None:
    """删掉上一轮的 exec 与报告。

    模块里一个测试都没有时 Surefire 不会 fork JVM，prepare-agent 也就不会重写 exec，
    jacoco:report 会拿着上一轮（甚至是集成阶段）的数据出报告，于是 discovery-service
    这种没有单元测试的模块会显示出一个看似正常的单元覆盖率。先清掉才不会张冠李戴。
    """
    for path in (module / "target" / exec_name, module / "target" / "site" / report_dir):
        try:
            shutil.rmtree(path) if path.is_dir() else path.unlink(missing_ok=True)
        except OSError:
            pass


def run_unit(args: argparse.Namespace, artifacts: Path) -> list[Result]:
    selected = set(args.module or [])
    jobs: list[tuple[str, list[str], Path]] = []
    for module in JAVA_MODULES:
        if selected and module.name not in selected:
            continue
        clear_stale_coverage(module, "jacoco.exec", "jacoco")
        # jacoco:check 必须显式调用：unit 阶段跑的是 test，到不了绑定 check 的 verify 阶段。
        # 排除 pre 标记，unit 的覆盖率才只反映真正的单元测试。
        jobs.append((
            module.name,
            [*maven_command(module), f"-DexcludedGroups={PRE_TAG}", "test", "jacoco:report", "jacoco:check"],
            module,
        ))
    if not selected or "ai-arrange-agent-service" in selected:
        junit = artifacts / "unit" / "python" / "junit.xml"
        junit.parent.mkdir(parents=True, exist_ok=True)
        jobs.append((
            "ai-arrange-agent-service",
            [
                sys.executable, "-m", "pytest", "-q", "tests/unit",
                # 阈值只在 unit 阶段生效：integration 阶段跑的是另一批用例，
                # 覆盖到的代码不同，用同一个下限没有意义。
                f"--cov-fail-under={PYTHON_COVERAGE_MINIMUM}",
                f"--junitxml={junit}",
            ],
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


def run_migration(artifacts: Path) -> list[Result]:
    progress = Progress("migration", 1)
    return [
        run_process(
            "postgresql-legacy-migration",
            "migration",
            [sys.executable, str(MIGRATION_TEST)],
            ROOT,
            artifacts,
            progress,
        )
    ]


def run_integration(args: argparse.Namespace, artifacts: Path) -> list[Result]:
    selected = set(args.module or [])
    jobs: list[tuple[str, list[str], Path, dict[str, str] | None]] = []
    for module in JAVA_MODULES:
        if selected and module.name not in selected:
            continue
        clear_stale_coverage(module, "jacoco-it.exec", "jacoco-it")
        # 集成覆盖率单独存放：prepare-agent 默认 append 到同一个 jacoco.exec，
        # 混在一起后单元覆盖率会被 Spring 启动扫过的类撑高，看不出真实情况。
        # 报告输出目录没有对应的用户属性，只能靠 pom 里的 report-it execution 指定。
        command = [
            *maven_command(module),
            "-Djacoco.destFile=target/jacoco-it.exec",
            "test-compile", "failsafe:integration-test", "failsafe:verify", "jacoco:report@report-it",
        ]
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
        # resilience 用例（saga / disruptive）要改服务配置或重启服务，由 run_resilience 单独跑。
        marker = "integration and not resilience"
        junit = artifacts / "integration" / "api-junit.xml"
        jobs.append((
            "api",
            [sys.executable, "-m", "pytest", "-q", "-m", marker, f"--junitxml={junit}"],
            API_ROOT / "tests",
            api_test_env(args, artifacts),
        ))
    progress = Progress("integration", len(jobs))
    return [
        run_process(name, "integration", command, cwd, artifacts, progress, env=env)
        for name, command, cwd, env in jobs
    ]


def api_test_env(args: argparse.Namespace, artifacts: Path) -> dict[str, str]:
    env = os.environ.copy()
    env.update({
        "TRAVEL_TEST_GATEWAY_URL": args.gateway_url,
        "TRAVEL_TEST_EUREKA_URL": args.eureka_url,
        "TRAVEL_TEST_EVIDENCE_DIR": str(artifacts / "integration" / "evidence"),
    })
    return env


PAYMENT_TIMEOUT_TEST_SECONDS = "10"


def restart_order_service(gateway_url: str, payment_timeout: str | None) -> None:
    """按指定支付超时重建 order 容器，并等待它经网关重新可路由。"""
    env = os.environ.copy()
    if payment_timeout is None:
        env.pop("APP_PAYMENT_TIMEOUT_SECONDS", None)
    else:
        env["APP_PAYMENT_TIMEOUT_SECONDS"] = payment_timeout
    compose(["up", "-d", "--no-deps", "order"], env=env)
    deadline = time.monotonic() + 300
    # 刚重建的容器尚未从 Eureka 摘除旧实例，网关可能仍返回旧实例的成功响应，
    # 因此先给注册表一点时间，再开始判定就绪。
    time.sleep(10)
    while time.monotonic() < deadline:
        if routable(gateway_url, "/reservations/ping"):
            return
        time.sleep(5)
    raise RuntimeError("重建 order 服务后网关在 300 秒内仍无法路由 /reservations/ping")


def run_resilience(args: argparse.Namespace, artifacts: Path) -> list[Result]:
    """支付超时补偿与服务停机恢复用例。

    支付超时用例需要 order 服务以 10 秒超时运行，但这个超时会把同一批里所有
    未在 10 秒内付款的订单一起回滚，全链路用例根本跑不完。因此这里单独重建
    order 容器、只跑这一组用例，跑完再恢复默认超时。
    """
    progress = Progress("resilience", 1)
    if not args.manage_services:
        print(paint("  · 跳过：需要 --manage-services 才能临时重建 order 服务", DIM), flush=True)
        return []

    junit = artifacts / "integration" / "resilience-junit.xml"
    env = api_test_env(args, artifacts)
    env.update({
        "TRAVEL_TEST_PAYMENT_TIMEOUT_SECONDS": PAYMENT_TIMEOUT_TEST_SECONDS,
        # 告诉用例：本次运行确实应用了短超时，前置条件不满足就该失败而不是静默跳过。
        "TRAVEL_TEST_EXPECT_SHORT_PAYMENT_TIMEOUT": "1",
    })
    print(paint(f"  · 以 APP_PAYMENT_TIMEOUT_SECONDS={PAYMENT_TIMEOUT_TEST_SECONDS} 重建 order 服务", DIM), flush=True)
    restart_order_service(args.gateway_url, PAYMENT_TIMEOUT_TEST_SECONDS)
    try:
        return [
            run_process(
                "api-resilience",
                "resilience",
                [sys.executable, "-m", "pytest", "-q", "-m", "resilience", f"--junitxml={junit}"],
                API_ROOT / "tests",
                artifacts,
                progress,
                env=env,
            )
        ]
    finally:
        print(paint("  · 恢复 order 服务的默认支付超时设置", DIM), flush=True)
        restart_order_service(args.gateway_url, None)


def run_e2e(args: argparse.Namespace, artifacts: Path) -> list[Result]:
    command = corepack_command(["yarn", "playwright", "test", "--project", args.browser])
    if args.browser == "all":
        command = corepack_command(["yarn", "test:e2e:all"])
    env = os.environ.copy()
    env.update({
        "TRAVEL_UI_URL": args.ui_url,
        "PLAYWRIGHT_REPORT_DIR": str(artifacts / "e2e"),
    })
    if args.manage_services:
        env["TRAVEL_TEST_LLM_STUB"] = "1"
    progress = Progress("e2e", 1)
    return [
        run_process(
            "travel-ui-e2e", "e2e", command, UI_ROOT, artifacts, progress,
            env=env, log_name="playwright",
            detail_fn=playwright_progress, fraction_fn=playwright_fraction
        )
    ]


@dataclass
class Coverage:
    name: str
    kind: str          # java-unit / java-it / python / ui
    primary: float     # 指令（Java）/ 行（Python）/ 语句（UI）覆盖率，百分比
    branch: float | None
    report: str


def _ratio(covered: int, missed: int) -> float | None:
    total = covered + missed
    return round(covered / total * 100, 1) if total else None


def read_jacoco(path: Path) -> tuple[float | None, float | None]:
    instruction_covered = instruction_missed = branch_covered = branch_missed = 0
    import csv as _csv

    with path.open(encoding="utf-8", newline="") as handle:
        for row in _csv.DictReader(handle):
            instruction_covered += int(row["INSTRUCTION_COVERED"])
            instruction_missed += int(row["INSTRUCTION_MISSED"])
            branch_covered += int(row["BRANCH_COVERED"])
            branch_missed += int(row["BRANCH_MISSED"])
    return _ratio(instruction_covered, instruction_missed), _ratio(branch_covered, branch_missed)


def read_cobertura(path: Path) -> tuple[float | None, float | None]:
    import xml.etree.ElementTree as ET

    root = ET.parse(path).getroot()
    line_rate = root.get("line-rate")
    branch_rate = root.get("branch-rate")
    return (
        round(float(line_rate) * 100, 1) if line_rate is not None else None,
        round(float(branch_rate) * 100, 1) if branch_rate is not None else None,
    )


def read_clover(path: Path) -> tuple[float | None, float | None]:
    import xml.etree.ElementTree as ET

    metrics = ET.parse(path).getroot().find("project/metrics")
    if metrics is None:
        return None, None
    statements = int(metrics.get("statements", 0))
    conditionals = int(metrics.get("conditionals", 0))
    return (
        _ratio(int(metrics.get("coveredstatements", 0)), statements - int(metrics.get("coveredstatements", 0))),
        _ratio(int(metrics.get("coveredconditionals", 0)), conditionals - int(metrics.get("coveredconditionals", 0))),
    )


def collect_coverage(artifacts: Path) -> list[Coverage]:
    """把三套工具各自散落的覆盖率报告收敛到 artifacts，并算出可比较的百分比。

    报告本身生成在源码目录里（且都被 .gitignore 忽略），不复制过来的话 CI 上传的
    产物里根本没有覆盖率，也就没人会看。
    """
    target = artifacts / "coverage"
    entries: list[Coverage] = []

    sources: list[tuple[str, str, Path, Path, Callable[[Path], tuple[float | None, float | None]]]] = []
    for module in JAVA_MODULES:
        sources.append((
            module.name, "java-unit",
            module / "target" / "site" / "jacoco" / "jacoco.csv",
            target / "java" / module.name, read_jacoco,
        ))
        sources.append((
            module.name, "java-it",
            module / "target" / "site" / "jacoco-it" / "jacoco.csv",
            target / "java-it" / module.name, read_jacoco,
        ))
    sources.append((
        "ai-arrange-agent-service", "python",
        API_ROOT / "ai-arrange-agent-service" / "coverage.xml",
        target / "python", read_cobertura,
    ))
    sources.append((
        "travel-ui", "ui",
        UI_ROOT / "coverage" / "clover.xml",
        target / "ui", read_clover,
    ))

    for name, kind, report, destination, reader in sources:
        if not report.exists():
            continue
        try:
            primary, branch = reader(report)
        except Exception as exc:  # noqa: BLE001
            print(paint(f"  · 解析覆盖率报告失败 {report}：{exc}", DIM), flush=True)
            continue
        if primary is None:
            continue
        destination.mkdir(parents=True, exist_ok=True)
        copied = destination / report.name
        shutil.copy2(report, copied)
        html = report.parent / "index.html"
        if html.exists():
            shutil.copy2(html, destination / "index.html")
        try:
            report_path = str(copied.resolve().relative_to(ROOT))
        except ValueError:
            report_path = str(copied)
        entries.append(Coverage(name, kind, primary, branch, report_path))
    return entries


COVERAGE_LABELS = {
    "java-unit": "指令 / 分支（单元）",
    "java-it": "指令 / 分支（集成）",
    "python": "行 / 分支",
    "ui": "语句 / 分支",
}


def write_summary(
    results: list[Result],
    artifacts: Path,
    versions: dict[str, str],
    coverage: list[Coverage] | None = None,
) -> None:
    artifacts.mkdir(parents=True, exist_ok=True)
    coverage = coverage or []
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "overallStatus": "passed" if all(result.status == "passed" for result in results) else "failed",
        "versions": versions,
        "results": [asdict(result) for result in results],
        "coverage": [asdict(entry) for entry in coverage],
    }
    (artifacts / "summary.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    total_cases = sum(result.cases for result in results)
    failed_cases = sum(result.cases_failed for result in results)
    lines = ["# 测试汇总", "", f"- 总体状态：{payload['overallStatus']}"]
    if total_cases:
        lines.append(f"- 用例：共 {total_cases} 条，失败 {failed_cases} 条")
    lines += ["", "| 类别 | 模块 | 状态 | 用例 | 失败用例 | 用时（秒） | 日志 |", "| --- | --- | --- | ---: | ---: | ---: | --- |"]
    for result in results:
        lines.append(
            f"| {result.category} | {result.name} | {result.status} | {result.cases} | "
            f"{result.cases_failed} | {result.duration_seconds} | `{result.log}` |"
        )
    if coverage:
        lines += ["", "## 覆盖率", "", "| 模块 | 口径 | 主指标 | 分支 | 报告 |", "| --- | --- | ---: | ---: | --- |"]
        for entry in coverage:
            branch = f"{entry.branch}%" if entry.branch is not None else "—"
            lines.append(
                f"| {entry.name} | {COVERAGE_LABELS.get(entry.kind, entry.kind)} | "
                f"{entry.primary}% | {branch} | `{entry.report}` |"
            )
    (artifacts / "latest.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def print_summary(results: list[Result], artifacts: Path) -> None:
    failed = [result for result in results if result.status != "passed"]
    elapsed = round(sum(result.duration_seconds for result in results), 1)
    cases = sum(result.cases for result in results)
    cases_failed = sum(result.cases_failed for result in results)
    print()
    print(paint("== 汇总 ==", BOLD))
    passed_text = paint(str(len(results) - len(failed)), GREEN)
    failed_text = paint(str(len(failed)), RED if failed else DIM)
    print(f"  通过 {passed_text} / 失败 {failed_text} / 共 {len(results)} 项，累计耗时 {elapsed}s")
    if cases:
        case_failed_text = paint(str(cases_failed), RED if cases_failed else DIM)
        print(f"  用例 {paint(str(cases - cases_failed), GREEN)} 通过 / {case_failed_text} 失败 / 共 {cases} 条")
    for result in failed:
        print(f"  {paint(MARK_FAIL, RED)} {result.category}/{result.name}  日志：{result.log}")
    print(paint(f"  报告：{artifacts / 'latest.md'}", DIM))
    verdict = paint("全部通过", GREEN) if not failed else paint(f"{len(failed)} 项失败", RED)
    print(f"  结果：{verdict}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="TravelOn 跨平台测试入口")
    parser.add_argument("category", choices=("pre", "unit", "migration", "integration", "e2e", "ci"))
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
    args.browser = args.browser or "chromium"
    artifacts = args.artifacts_dir.resolve()
    try:
        print(paint("== 环境预检 ==", BOLD), flush=True)
        versions = preflight(args.category, args.browser)
        for key in ("os", "python", "java", "node", "yarn", "docker"):
            if versions.get(key):
                print(paint(f"  {key:<7} {versions[key]}", DIM))
        print(paint(f"  {MARK_PASS} 预检通过", GREEN), flush=True)
        results: list[Result] = []

        # pre 独立成段：test:unit 就只跑单元测试，组合类别里 pre 排在最前面先失败。
        if args.category in {"pre", "ci"}:
            results.extend(run_pre(args, artifacts))
            if args.category == "ci" and any(result.status != "passed" for result in results):
                write_summary(results, artifacts, versions, collect_coverage(artifacts))
                print_summary(results, artifacts)
                return 1

        if args.category in {"unit", "ci"}:
            results.extend(run_unit(args, artifacts))
            if args.category == "ci" and any(result.status != "passed" for result in results):
                write_summary(results, artifacts, versions, collect_coverage(artifacts))
                print_summary(results, artifacts)
                return 1

        if args.category in {"migration", "ci"}:
            results.extend(run_migration(artifacts))
            if args.category == "ci" and any(result.status != "passed" for result in results):
                write_summary(results, artifacts, versions, collect_coverage(artifacts))
                print_summary(results, artifacts)
                return 1

        needs_services = args.category in {"integration", "e2e", "ci"}
        with ManagedServices(
            args.manage_services and needs_services,
            args.gateway_url,
            build=not args.no_build,
        ):
            if args.category in {"integration", "ci"}:
                results.extend(run_integration(args, artifacts))
            if args.category in {"e2e", "ci"}:
                results.extend(run_e2e(args, artifacts))
            # 放在最后：这一步会重建 order、重启 community，之前的用例不应受影响。
            if args.category in {"integration", "ci"}:
                results.extend(run_resilience(args, artifacts))
        write_summary(results, artifacts, versions, collect_coverage(artifacts))
        print_summary(results, artifacts)
        return 0 if all(result.status == "passed" for result in results) else 1
    except RuntimeError as exc:
        print(paint(f"{MARK_FAIL} 预检或执行失败：{exc}", RED), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
