# Local Test and Coverage Results

Test date: 2026-08-27 09:58 (Asia/Shanghai)

## Scope and Acceptance Evidence

The local runner attempted all configured Java modules, the AI arrange agent,
and the frontend. The transport query tests assert normal results, inclusive
price and date boundaries, sold-out filtering, ordering, empty contracts, and
the city seed-data I/O exception branch. Every added test asserts data,
dependency interaction, HTTP status, or thrown exception.

Run command:

```powershell
powershell -ExecutionPolicy Bypass -File .\travel-api\tests\run-unit-test-coverage.ps1
```

The runner generated `artifacts/test-results/latest.md`,
`artifacts/test-results/summary.json`, and one log per module in
`artifacts/test-results/logs/`. Native Surefire, JaCoCo, pytest, and Istanbul
reports remain below their respective module directories.

## Actual Result

Overall status: failed. All 12 configured modules were attempted; 9 passed and
3 failed. For reports that completed, 85 tests ran: 75 passed, 0 assertion
failures, and 10 errors.

| Module | Status | Tests (pass/total) | Line coverage | Branch coverage |
| --- | --- | ---: | ---: | ---: |
| ai-arrange-service | passed | 28/28 | 63.24% | 41.47% |
| api-gateway | passed | 1/1 | 33.33% | not applicable |
| community-service | passed | 13/13 | 30.93% | 25.00% |
| discovery-service | passed | 1/1 | 33.33% | not applicable |
| hotel-service | passed | 6/6 | 10.86% | 9.38% |
| offer-provider-service | passed | 1/1 | 9.77% | 0.00% |
| payment-service | passed | 3/3 | 50.85% | 100.00% |
| reservation-service | failed | 2/12 | unavailable | unavailable |
| transport-service | passed | 15/15 | 50.65% | 58.44% |
| user-service | passed | 15/15 | 70.78% | 45.00% |
| ai-arrange-agent-service | failed | unavailable | unavailable | unavailable |
| travel-ui | failed | unavailable | unavailable | unavailable |

## Failure Log

- `reservation-service`: 10 test errors because Mockito's bundled Byte Buddy
  cannot instrument `RestTemplate` on the active JDK 25. The corresponding log
  is `artifacts/test-results/logs/reservation-service.log`.
- `ai-arrange-agent-service`: the selected `C:\Python314\python.exe` has no
  `pytest` module. The log is
  `artifacts/test-results/logs/ai-arrange-agent-service.log`.
- `travel-ui`: `react-scripts` is unavailable because frontend dependencies are
  not installed in this worktree. The log is
  `artifacts/test-results/logs/travel-ui.log`.

The failed Python and frontend commands did not produce fresh native reports.
The runner records those values as unavailable rather than reusing older
coverage files. `reservation-service` did not produce JaCoCo CSV because test
execution failed before the report phase.

Tester: Codex

Completion time: 2026-08-27 09:58 (Asia/Shanghai)
