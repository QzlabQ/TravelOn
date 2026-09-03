# AI Arrange Service

Independent pre-trip planning service for the intelligent travel flow.

## Scope

- Collect fixed trip slots before chat starts.
- Use free-form AI chat after required slots are present.
- Forward planner status and final refresh events over WebSocket.
- Consume the Python Agent SSE endpoint through `WebClient`.
- Persist conversations, messages, and versioned snapshots in MongoDB.
- Push structured Markdown, place suggestions, and simple route data for the map panel.
- Enrich generic AI places through Amap POI search when `AMAP_API_KEY` is configured.
- Keep an internal hotel matching extension point for the later offer-provider booking phase.

## Gateway Paths

- REST: `/ai-arrange/api/conversations`
- WebSocket: `/ai-arrange/ws/planner?conversationId=<uuid>&userId=<uuid>`

The gateway keeps a separate `lb:ws://ai-arrange-service` route for WebSocket upgrade traffic and a normal `lb://ai-arrange-service` route for REST traffic.

## Required Slots

The frontend should collect these before opening the AI chat:

- `city`
- `travelStartDate`
- `peopleCount`

Optional slots:

- `travelEndDate`
- `budget`
- `travelStyle`
- `accommodationPreference`
- `transportPreference`
- `notes`
- `mustVisitKeywords`
- `avoidKeywords`

## REST Contract

Create a planning conversation:

```http
POST /ai-arrange/api/conversations
Content-Type: application/json
```

```json
{
  "userId": "00000000-0000-0000-0000-000000000001",
  "coreSlots": {
    "city": "Shanghai",
    "travelStartDate": "2026-06-01",
    "travelEndDate": "2026-06-03",
    "peopleCount": 2,
    "travelStyle": "relaxed",
    "mustVisitKeywords": ["museum"],
    "avoidKeywords": ["night market"]
  }
}
```

Other endpoints:

- `GET /ai-arrange/api/conversations?userId=<uuid>`
- `GET /ai-arrange/api/conversations/{conversationId}?userId=<uuid>`
- `PUT /ai-arrange/api/conversations/{conversationId}/selection`
- `GET /ai-arrange/api/conversations/{conversationId}/snapshots?userId=<uuid>`
- `GET /ai-arrange/api/conversations/{conversationId}/snapshots/{version}?userId=<uuid>`
- `POST /ai-arrange/api/conversations/{conversationId}/snapshots/{version}/rollback?userId=<uuid>`
- `GET /ai-arrange/api/conversations/{conversationId}/snapshots/{fromVersion}/diff/{toVersion}?userId=<uuid>`
- `POST /ai-arrange/api/conversations/{conversationId}/planner/run`

Rollback creates a new formal snapshot version from the selected historical version. Existing snapshots are never mutated.
The diff endpoint returns summary-oriented change items for fields such as Markdown, selected places, day plans, and planning metadata.

## WebSocket Messages

Client sends chat text:

```json
{
  "type": "PLANNER_CHAT_SEND",
  "conversationId": "00000000-0000-0000-0000-000000000010",
  "userId": "00000000-0000-0000-0000-000000000001",
  "payload": {
    "message": "Please optimize the route around the Bund and museums.",
    "selectedPlaceIds": [],
    "modelVariant": "FLASH",
    "planningScope": "DAY_REFINE",
    "targetDayIndex": 1
  }
}
```

Client sends map selection changes:

```json
{
  "type": "PLANNER_PLACE_SELECTION",
  "conversationId": "00000000-0000-0000-0000-000000000010",
  "userId": "00000000-0000-0000-0000-000000000001",
  "payload": {
    "selectedPlaceIds": ["00000000-0000-0000-0000-000000000101"]
  }
}
```

Server pushes planner status while consuming Python Agent SSE:

```json
{
  "type": "PLANNER_TRACE_EVENT",
  "conversationId": "00000000-0000-0000-0000-000000000010",
  "payload": {
    "traceId": "trace-1",
    "type": "RUN_STARTED",
    "status": "RUNNING",
    "message": "开始生成旅行规划。"
  }
}
```

Server pushes refreshed structured data:

```json
{
  "type": "PLANNER_DATA_REFRESH",
  "conversationId": "00000000-0000-0000-0000-000000000010",
  "payload": {
    "status": "ACTIVE_CHAT",
    "title": "Shanghai pre-trip plan",
    "markdown": "# Shanghai pre-trip plan",
    "snapshotVersion": 2,
    "places": [],
    "routes": [],
    "selectedPlaceIds": []
  }
}
```

When the final Agent response is saved as a Java-owned snapshot, the server sends `PLANNER_SNAPSHOT_SAVED`. Recommendation groups are pushed through `PLANNER_OPTIONS_REFRESH`, and errors are sent as `PLANNER_ERROR`.

## Configuration

- `AI_BASE_URL`: OpenAI-compatible model service base URL, default `https://api.deepseek.com`.
- `AI_CHAT_COMPLETIONS_PATH`: Chat Completions path, default `/chat/completions`.
- `AI_API_KEY`: model service API key; enables real AI calls.
- `AI_MODEL`: model name, default `deepseek-v4-pro`.
- `AI_JSON_MODE`: whether to request JSON mode; set to `false` for providers that do not support it.
- `AI_ARRANGE_AGENT_BASE_URL`: Python Agent base URL, default `http://ai-arrange-agent:8090` in Docker Compose. The Compose service is available only on the internal `backend` network and is not published to the host. For a local non-Docker agent process, the documented default remains `http://localhost:58090`.
- `AI_ARRANGE_AGENT_TIMEOUT_SECONDS`: Python Agent HTTP timeout, default `150`.
- `AMAP_API_KEY`: enables Amap POI enrichment.
- `MONGODB_URI` or `MONGO_HOST`: MongoDB persistence.
- `RABBITMQ_HOST`: reserved for the later offer-provider integration phase.

Without `AI_API_KEY`, the service still runs and returns a local placeholder answer so local development can proceed. The old `DEEPSEEK_*` variables remain accepted as migration aliases.

## Smoke Test

The cross-platform WebSocket smoke test lives at `travel-api/tests/smoke/test_ai_websocket.py` and is part of the external/full suite. Run it from the repository root after starting the backend and configuring `AI_API_KEY`:

```text
cd travel-api/tests
python -m pytest -q smoke/test_ai_websocket.py
```

See the root `README.md` Testing section for setup, markers, reports, and platform-specific virtual-environment activation.
