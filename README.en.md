
# TravelOn: A One-Stop Travel Platform Powered by Microservices

[简体中文](README.md) | **English**

To meet users’ growing demand for travel and vacation bookings, TravelOn needs to build a comprehensive travel platform that integrates flight bookings, hotel accommodations, vacation packages, and train ticket purchases. The platform offers a wide selection of travel products, intelligent itinerary planning tools, transparent pricing information, and a convenient booking process, covering the entire travel journey—from pre-trip planning to in-trip services to post-trip sharing.

## Demo Video

https://github.com/user-attachments/assets/ad9d7145-eee1-4f2c-bebe-2cd7702a3f3a

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Built-in Admin Accounts](#built-in-admin-accounts)
- [Quick Start](#quick-start)
- [Development Mode (Debug)](#development-mode-debug)
- [Production Mode (Build and Serve)](#production-mode-build-and-serve)
- [Testing](#testing)
- [Runtime Extension of Flight and Train Ticket Dates](#runtime-extension-of-flight-and-train-ticket-dates)
- [Mode Comparison](#mode-comparison)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)

---

## Overview

This repository includes:

- Backend service: `travel-api`
- Frontend app: `travel-ui`

AI-related features are supported (API keys required), while community features can run independently.

---

## Tech Stack

Main technologies include Java, TypeScript, Python, PL/pgSQL, and Docker.

---

## Project Structure

<img width="407" height="203" alt="image" src="https://github.com/user-attachments/assets/290798fd-97da-4652-a6d7-5ef31962d1d9" />

```text
travel-on-2026NULLptr/
├─ travel-api/      # Backend services
└─ travel-ui/       # Frontend application
```

---

## Prerequisites

Install the following tools first:

```text
Git
Docker Desktop / Docker Engine
Node.js 20+ or 22+
```

Verify versions:

```cmd
git --version
docker --version
docker compose version
node --version
corepack --version
```

Enable Yarn (Corepack):

```cmd
corepack enable
```

---

## Environment Variables

Both `.env` files must be in place before starting either mode.

- `travel-api/.env`: not committed to the repository — create it locally.
- `travel-ui/.env`: not committed to the repository — create it locally.

> Note: use `#` for comments in `.env`, not `;`.

### Backend: `travel-api/.env`

```env
DEEPSEEK_API_KEY=
AMAP_API_KEY=
DEEPSEEK_MODEL=
DEEPSEEK_FLASH_MODEL=deepseek-v4-flash
DEEPSEEK_PRO_MODEL=deepseek-v4-pro
DEEPSEEK_THINKING_TYPE=disabled
DEEPSEEK_MAX_TOKENS=12000
DEEPSEEK_SLOW_RESPONSE_WARNING_MS=60000
```

| Variable | Description |
| --- | --- |
| `DEEPSEEK_API_KEY` | DeepSeek API key, required for AI features |
| `AMAP_API_KEY` | AMap key for backend POI/route enrichment |
| `DEEPSEEK_MODEL` | Optional default model |
| `DEEPSEEK_FLASH_MODEL` | Flash model name, used by default on the AI planning page |
| `DEEPSEEK_PRO_MODEL` | Pro model name, switchable in the UI |
| `DEEPSEEK_THINKING_TYPE` | Thinking mode switch |
| `DEEPSEEK_MAX_TOKENS` | Max token limit |
| `DEEPSEEK_SLOW_RESPONSE_WARNING_MS` | Slow response warning threshold (ms) |

AI features require keys; leave them empty if you only need non-AI features such as the community pages.

### Backend port overrides (optional)

Every port in `docker-compose.yml` has a default. Override them in the same `.env` if a port is already taken:

| Variable | Default |
| --- | --- |
| `GATEWAY_HOST_PORT` | `58082` |
| `DISCOVERY_HOST_PORT` | `58010` |
| `POSTGRES_HOST_PORT` | `55432` |
| `RABBITMQ_HOST_PORT` | `55672` |
| `RABBITMQ_MANAGEMENT_HOST_PORT` | `55673` |
| `MONGO_HOST_PORT` | `57017` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | `admin` / `admin` |

### Frontend: `travel-ui/.env`

```env
REACT_APP_API_HOSTNAME=localhost
PORT=53000
REACT_APP_API_PORT=58082
REACT_APP_AMAP_JS_API_KEY=
REACT_APP_AMAP_SECURITY_JS_CODE=
```

| Variable | Description |
| --- | --- |
| `REACT_APP_API_HOSTNAME` | Backend hostname (usually `localhost`) |
| `REACT_APP_API_PORT` | Backend gateway port (default `58082`, must match `GATEWAY_HOST_PORT`) |
| `PORT` | Dev server port (default `53000`, applies to `yarn start` only) |
| `REACT_APP_AMAP_JS_API_KEY` | AMap JS key for browser map rendering |
| `REACT_APP_AMAP_SECURITY_JS_CODE` | AMap JS security code |

> **AMap key guidance**
>
> Obtaining an AMap (Gaode) key requires real-name verification and application review, which is a slow process. To avoid committing credentials, `travel-ui/.env` — including `REACT_APP_AMAP_JS_API_KEY` and `REACT_APP_AMAP_SECURITY_JS_CODE` — is not tracked by Git. Create it locally from the example above and fill in your own values.
>
> For local testing:
>
> - Apply for your own AMap JS API key and security code if you need map features.
> - Never commit `travel-ui/.env` or any other environment file containing credentials.
> - If a key has already been exposed, rotate it and review its quota.

**Important:** `REACT_APP_*` variables are inlined at build time.

- In development mode, restart `yarn start` after editing `.env`.
- In production mode, you must re-run `yarn build` after editing `.env` — restarting `yarn serve` alone has no effect.

---

## Built-in Admin Accounts

The project ships with three admin accounts for demonstrating the back-office features. The addresses and plaintext passwords are listed in [`admin_account.txt`](admin_account.txt) at the repository root, and are written into the database on startup by `AdminAccountBootstrap` in user-service.

> **⚠️ These passwords are public in this repository, purely for course review and local testing**
>
> Like the AMap key above, this is a deliberate convenience trade-off so anyone can clone the repo, log in as an admin, and try the full feature set without extra setup. **It must never reach a real deployment.**
>
> When deploying it yourself:
>
> 1. Delete `admin_account.txt` from the repository root.
> 2. Edit the hardcoded `ADMIN_ACCOUNTS` list in `travel-api/user-service/src/main/java/org/microarchitecturovisco/userservice/bootstrap/AdminAccountBootstrap.java` and replace the addresses and passwords with your own strong credentials (reading them from environment variables is recommended).
> 3. Rebuild the user-service image and reset the database before starting.
>
> Note: **deleting `admin_account.txt` alone is not enough.** The same passwords are hardcoded in `AdminAccountBootstrap`, which **resets these three accounts back to the source values on every startup** — so even if you change a password through the UI, a restart will overwrite it. Editing the source is what actually takes effect.

---

## Quick Start

### 1) Clone the repository

```cmd
git clone <your-repository-url>
cd travel-on-2026NULLptr
```

### 2) Prepare environment variables

Create `travel-api/.env` and `travel-ui/.env` as described in [Environment Variables](#environment-variables).

### 3) Start backend

```cmd
cd travel-api
docker compose up -d --build
docker compose ps
```

Gateway URL:

```text
http://localhost:58082
```

> The first start initializes the database and imports seed data, which takes a while. Seeing postgres as `starting` in `docker compose ps` is expected — wait for it to turn `healthy`.

### 4) Install frontend dependencies

```cmd
cd ..\travel-ui
yarn install
```

### 5) Pick a startup mode

- Everyday development with hot reload and debugging → [Development Mode (Debug)](#development-mode-debug)
- Demos, acceptance testing, production-like performance → [Production Mode (Build and Serve)](#production-mode-build-and-serve)

---

## Development Mode (Debug)

For everyday development: hot reload on save, source maps included, and TypeScript sources can be breakpointed directly in browser DevTools.

### Backend

```cmd
cd travel-api

:: start
docker compose up -d

:: stop
docker compose stop
```

### Frontend (hot reload)

```cmd
cd travel-ui

:: start
yarn start

:: stop
Ctrl + C
```

URL:

```text
http://localhost:53000
```

### Debugging notes

- Frontend changes reload automatically; no restart needed.
- After editing `travel-ui/.env`, stop with `Ctrl + C` and run `yarn start` again.
- After changing backend code or `docker-compose.yml`, rebuild the images:

  ```cmd
  cd travel-api
  docker compose up -d --build
  ```

---

## Production Mode (Build and Serve)

For demos and acceptance testing: minified static assets served by a static file server, with no hot reload and no source maps, behaving close to a real deployment.

### 1) Build the frontend

```cmd
cd travel-ui
yarn build
```

Output goes to `travel-ui/build/`. The build bakes the current `REACT_APP_*` values into the bundle, so make sure `.env` is correct before building.

### 2) Serve the build

```cmd
yarn serve
```

This runs `serve -s build -l 53000`. The port is fixed at `53000` and does not read `PORT` from `.env`.

URL:

```text
http://localhost:53000
```

### 3) Backend

The backend runs in containers in both modes, with the same command:

```cmd
cd travel-api
docker compose up -d --build
```

For a full deployment using prebuilt images (frontend container included), see `travel-api/docker-compose-deploy.yml`.

### Stop

Static server:

```cmd
Ctrl + C
```

Backend:

```cmd
cd travel-api
docker compose stop
```

---

## Testing

Run all local Java, Python, and frontend test suites and collect their native
coverage reports with one command:

```powershell
powershell -ExecutionPolicy Bypass -File .\travel-api\tests\run-unit-test-coverage.ps1
```

Prerequisites are Java 21 with Maven, a Python environment with the
`travel-api/ai-arrange-agent-service` test dependencies installed, and Node
dependencies installed for `travel-ui`. The runner attempts every configured
module even if one fails, then exits nonzero when any module failed. It does
not need application services, databases, external APIs, or CI credentials.

The generated summary and per-module logs are written to:

- `artifacts/test-results/latest.md`
- `artifacts/test-results/summary.json`
- `artifacts/test-results/logs/`

Native reports remain with their modules. Run an individual suite with:

```powershell
cd travel-api/transport-service; mvn verify
cd travel-api/ai-arrange-agent-service; python -m pytest -q
cd travel-ui; $env:CI='true'; npm run test:coverage
```

## Runtime Extension of Flight and Train Ticket Dates

The dated ticket data is generated by
`travel-api/scripts/generate_dated_ticket_offers.py` from these templates:

- `travel-api/seed-data/transport/train/ticket_offers.csv`
- `travel-api/seed-data/transport/plane/ticket_offers.csv`

The files actually imported into PostgreSQL are the corresponding
`generated_ticket_offers.csv` files. To extend the ticket dates to
**2026-10-15**, for example:

1. Edit `travel-api/scripts/generate_dated_ticket_offers.py`:

   ```python
   END_DATE = datetime(2026, 10, 15)
   ```

2. Regenerate the flight and train data:

   ```powershell
   cd .\travel-api\scripts
   python .\generate_dated_ticket_offers.py
   cd ..
   ```

3. If Docker Compose is already running, import the data into the existing
   transport database:

   ```powershell
   docker compose exec -T postgres psql -U admin -d transport_db -f /database/seed/transport_seed.sql
   docker compose restart transport
   ```

   Replace `admin` or `transport_db` if they were changed in `.env`. The seed
   script uses deterministic IDs and `ON CONFLICT (id) DO NOTHING`, preserving
   existing data while adding the new dates.

`docker compose up -d --build` only rebuilds the images. If
`travel-api/data/postgres` already contains a database, it does not
automatically regenerate or re-import the ticket CSV files; database
initialization scripts run automatically only when that directory is empty.
After changing the CSV files, explicitly run the `psql` import command above.

To verify the imported date range:

```powershell
cd .\travel-api
docker compose exec postgres psql -U admin -d transport_db -c "SELECT type, MIN(departure_date_time), MAX(departure_date_time), COUNT(*) FROM ticket_offer_templates GROUP BY type;"
```

An overnight train departing on October 15 and arriving on October 16 is
expected.

---

## Mode Comparison

| | Development (Debug) | Production (Build and Serve) |
| --- | --- | --- |
| Frontend command | `yarn start` | `yarn build` + `yarn serve` |
| Hot reload | Yes | No |
| Source maps / breakpoints | Yes | No |
| Minification | No | Yes |
| Port | `PORT` from `.env` (default `53000`) | Fixed `53000` |
| After editing `.env` | Restart `yarn start` | Re-run `yarn build` |
| Use case | Everyday development | Demos, acceptance, performance checks |

---

## Troubleshooting

### 1) Docker services failed to start

```cmd
docker compose ps
docker compose logs
```

Ensure Docker is running and ports are not occupied. Port clashes can be resolved via [Backend port overrides](#backend-port-overrides-optional).

### 2) Frontend cannot reach backend

Check:

- `REACT_APP_API_HOSTNAME`
- `REACT_APP_API_PORT` matches the backend gateway port
- Backend container status (`docker compose ps` in `travel-api`)

In production mode, confirm you re-ran `yarn build` after editing `.env`.

### 3) Map is not displayed

Check frontend AMap variables:

- `REACT_APP_AMAP_JS_API_KEY`
- `REACT_APP_AMAP_SECURITY_JS_CODE`

### 4) AI features unavailable

Check backend AI variables:

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_FLASH_MODEL` / `DEEPSEEK_PRO_MODEL`

Restart backend services after `.env` updates.

---

## FAQ

### Q1: Can I run it without AI keys?

**A:** Yes. Non-AI features (e.g., community pages) can run without AI keys; AI features require proper keys.

### Q2: What is the difference between `AMAP_API_KEY` and `REACT_APP_AMAP_JS_API_KEY`?

**A:**
- `AMAP_API_KEY`: used by backend services (POI/route enrichment)
- `REACT_APP_AMAP_JS_API_KEY`: used by frontend browser map rendering

### Q3: Do I need to restart after updating `.env`?

**A:**
- Frontend, development mode: restart `yarn start`
- Frontend, production mode: re-run `yarn build`, then `yarn serve`
- Backend: re-run `docker compose up -d --build`

### Q4: Which mode should I use?

**A:** Use development mode while writing code (hot reload + breakpoints); use production mode for demos, acceptance testing, and realistic load performance. See [Mode Comparison](#mode-comparison).
