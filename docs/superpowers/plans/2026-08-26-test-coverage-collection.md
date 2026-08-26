# Test Coverage Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repeatable Java, Python, and frontend coverage reports and record their measured results without enforcing thresholds.

**Architecture:** Configure coverage at each existing test runner boundary. JaCoCo attaches to Maven test JVMs and emits XML/HTML/CSV during `verify`; pytest-cov emits terminal/XML/HTML output; CRA/Jest emits text/LCOV/JSON through a named npm script. Update the existing test record only after fresh commands produce reports.

**Tech Stack:** Maven JaCoCo, JUnit 5, pytest-cov, pytest, Create React App/Jest, PowerShell.

---

### Task 1: Configure Java coverage

**Files:**
- Modify: every `travel-api/*-service/pom.xml` and `travel-api/api-gateway/pom.xml` that contains `spring-boot-starter-test`

- [ ] Add `org.jacoco:jacoco-maven-plugin` version `0.8.12` under `<build><plugins>` with `prepare-agent` in `initialize` and `report` in `verify`; leave `check` absent so no threshold is enforced.
- [ ] Run `mvn verify` in each Java module and confirm `target/site/jacoco/jacoco.xml` and `target/site/jacoco/index.html` exist.

### Task 2: Configure Python coverage

**Files:**
- Modify: `travel-api/ai-arrange-agent-service/pytest.ini`
- Modify: `travel-api/ai-arrange-agent-service/requirements.txt` or the existing dependency manifest

- [ ] Add `pytest-cov` to the existing test dependency manifest.
- [ ] Configure `addopts` with `--cov=app --cov-branch --cov-report=term-missing --cov-report=xml:coverage.xml --cov-report=html:htmlcov` using the actual production package path discovered in the module.
- [ ] Run `pytest -q` and confirm the terminal summary plus `coverage.xml` and `htmlcov/index.html`.

### Task 3: Configure frontend coverage

**Files:**
- Modify: `travel-ui/package.json`

- [ ] Add `test:coverage` script running `CI=true react-scripts test --runInBand --coverage`.
- [ ] Run `npm run test:coverage` and confirm Jest reports line/function/branch coverage and creates `coverage/lcov.info` plus `coverage/coverage-final.json`.

### Task 4: Record measured coverage

**Files:**
- Modify: `docs/testing-results-2026-08-26.md`

- [ ] Parse each generated report or command summary and add a coverage table with actual line, branch, and function/method values where available.
- [ ] Record exact report paths and state that no threshold was enforced.

### Task 5: Final verification

- [ ] Run all existing tests again: Java `mvn test`, Python `pytest -q`, frontend `CI=true npm test -- --runInBand`.
- [ ] Run `git diff --check` and inspect `git status`; do not stage unrelated user files.
- [ ] Commit coverage configuration and updated results with `test: add coverage reporting`.
