# Layered Unit Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add assertion-driven unit tests across Java services, the Python AI agent, and React domain utilities.

**Architecture:** Keep tests at existing module boundaries. Mock repositories and external clients in Java, use real Python registry/result objects with controlled handlers, and call React pure functions against fixed dates and isolated localStorage.

**Tech Stack:** JUnit 5, Mockito, AssertJ, pytest, Pydantic, React Testing Library/Jest.

---

### Task 1: Frontend validation and reservation rules

**Files:**
- Create: `travel-ui/src/core/validation.test.ts`
- Create: `travel-ui/src/reservations/orderStatus.test.ts`
- Modify: `travel-ui/src/App.test.js`

- [ ] Write tests for normalized phone, valid/invalid resident ID, UnionPay/Luhn success and failure, expiry boundaries, recharge min/max, stay-date ordering, and child/student traveler rules.
- [ ] Write tests for payment deadline expiry, paid/refund-processing status precedence, and pay/cancel capabilities.
- [ ] Replace the stale `learn react` assertion with a product-level render assertion that is stable under the app's current providers/routes.
- [ ] Run `yarn test --watchAll=false --runInBand`; resolve only test setup issues required to execute these pure-function tests.

### Task 2: Python AI agent edge cases

**Files:**
- Create: `travel-api/ai-arrange-agent-service/tests/test_unit_edge_cases.py`

- [ ] Add assertions for planner output normalization, invalid payload/UUID rejection, and sanitizer removal of secret-bearing fields.
- [ ] Add real `ToolRegistry` tests for retry success, timeout failure, handler exception, and tool-call limit error codes.
- [ ] Add fallback/budget assertions for missing slots and empty tool data.
- [ ] Run `python -m pytest -q tests/test_unit_edge_cases.py`, then the complete pytest suite.

### Task 3: Java user and traveler services

**Files:**
- Create: `travel-api/user-service/src/test/java/org/microarchitecturovisco/userservice/services/UserServiceTest.java`
- Create: `travel-api/user-service/src/test/java/org/microarchitecturovisco/userservice/services/TravelerServiceTest.java`

- [ ] Test registration normalization and saved profile/token fields.
- [ ] Test duplicate email, invalid password, missing/invalid token, and profile email conflict with HTTP status assertions.
- [ ] Test traveler type normalization, unsupported type `400`, missing owned traveler `404`, and default traveler demotion.
- [ ] Run `./mvnw -q test` in `travel-api/user-service`.

### Task 4: Java payment and community file storage

**Files:**
- Create: `travel-api/payment-service/src/test/java/org/microarchitecturovisco/paymentservice/services/PaymentServiceTest.java`
- Create: `travel-api/community-service/src/test/java/org/microarchitecturovisco/communityservice/service/FileStorageServiceTest.java`

- [ ] Test payment success and each rejection branch, asserting reservation ID and boolean approval.
- [ ] Test file storage returns a generated path for a valid upload and rejects empty/invalid uploads with the actual exception contract.
- [ ] Run module Maven tests for payment and community services.

### Task 5: Java AI arrangement boundary exceptions

**Files:**
- Modify: `travel-api/ai-arrange-service/src/test/java/org/microarchitecturovisco/aiarrangeservice/service/PlannerConversationServiceTest.java`
- Modify: `travel-api/ai-arrange-service/src/test/java/org/microarchitecturovisco/aiarrangeservice/service/PlannerSnapshotServiceTest.java`

- [ ] Add ownership denial assertions for conversation access.
- [ ] Add missing snapshot and stale version conflict assertions.
- [ ] Add selection synchronization assertions for selected and unselected places.
- [ ] Run `./mvnw -q test` in `travel-api/ai-arrange-service`.

### Task 6: Full verification and review

**Files:**
- No production files unless a test exposes a required existing contract defect.

- [ ] Run all four Java module suites, the complete Python suite, and the complete frontend Jest suite.
- [ ] Inspect test output for discovered test counts and zero failures/errors.
- [ ] Run `git diff --check` and verify `docs/ite/` remains untouched.
- [ ] Review every new test for result assertions, exception assertions, and absence of no-op tests.
