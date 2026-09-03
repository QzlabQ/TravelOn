# AI Planner Reliability And UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI planner runs recoverable across WebSocket interruptions and simplify the planner/floating assistant interaction around explicit place and preference selections.

**Architecture:** Persist one active run record inside `PlannerConversation`, keyed by a client/server `runId`. The Java service updates that record before Agent execution and after success/failure, then exposes a `PLANNER_SYNC`/`PLANNER_RUN_STATE` WebSocket handshake while the existing HTTP conversation/snapshot endpoints remain the authoritative recovery source. The React screen keeps a run pending through transient disconnects, reconciles by HTTP after reconnect, and passes place names plus checkbox-based smart preferences to a simplified floating assistant.

**Tech Stack:** Spring Boot WebSocket, Spring Data MongoDB, WebClient/Reactor SSE, FastAPI/Pydantic, React 18, TypeScript, MUI, Jest/React Testing Library, Maven.

**Spec:** `docs/superpowers/specs/2026-08-28-ai-planner-reliability-ui-design.md`

## Global Constraints

- Keep the existing Java/Spring, Python/FastAPI, React/MUI and MongoDB stack; do not add Redis, RabbitMQ, or another persistence service for run state.
- Preserve `RUN_FINISHED` and `RUN_FAILED` as Python Agent SSE terminal events and preserve snapshot version semantics.
- Do not remove historical snapshots, Markdown editing, community publishing, booking links, or existing planner HTTP endpoints.
- Use `runId` to prevent duplicate Agent calls; a disconnected client must not automatically spend model quota a second time.
- Keep user-facing copy in the existing Simplified Chinese strings used by the planner UI.

---

### Task 1: Add persisted planner run state

**Files:**
- Create: `travel-api/ai-arrange-service/src/main/java/org/microarchitecturovisco/aiarrangeservice/domain/enums/PlannerRunStatus.java`
- Create: `travel-api/ai-arrange-service/src/main/java/org/microarchitecturovisco/aiarrangeservice/domain/model/PlannerActiveRun.java`
- Modify: `travel-api/ai-arrange-service/src/main/java/org/microarchitecturovisco/aiarrangeservice/domain/document/PlannerConversation.java`
- Modify: `travel-api/ai-arrange-service/src/main/java/org/microarchitecturovisco/aiarrangeservice/domain/model/response/PlannerConversationResponse.java`
- Test: `travel-api/ai-arrange-service/src/test/java/org/microarchitecturovisco/aiarrangeservice/service/PlannerConversationServiceTest.java`

**Interfaces:**
- `PlannerRunStatus` exposes `RUNNING`, `SUCCEEDED`, and `FAILED`.
- `PlannerActiveRun` stores `runId`, `status`, `targetDayIndex`, `traceId`, `startedAt`, `updatedAt`, `errorCode`, and `errorMessage`.
- `PlannerConversation.activeRun` is nullable for old MongoDB documents.
- `PlannerConversationResponse.activeRun` is nullable and serializes the same state for HTTP recovery.

- [ ] **Step 1: Write the failing model/service tests**

Add assertions that a new conversation has no active run, that `PlannerConversationResponse.from` copies an active run, and that old-style conversations with a null run remain readable.

- [ ] **Step 2: Run the focused test and verify it fails for the missing contract**

Run from `travel-api`:

```powershell
.\mvnw.cmd -pl ai-arrange-service -Dtest=PlannerConversationServiceTest test
```

Expected: compilation/test failure because `PlannerRunStatus`, `PlannerActiveRun`, and the response field do not exist.

- [ ] **Step 3: Implement the run-state value object and document fields**

Use Lombok `@Data`, `@Builder`, `@NoArgsConstructor`, and `@AllArgsConstructor`, with `Instant` timestamps and nullable status. Add `activeRun` to `PlannerConversation` and map it in `PlannerConversationResponse.from`.

- [ ] **Step 4: Run the focused test and verify it passes**

```powershell
.\mvnw.cmd -pl ai-arrange-service -Dtest=PlannerConversationServiceTest test
```

Expected: PASS with no new warnings.

- [ ] **Step 5: Commit the persisted run-state contract**

```powershell
git add travel-api/ai-arrange-service/src/main/java travel-api/ai-arrange-service/src/test/java
git commit -m "feat: persist planner active run state"
```

### Task 2: Make Java Agent execution durable and idempotent

**Files:**
- Modify: `travel-api/ai-arrange-service/src/main/java/org/microarchitecturovisco/aiarrangeservice/domain/model/request/PlannerChatSendPayload.java`
- Modify: `travel-api/ai-arrange-service/src/main/java/org/microarchitecturovisco/aiarrangeservice/domain/model/request/RunPlannerAgentRequest.java`
- Modify: `travel-api/ai-arrange-service/src/main/java/org/microarchitecturovisco/aiarrangeservice/service/PlannerConversationService.java`
- Test: `travel-api/ai-arrange-service/src/test/java/org/microarchitecturovisco/aiarrangeservice/service/PlannerConversationServiceTest.java`

**Interfaces:**
- `PlannerChatSendPayload.runId` and `RunPlannerAgentRequest.runId` are optional UUID values for backward compatibility.
- `PlannerConversationService.handleChatMessage` generates a UUID when the payload omits one.
- Repeated `runId` equal to the stored active run returns the current state without calling `PlannerAgentClient` again.
- Internal helpers update the active run before Agent invocation and in every completion/error path.

- [ ] **Step 1: Add failing tests for run lifecycle and duplicate suppression**

Cover: a new WebSocket chat request saves `RUNNING` before the Agent client is called; a successful Agent response saves `SUCCEEDED` after snapshot creation; a failed Agent future saves `FAILED`; a repeated `runId` does not invoke the Agent client twice.

- [ ] **Step 2: Run the focused tests and verify the expected failures**

```powershell
.\mvnw.cmd -pl ai-arrange-service -Dtest=PlannerConversationServiceTest test
```

Expected: test compilation or assertion failures because the payload and lifecycle behavior are not implemented.

- [ ] **Step 3: Implement lifecycle persistence around the existing async chain**

Save the user message and `RUNNING` active run before `streamPlanner`. In the success callback, call `finalizeAgentTurnFromAgent`, then save `SUCCEEDED` with the response trace ID and target day before sending WebSocket refresh messages. In `exceptionally`, save `FAILED` with the mapped error code/message before sending `PLANNER_ERROR`. Preserve the existing non-streaming REST path and generate a server UUID when it receives no `runId`.

- [ ] **Step 4: Run the focused tests and verify the lifecycle passes**

```powershell
.\mvnw.cmd -pl ai-arrange-service -Dtest=PlannerConversationServiceTest test
```

Expected: PASS, including the duplicate suppression case.

- [ ] **Step 5: Commit durable Agent execution**

```powershell
git add travel-api/ai-arrange-service/src/main/java travel-api/ai-arrange-service/src/test/java
git commit -m "feat: make planner agent runs recoverable"
```

### Task 3: Add WebSocket synchronization protocol

**Files:**
- Modify: `travel-api/ai-arrange-service/src/main/java/org/microarchitecturovisco/aiarrangeservice/domain/enums/PlannerMessageType.java`
- Create: `travel-api/ai-arrange-service/src/main/java/org/microarchitecturovisco/aiarrangeservice/domain/model/response/PlannerRunStatePayload.java`
- Modify: `travel-api/ai-arrange-service/src/main/java/org/microarchitecturovisco/aiarrangeservice/websocket/PlannerWebSocketHandler.java`
- Modify: `travel-api/ai-arrange-service/src/main/java/org/microarchitecturovisco/aiarrangeservice/service/PlannerConversationService.java`
- Modify: `travel-api/ai-arrange-service/src/main/java/org/microarchitecturovisco/aiarrangeservice/domain/model/response/PlannerDataRefreshPayload.java`
- Modify: `travel-api/ai-arrange-service/src/main/java/org/microarchitecturovisco/aiarrangeservice/domain/model/response/PlannerChatStreamPayload.java`
- Test: `travel-api/ai-arrange-service/src/test/java/org/microarchitecturovisco/aiarrangeservice/websocket/PlannerWebSocketHandlerTest.java`

**Interfaces:**
- Add enum values `PLANNER_SYNC` and `PLANNER_RUN_STATE`.
- `PLANNER_SYNC` payload contains optional `runId`.
- `PLANNER_RUN_STATE` contains the active run and latest snapshot version; a succeeded state can be followed by existing refresh/saved messages.
- `runId` is present in stream, refresh, snapshot-saved, trace and error payloads where their Java response models support it.

- [ ] **Step 1: Write failing WebSocket protocol tests**

Test that a valid `PLANNER_SYNC` invokes the service and sends `PLANNER_RUN_STATE`; test running, succeeded, failed and empty active-run responses; test an unknown message still returns `UNSUPPORTED_MESSAGE`.

- [ ] **Step 2: Run the focused WebSocket test and verify it fails**

```powershell
.\mvnw.cmd -pl ai-arrange-service -Dtest=PlannerWebSocketHandlerTest test
```

Expected: compilation/assertion failure because the new message types and handler branch are missing.

- [ ] **Step 3: Implement sync handling and payload mapping**

Validate the session conversation/user IDs exactly as existing messages do. Add a service method that reads the owned conversation, maps its active run, and sends `PLANNER_RUN_STATE`; for `SUCCEEDED`, load the latest snapshot and send the existing data refresh and saved notifications. Do not start an Agent call during synchronization.

- [ ] **Step 4: Run the focused test and then all AI service tests**

```powershell
.\mvnw.cmd -pl ai-arrange-service -Dtest=PlannerWebSocketHandlerTest test
.\mvnw.cmd -pl ai-arrange-service test
```

Expected: both commands PASS.

- [ ] **Step 5: Commit the synchronization protocol**

```powershell
git add travel-api/ai-arrange-service/src/main/java travel-api/ai-arrange-service/src/test/java
git commit -m "feat: sync planner run state after websocket reconnect"
```

### Task 4: Add frontend run identity and recovery state

**Files:**
- Modify: `travel-ui/src/core/apiConfig.tsx`
- Modify: `travel-ui/src/ai-arrange/screens/AiPlanner.tsx`
- Test: `travel-ui/src/ai-arrange/screens/AiPlanner.test.tsx`

**Interfaces:**
- `PlannerMessageType` includes `PLANNER_SYNC` and `PLANNER_RUN_STATE`.
- `PlannerChatSendPayload` and `RunPlannerAgentPayload` include optional `runId`.
- `PlannerRunStatePayload` mirrors the Java active-run response.
- `AiPlanner` stores `activeRunId` and run status in local storage with empty defaults for old caches.

- [ ] **Step 1: Write failing React tests for reconnect recovery**

Render a conversation with a mocked WebSocket, submit an action, trigger `onclose`, assert the progress remains pending, then resolve the mocked conversation/snapshot HTTP calls and assert the returned Markdown appears. Also assert a reconnect sends `PLANNER_SYNC` with the original `runId` and does not send a second `PLANNER_CHAT_SEND`.

- [ ] **Step 2: Run the focused React tests and verify they fail**

```powershell
cd travel-ui
yarn test src/ai-arrange/screens/AiPlanner.test.tsx --watchAll=false
```

Expected: the test file or assertions fail because run identity and recovery behavior are absent.

- [ ] **Step 3: Implement frontend protocol and recovery state**

Generate a UUID in `sendPlannerActionMessage` and `sendChatMessage`, include it in the payload, and store it in a ref/state. On socket open, send `PLANNER_SYNC` and call `refreshConversationFromServer`. On close/error, keep the active run pending, set a reconnect status, and schedule bounded reconciliation. Handle `PLANNER_RUN_STATE`; use server status and HTTP snapshots to settle the run. Clear the active run only after success or failure, and ignore messages whose `runId` is not the current run.

- [ ] **Step 4: Run focused and existing React tests**

```powershell
yarn test src/ai-arrange/screens/AiPlanner.test.tsx --watchAll=false
yarn test --watchAll=false
```

Expected: PASS with no unhandled WebSocket or React warnings.

- [ ] **Step 5: Commit frontend recovery behavior**

```powershell
git add travel-ui/src/core/apiConfig.tsx travel-ui/src/ai-arrange/screens/AiPlanner.tsx travel-ui/src/ai-arrange/screens/AiPlanner.test.tsx
git commit -m "fix: recover planner results after websocket disconnect"
```

### Task 5: Make floating assistant context explicit and preferences selectable

**Files:**
- Create: `travel-ui/src/ai-arrange/plannerInteraction.ts`
- Modify: `travel-ui/src/ai-arrange/components/FloatingAiAssistant.tsx`
- Modify: `travel-ui/src/ai-arrange/screens/AiPlanner.tsx`
- Test: `travel-ui/src/ai-arrange/plannerInteraction.test.ts`
- Test: `travel-ui/src/ai-arrange/components/FloatingAiAssistant.test.tsx`

**Interfaces:**
- `buildPlannerContextMessage(dayIndex, selectedPlaceNames, selectedPreferenceLabels)` returns the four specified Chinese message variants.
- `PlannerSmartPreference` has `id`, `label`, and `value`.
- `FloatingAiAssistant` receives `places`, `selectedPlaceIds`, and no longer treats smart preference actions as immediate sends.
- Checkbox changes are local; `onPlannerAction` is called only by “应用偏好” and existing explicit day/booking actions.

- [ ] **Step 1: Write failing interaction and component tests**

Test the context helper for no selection, place-only, preference-only, and combined selection. Render the floating assistant, click two smart preference checkboxes, assert no planner callback yet, then click “应用偏好” and assert the callback contains the selected place names, preference labels, target day, and selected IDs.

- [ ] **Step 2: Run the focused tests and verify they fail**

```powershell
cd travel-ui
yarn test src/ai-arrange/plannerInteraction.test.ts src/ai-arrange/components/FloatingAiAssistant.test.tsx --watchAll=false
```

Expected: missing helper or failing assertions because smart actions currently send immediately and no place-name context is rendered.

- [ ] **Step 3: Implement explicit context and checkbox preferences**

Derive selected place names from `PlannerPlaceSuggestion[]`. Add a compact context block showing day/date, place names, and preference labels. Replace the smart action button grid with MUI `FormGroup`/`FormControlLabel` checkboxes and one contained “应用偏好” button. Use `buildPlannerContextMessage` for both “优化当天” and “应用偏好”; pass `interaction.selectedPlaceIds` and preference values in `freeText`.

- [ ] **Step 4: Run focused UI tests and inspect the rendered interaction**

```powershell
yarn test src/ai-arrange/plannerInteraction.test.ts src/ai-arrange/components/FloatingAiAssistant.test.tsx --watchAll=false
yarn build
```

Expected: tests and production build PASS; the floating window shows selected place names and checked preferences without sending on checkbox changes.

- [ ] **Step 5: Commit explicit assistant context**

```powershell
git add travel-ui/src/ai-arrange
git commit -m "feat: make planner assistant context and preferences explicit"
```

### Task 6: Simplify default planner information hierarchy

**Files:**
- Modify: `travel-ui/src/ai-arrange/screens/AiPlanner.tsx`
- Modify: `travel-ui/src/ai-arrange/components/FloatingAiAssistant.tsx`
- Test: `travel-ui/src/ai-arrange/screens/AiPlanner.test.tsx`
- Test: `travel-ui/src/ai-arrange/components/FloatingAiAssistant.test.tsx`

**Interfaces:**
- Existing advanced capabilities remain reachable through collapsible panels.
- Initial form shows destination, dates, people, model, and a collapsed “更多偏好” section.
- Active conversation defaults to summary, current day, and Markdown; map/recommendations, version history, trace details, ticket recommendations, and chat history are expandable or secondary.

- [ ] **Step 1: Add failing rendering assertions for the new hierarchy**

Assert that advanced form labels are hidden until “更多偏好” is expanded, that the floating assistant defaults to one primary day action plus context/input, and that clicking the details control reveals progress/history without removing access.

- [ ] **Step 2: Run focused UI tests and verify failure**

```powershell
cd travel-ui
yarn test src/ai-arrange/screens/AiPlanner.test.tsx src/ai-arrange/components/FloatingAiAssistant.test.tsx --watchAll=false
```

Expected: assertions fail against the current all-visible layout.

- [ ] **Step 3: Implement the layout hierarchy without deleting capabilities**

Wrap advanced form fields in a controlled MUI collapse/section, reduce duplicate status chips and action groups, make the current day operation primary, and move progress details/booking actions/history behind existing or new expand controls. Preserve responsive widths and stable scroll containers for desktop and mobile.

- [ ] **Step 4: Run all frontend tests and build**

```powershell
yarn test --watchAll=false
yarn build
```

Expected: PASS and a successful production bundle.

- [ ] **Step 5: Commit the simplified hierarchy**

```powershell
git add travel-ui/src/ai-arrange
git commit -m "refactor: simplify planner default interface"
```

### Task 7: Verify end-to-end behavior and integration boundaries

**Files:**
- Modify: `travel-api/ai-arrange-service/src/test/java/org/microarchitecturovisco/aiarrangeservice/client/PythonPlannerAgentClientTest.java` only if a missing断流 regression case is required.
- Modify: `travel-api/ai-arrange-service/src/main/resources/application.properties` only if the existing Agent timeout is inconsistent with the compose timeout.
- Create: `docs/superpowers/verification/2026-08-28-ai-planner-reliability-ui.md`

- [ ] **Step 1: Add/execute the SSE断流 regression test**

Use the existing `PythonPlannerAgentClientTest` style to make an SSE response close before a terminal event and assert `PlannerAgentStreamException`; verify the Java service maps it to a persisted `FAILED` run.

- [ ] **Step 2: Run the complete backend test suite**

```powershell
cd travel-api
.\mvnw.cmd -pl ai-arrange-service test
```

Expected: PASS.

- [ ] **Step 3: Run the complete frontend validation**

```powershell
cd travel-ui
yarn test --watchAll=false
yarn build
```

Expected: PASS and a successful production bundle.

- [ ] **Step 4: Run static checks and inspect the diff**

```powershell
cd ..
git diff --check
git status --short
git diff --stat
```

Confirm only the planned AI planner files and design/verification documents changed. Check the four context message variants, the `PLANNER_SYNC` handshake, and that no disconnect path automatically resends the Agent request.

- [ ] **Step 5: Record verification evidence**

Write the commands, exit codes, test counts, and any environment-limited checks to `docs/superpowers/verification/2026-08-28-ai-planner-reliability-ui.md`. Do not claim browser-level verification unless the local services and browser are actually available.

- [ ] **Step 6: Commit verification evidence**

```powershell
git add docs/superpowers/verification/2026-08-28-ai-planner-reliability-ui.md
git commit -m "test: verify AI planner reliability and UI changes"
```
