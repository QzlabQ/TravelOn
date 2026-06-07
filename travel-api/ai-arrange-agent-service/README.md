# AI Arrange Agent Service

Python Agent service for pre-trip planning. It is intentionally internal: the Java `ai-arrange-service` remains responsible for REST, WebSocket, MongoDB snapshots, and frontend protocol.

## Endpoints

- `GET /agent/health`
- `POST /agent/planner/run`
- `POST /agent/planner/stream`

## Current Capabilities

`/agent/planner/run` currently supports:

- interactive planning fields such as `planningMode`, `interaction`, `recommendationGroups`, and `snapshotDraft`;
- day-scoped planning with `planningScope=DAY_PLAN` and `planningScope=DAY_REFINE`;
- final assembly with `planningScope=TRIP_ASSEMBLE` after all day plans are confirmed;
- stable snapshot draft data including `dayPlans`, `currentDayPlan`, `patchOps`, and `checksum`.

The streaming endpoint is:

- `POST /agent/planner/stream`

It uses SSE for Java `WebClient` consumption, emits stage-status events, and ends with a full `AgentRunResponse`. The existing `/agent/planner/run` endpoint remains compatible.

Runtime defaults for Java integration should follow the documented Stage 0 settings:

```text
DEEPSEEK_TIMEOUT_SECONDS=90
AGENT_MODEL_TIMEOUT_SECONDS=90
AGENT_MAX_RUNTIME_SECONDS=120
DEEPSEEK_MAX_TOKENS=6000
```

Java should configure its Python Agent HTTP timeout above `AGENT_MAX_RUNTIME_SECONDS`; the current recommendation is 150 seconds.

## Java Integration

The first Java integration batch is implemented in `../ai-arrange-service`:

- Java calls `/agent/planner/run` for synchronous planner execution.
- Java consumes `/agent/planner/stream` with WebClient and forwards stage events over WebSocket.
- Java saves the final `snapshotDraft` as the formal MongoDB `PlannerSnapshot`.
- Java assigns the formal snapshot `version`; Python `proposedVersion` remains only a draft hint.

Verified from `ai-arrange-service` with:

```powershell
mvn test
```

Current result: `Tests run: 6, Failures: 0, Errors: 0, Skipped: 0`.

## Local Run

```powershell
cd ai-arrange-agent-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8090
```

## Test

```powershell
cd ai-arrange-agent-service
pytest
```

Without `DEEPSEEK_API_KEY` and `AMAP_API_KEY`, the service still returns a structured fallback plan. This keeps local development and Java integration tests deterministic.

## Current Plan

The next development plan is tracked in `NEXT-DEVELOPMENT-PLAN.md`. The current direction is:

- update and freeze the Python / Java contract documentation first;
- align runtime defaults with the documented settings;
- keep the SSE streaming planner endpoint compatible while Java integration is added gradually;
- continue Java integration in batches after the first `/run` + SSE + snapshot persistence batch;
- use Chinese for user-facing text;
- connect real adapters in this order: booking-system hotels/products, Amap POI/routes, then weather and transport.

## Harness Phase 1

The service now wraps tool execution in a lightweight harness:

- `RuntimePolicy` limits per-turn tool calls, model calls, execution time, and tool timeout.
- `ToolRegistry` registers tools with schema labels, timeout, retry, and user-facing status text.
- `ToolResult` standardizes tool output, warnings, latency, retry count, and failure details.
- `TraceRecorder` emits JSON logs with a `traceId` for each agent turn and tool/model step.
- `/agent/planner/run` responses include `traceId`, `toolCalls`, `warnings`, and `userFacingEvents`.

The first phase intentionally does not use MCP, LangGraph, direct MongoDB writes, or frontend WebSocket handling in Python.

## Travel Tools Phase 2

Phase 2 adds mock-first travel tools behind the same harness:

- `search_hotels`: returns hotel candidates and marks internal offer IDs when available.
- `internal_hotel_match`: merges map places with hotel candidates and highlights bookable internal offers.
- `get_weather`: returns date-expanded weather reference for the trip.
- `search_flights`: returns intercity transport candidates. The name is kept for compatibility with the task document, but the payload can represent train or flight options.
- `estimate_budget`: estimates hotel, meals, local transport, tickets, and intercity transport costs.
- `amap_route_plan`: returns deterministic route segment estimates when places have coordinates.

Mock mode is enabled by default:

```text
AGENT_TOOL_MOCK_ENABLED=true
```

Set `AGENT_TOOL_MOCK_ENABLED=false` only after real booking-system, transport-data, and weather connectors are implemented. Python still does not read or write MongoDB; Java should pass business context through `userContext` and remain responsible for auth, persistence, and WebSocket delivery.

## Prompt and ReAct Phase 3

Phase 3 keeps the agent lightweight and bounded. It does not introduce LangGraph, AutoGen, MCP, or autonomous unlimited tool execution.

Prompt fragments live in `app/prompts/`:

- `role_prompt.py`
- `policy_prompt.py`
- `output_contract_prompt.py`
- `tool_selection_prompt.py`
- `repair_prompt.py`

`DeepSeekClient` composes these fragments into the system prompt, and the model is instructed to return only the planner JSON payload. It must not expose hidden reasoning, raw tool JSON, API keys, trace internals, or chain-of-thought.

The planner now uses a deterministic lightweight ReAct loop:

```text
recognize intent -> choose bounded tools -> collect observations -> generate answer or fallback
```

Runtime limits:

```text
AGENT_MAX_REACT_STEPS=3
AGENT_MAX_REACT_TOOL_CALLS=4
AGENT_MAX_TOOL_CALLS_PER_TURN=5
AGENT_MAX_MODEL_CALLS_PER_TURN=1
```

The ReAct loop reserves one tool slot for `fallback_plan_builder`, so reaching the evidence-tool limit still returns a partial usable plan instead of failing the request.
