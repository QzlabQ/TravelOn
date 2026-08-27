# Local Test Automation and Transport Coverage Design

## Goal

Repair the `transport-service` test compilation failure, raise meaningful coverage of its current ticket-query behavior, and provide one local command that runs all project test suites with coverage and writes a machine-readable and human-readable summary.

## Scope

- Replace three obsolete `TransportsQueryService` tests that reference removed transport domain types with unit tests for the current `TicketOfferTemplateRepository` and `CityCatalog` based implementation.
- Exercise normal data, empty data, duplicate cities, price and availability filters, date boundaries, sort options, and invalid city input behavior with explicit result or exception assertions.
- Add `scripts/run-test-coverage.ps1` as the repository-level test entry point.
- Generate ignored artifacts under `artifacts/test-results/`:
  - `latest.md` for review by developers.
  - `summary.json` for later CI integration.
  - one captured log per executed module.
- Document the unified and individual commands in the root README.

## Non-goals

- Do not add GitHub Actions or any other CI workflow in this task.
- Do not add coverage thresholds that make builds fail.
- Do not change production transport behavior merely to increase coverage.
- Do not delete or commit the user's existing untracked learning documents.

## Test Repair

`TransportsQueryService` now queries ticket-offer templates and maps city IDs through `CityCatalog`. The failing tests still target the previous `Transport`, `TransportCourse`, and `Location` model, so they are not valid specifications for the current service.

The replacement tests will construct `TicketOfferTemplate` values and mock only the repository and city-catalog boundary. They will assert the returned DTO contents and repository query parameters for:

- locations being de-duplicated by city ID;
- flight and train departure classification, with the always-empty bus category;
- ticket-option cities being distinct and alphabetically ordered;
- search filtering by inclusive price limits, remaining seats, and one-day departure-date range;
- `price`, `seats`, default departure, and unknown sort modes;
- unknown or blank city values being handled according to the current `CityCatalog` contract.

Existing request/response methods that intentionally return empty transport-pair results will retain direct assertions for UUID preservation and empty lists. The tests will use JUnit 5 and Mockito unit-test extensions rather than starting Spring application contexts.

## Unified Runner

The PowerShell runner will use the existing native test commands:

| Area | Command | Native coverage output |
| --- | --- | --- |
| Java modules | `mvn verify` | `target/site/jacoco/` |
| AI agent | `python -m pytest -q` | `coverage.xml`, `htmlcov/` |
| Frontend | `npm run test:coverage` with `CI=true` | `coverage/` |

The script will enumerate the maintained Java module list explicitly, so database and non-service directories are never treated as Maven modules. It will run every area even after failures, write console output to per-module logs, capture exit codes and elapsed time, then parse native reports where available. The final PowerShell exit code is zero only when every selected module passes.

`latest.md` will include execution time, command, pass/fail outcome, coverage values, report locations, and failure-log locations. `summary.json` will carry the same data in a stable structure for the later CI task. Artifacts are deliberately ignored by Git; the script and README remain versioned.

## Error Handling

- Missing `mvn`, `python`, `npm`, dependencies, or a coverage report are recorded as module failures with an actionable log path.
- Test failures do not prevent subsequent modules from running.
- Report parsing errors are stated in the summary rather than replacing the test result.
- The runner must not delete build output or user files.

## Verification

1. Run the previously failing `transport-service` test command and confirm compilation succeeds.
2. Run its focused unit-test class and assert all normal, boundary, invalid-input, and exception tests pass.
3. Run `powershell -ExecutionPolicy Bypass -File .\scripts\run-test-coverage.ps1`.
4. Confirm `artifacts/test-results/latest.md`, `summary.json`, and module logs are generated and their pass/fail status agrees with native commands.
5. Confirm generated artifacts are excluded by `.gitignore` while the runner and documentation are tracked.
