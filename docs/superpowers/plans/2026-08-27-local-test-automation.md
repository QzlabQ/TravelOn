# Local Test Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair `transport-service` tests, increase coverage of its current ticket-query rules, and add one local command that produces a consolidated test and coverage result.

**Architecture:** Replace the invalid tests that target removed transport entities with direct JUnit 5 and Mockito tests around `TransportsQueryService` and `CityCatalog`. A root PowerShell runner executes the existing Maven, pytest, and React coverage commands, preserves each native report, and derives an ignored Markdown/JSON summary from their machine-readable output.

**Tech Stack:** Java 21, JUnit 5, Mockito, Spring Boot/Maven/JaCoCo, Python pytest/pytest-cov, React/Jest/Istanbul, PowerShell 7 compatible scripting.

**Spec:** `docs/superpowers/specs/2026-08-27-local-test-automation-design.md`

## Global Constraints

- Do not add GitHub Actions or another CI service in this task.
- Do not add a coverage threshold that fails builds.
- Do not modify transport production behavior just to increase coverage.
- Do not delete, stage, or commit the user's existing untracked learning documents.
- Every new test must assert returned data, a dependency boundary, or a thrown exception; no smoke-only assertions.
- Generated reports live in ignored `artifacts/test-results/`; native coverage reports remain in their existing ignored directories.

---

### Task 1: Replace Obsolete Transport Query Tests

**Files:**
- Delete: `travel-api/transport-service/src/test/java/org/microarchitecturovisco/transport/services/TransportsQueryServiceAvailableTransportsTest.java`
- Delete: `travel-api/transport-service/src/test/java/org/microarchitecturovisco/transport/services/TransportsQueryServiceGetTransportsBetweenLocationTest.java`
- Delete: `travel-api/transport-service/src/test/java/org/microarchitecturovisco/transport/services/TransportsQueryServiceGetTransportsBySearchQueryTest.java`
- Create: `travel-api/transport-service/src/test/java/org/microarchitecturovisco/transport/services/TransportsQueryServiceTest.java`
- Create: `travel-api/transport-service/src/test/java/org/microarchitecturovisco/transport/bootstrap/util/CityCatalogTest.java`

**Interfaces:**
- Consumes: `TransportsQueryService(TicketOfferTemplateRepository, CityCatalog)`, `TicketOfferTemplate`, `TicketType`, and current query response DTOs.
- Produces: executable unit tests that no longer reference `TransportRepository`, `TransportCourseRepository`, `Location`, `TransportCourse`, or the legacy `Transport` aggregate.

- [ ] **Step 1: Preserve the current compilation failure as the red baseline**

Run: `cd travel-api/transport-service && mvn test`

Expected: `testCompile` fails with unresolved symbols including `TransportRepository`, `TransportCourseRepository`, `Location`, and `TransportCourse` in the three obsolete test files.

- [ ] **Step 2: Replace the obsolete test sources with a focused service test**

Use `@ExtendWith(MockitoExtension.class)` with `@Mock TicketOfferTemplateRepository` and `@Mock CityCatalog`; do not use `@SpringBootTest`. Add fixture helpers which produce `TicketOfferTemplate` values and `CityCatalog.CityRecord` / `LocationDto` values with stable IDs.

```java
@Test
void availableTransportsDeduplicatesCitiesAndSeparatesFlightAndTrainDepartures() {
    when(repository.findAll()).thenReturn(List.of(
            offer(TicketType.FLIGHT, "SHA", "PEK", 200, 8),
            offer(TicketType.FLIGHT, "SHA", "CAN", 180, 5),
            offer(TicketType.TRAIN, "HGH", "PEK", 100, 12)
    ));
    stubCity("SHA", "Shanghai");
    stubCity("PEK", "Beijing");
    stubCity("CAN", "Guangzhou");
    stubCity("HGH", "Hangzhou");

    AvailableTransportsDto result = service.getAvailableTransports();

    assertThat(result.getDepartures().getPlane()).extracting(LocationDto::getCityId)
            .containsExactly("SHA");
    assertThat(result.getDepartures().getTrain()).extracting(LocationDto::getCityId)
            .containsExactly("HGH");
    assertThat(result.getDepartures().getBus()).isEmpty();
    assertThat(result.getArrivals()).extracting(LocationDto::getCityId)
            .containsExactly("PEK", "CAN");
}
```

Also include explicit assertions for:

- `getAllLocations` ignores null/blank city IDs and returns a city only once when it is both a departure and an arrival;
- `getTicketOptions(FLIGHT)` returns distinct departure and arrival city names sorted alphabetically;
- `searchTicketOffers` forwards `departureDate.atStartOfDay()` and `departureDate.plusDays(1).atStartOfDay()` to the repository, includes minimum/maximum prices, excludes price outliers and zero-seat offers when `onlyAvailable` is true;
- `price`, `seats`, default, and unknown sort values map to the documented comparator behavior and duration is formatted as `2h 30m`;
- query response methods preserve the incoming UUID and return empty lists under the current contract;
- a blank city ID is ignored and unknown/blank city text follows `CityCatalog.find` fallback behavior without returning a null location.

For the I/O exception branch, use a `ResourceLoader` returning an existing `Resource` whose `getInputStream()` throws `IOException` and assert:

```java
assertThatThrownBy(() -> catalog.find("Shanghai"))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("Unable to read common city seed data")
        .hasCauseInstanceOf(IOException.class);
```

- [ ] **Step 3: Run the focused tests and verify the green result**

Run:

```text
cd travel-api/transport-service
mvn test -Dtest=TransportsQueryServiceTest,CityCatalogTest
```

Expected: all tests compile and pass. The old missing-type errors are absent, and every test has a state/result, interaction, or exception assertion.

- [ ] **Step 4: Run the complete transport module with JaCoCo**

Run: `cd travel-api/transport-service && mvn verify`

Expected: success, `target/site/jacoco/index.html`, `jacoco.xml`, and `jacoco.csv` exist, and the module's report covers `TransportsQueryService` query/mapping branches rather than reporting no data.

- [ ] **Step 5: Commit the focused test repair**

```text
git add travel-api/transport-service/src/test/java
git commit -m "test: repair transport query coverage"
```

### Task 2: Add the Unified Local Test and Coverage Runner

**Files:**
- Create: `scripts/run-test-coverage.ps1`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: Maven modules `ai-arrange-service`, `api-gateway`, `community-service`, `discovery-service`, `hotel-service`, `offer-provider-service`, `payment-service`, `reservation-service`, `transport-service`, `user-service`; Python `coverage.xml`; frontend `coverage/coverage-final.json`; JUnit XML written by pytest and Jest.
- Produces: `artifacts/test-results/latest.md`, `artifacts/test-results/summary.json`, and `artifacts/test-results/logs/<module>.log`; a zero PowerShell exit code only when all selected modules pass.

- [ ] **Step 1: Write the runner’s expected-output contract before its implementation**

Document the output shape in the script header and use a small manual fixture during development. The JSON result object must include module name, command, status, duration seconds, total/passed/failed/error/skipped counts, coverage metrics, report paths, and log path.

```json
{
  "generatedAt": "2026-08-27T00:00:00Z",
  "overallStatus": "failed",
  "modules": [
    {
      "name": "transport-service",
      "status": "passed",
      "tests": { "total": 12, "passed": 12, "failed": 0, "errors": 0, "skipped": 0 },
      "coverage": { "lines": 0.0, "branches": 0.0 },
      "logPath": "artifacts/test-results/logs/transport-service.log"
    }
  ]
}
```

- [ ] **Step 2: Implement command execution that continues after module failures**

Create `Invoke-TestModule` to execute a script block from the repository root, redirect all streams to a module log, measure elapsed time, and return a structured object instead of throwing. Use an explicit Java module array, then invoke Python and frontend commands.

```powershell
function Invoke-TestModule {
    param([string]$Name, [string]$Command, [scriptblock]$Action)

    $started = Get-Date
    & $Action *> (Join-Path $logsDirectory "$Name.log")
    $exitCode = $LASTEXITCODE
    [pscustomobject]@{
        Name = $Name
        Command = $Command
        Status = if ($exitCode -eq 0) { "passed" } else { "failed" }
        DurationSeconds = [math]::Round(((Get-Date) - $started).TotalSeconds, 2)
        LogPath = "artifacts/test-results/logs/$Name.log"
    }
}

$javaModules | ForEach-Object {
    $module = $_
    Invoke-TestModule -Name $module -Command "mvn verify" -Action {
        Push-Location (Join-Path $repositoryRoot "travel-api/$module")
        try { mvn verify } finally { Pop-Location }
    }
}
```

Invoke Python as `python -m pytest -q --junitxml=artifacts/test-results/python-junit.xml` from `travel-api/ai-arrange-agent-service`. Invoke the frontend as `npm run test:coverage -- --json --outputFile <absolute-artifact-path>` from `travel-ui`, with `$env:CI = "true"` only for that process. Ensure all generated artifact paths are absolute while commands execute from module directories.

- [ ] **Step 3: Parse native reports and write Markdown/JSON summaries**

Add focused parsing helpers that tolerate missing reports:

- Sum Surefire `TEST-*.xml` attributes for Java test counts; sum JaCoCo CSV `LINE_*` and `BRANCH_*` columns for percentages.
- Read pytest JUnit XML counts and `coverage.xml` root `line-rate` / `branch-rate` attributes.
- Read Jest JSON `numTotalTests`, `numPassedTests`, `numFailedTests`, and `numPendingTests`; calculate Istanbul statement/branch/function/line rates from `coverage-final.json` counters.
- Set unavailable metrics to `$null` with a report warning; do not convert a passing test command into a failure merely because parsing was unavailable.

Use `ConvertTo-Json -Depth 8` for `summary.json` and build a Markdown table for `latest.md` containing module, command, status, tests, line/branch coverage, report path, and log path. Include an overall summary with start/end time and the final status.

- [ ] **Step 4: Ignore generated summaries and run a representative verification**

Add exactly this ignore rule:

```gitignore
# Generated consolidated test results
artifacts/test-results/
```

Run:

```text
powershell -ExecutionPolicy Bypass -File .\scripts\run-test-coverage.ps1
```

Expected: every configured module is attempted; `latest.md`, `summary.json`, and one log per module exist. The process exit code reflects whether all modules passed. Inspect a Java JaCoCo line, Python line/branch rates, frontend test counts and coverage rates, and an intentionally failing command only through the runner helper if a deterministic isolated dry-run option is included.

- [ ] **Step 5: Commit the runner and generated-artifact ignore rule**

```text
git add scripts/run-test-coverage.ps1 .gitignore
git commit -m "test: add local coverage runner"
```

### Task 3: Document Test Entry Points and Verify the Complete Workflow

**Files:**
- Modify: `README.md`
- Modify: `docs/testing-results-2026-08-26.md`

**Interfaces:**
- Consumes: the root runner, native report locations, and actual exit/test/coverage results from the final run.
- Produces: user-facing startup instructions and an updated recorded outcome with evidence paths.

- [ ] **Step 1: Add concise README test instructions**

Add a `Testing` section to the root README with the unified command, prerequisites (`Java 21`, Maven, Python environment with test dependencies, Node dependencies), artifact paths, and these individual commands:

```text
cd travel-api/transport-service && mvn verify
cd travel-api/ai-arrange-agent-service && python -m pytest -q
cd travel-ui && $env:CI='true'; npm run test:coverage
```

State that the unified runner attempts all modules and exits nonzero if any module fails; it does not require services, databases, external APIs, or CI credentials.

- [ ] **Step 2: Run final verification and record actual evidence**

Run the unified command once after all changes:

```text
powershell -ExecutionPolicy Bypass -File .\scripts\run-test-coverage.ps1
```

Read `artifacts/test-results/summary.json` and update `docs/testing-results-2026-08-26.md` (or a new date-stamped results document if the existing report must remain immutable) with actual, not estimated, test totals, passed/failed counts, coverage values, known failures, report locations, tester, and completion time. Do not claim every module passed unless the runner exit code and summary prove it.

- [ ] **Step 3: Check repository state and commit documentation only**

Run:

```text
git status --short
git check-ignore -v artifacts/test-results/latest.md
```

Expected: generated test artifacts are ignored; user learning documents remain untracked and untouched; only the intended README/result-document files are staged.

```text
git add README.md docs/testing-results-2026-08-26.md
git commit -m "docs: document local test reports"
```
