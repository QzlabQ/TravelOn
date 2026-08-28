# 78206a6 Review

## Original Review

The listed unused methods and legacy classes were removed, but the commit also removed the ticket-offer-template management endpoints. The executable API E2E runner still uses these endpoints to create isolated future flight and train fixtures and to delete them during cleanup:

- `POST /transports/tickets/templates`
- `PUT /transports/tickets/templates/{templateId}`
- `DELETE /transports/tickets/templates/{templateId}`

This made the E2E runner stop with HTTP 404 before it could test transport ordering. The documentation being stale was not the reason for the failure: `travel-api/tests/integration/run-api-e2e.sh` is executable test code and contains the dependency at lines 162, 167, 320, and 322.

## Review Fix

The ticket-offer-template endpoints were restored in `TransportsQueryController`, retaining the existing `AdminAuthorizationService` check. The old package-inventory endpoints, location endpoints, and `/test` probe remain removed because they are outside the current E2E contract and are not needed by the current ticket-template query model.

The restored controller tests cover:

- an unauthenticated template write request returning `401`;
- a regular-user template write request returning `403`;
- the admin create and update paths reaching the repository;
- the delete route remaining protected by the same admin authorization boundary.

## Verification

- `bash mvnw -q -Dtest=TransportsQueryControllerAdminAuthorizationTest,TransportsQueryServiceTest,MoneyPrecisionTest,TransportApplicationTests clean test`: passed.
- `bash mvnw -q clean test` in `travel-api/transport-service`: passed.
- `bash -n travel-api/tests/integration/run-api-e2e.sh`: passed.
- `git diff --check`: passed.

## Result

**Approved after fix.** The commit still removes the listed dead methods and legacy code, while the current executable E2E fixture contract remains available and protected by administrator authorization.

Reviewer: Codex
Review date: 2026-08-28
