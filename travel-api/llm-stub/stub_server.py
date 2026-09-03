from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


HOST = "0.0.0.0"
PORT = 9099

PLANNER_OUTPUT = {
    "assistantText": "桩模型已生成确定的一日行程。",
    "title": "桩模型示例行程",
    "summary": "这是由 E2E 桩模型返回的固定规划，用于验证完整的规划与快照链路。",
    "markdown": (
        "# 桩模型示例行程\n\n"
        "## 上午\n\n"
        "- 09:00 抵达城市中心，步行熟悉周边。\n"
        "- 10:00 参观代表性景点，预留充足游览时间。\n\n"
        "## 下午\n\n"
        "- 12:30 品尝本地午餐。\n"
        "- 14:00 继续城市漫步，乘坐公共交通前往下一站。\n\n"
        "## 晚上\n\n"
        "- 18:00 安排晚餐并返回住宿地。\n"
        "- 如遇天气变化，改为附近室内场馆。"
    ),
    "nextQuestion": "是否需要调整这份桩模型行程？",
    "places": [],
    "routes": [],
}


class StubHandler(BaseHTTPRequestHandler):
    server_version = "TravelOnLLMStub/1.0"

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self._write_json(200, {"status": "ok"})
            return
        self._write_json(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length:
            self.rfile.read(content_length)
        self._write_json(
            200,
            {
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(PLANNER_OUTPUT, ensure_ascii=False),
                        }
                    }
                ]
            },
        )

    def log_message(self, format: str, *args: object) -> None:
        return

    def _write_json(self, status: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), StubHandler)
    print(f"TravelOn LLM stub listening on http://{HOST}:{PORT}", flush=True)
    server.serve_forever()
