#!/usr/bin/env python3
"""Cross-platform regression test for the legacy PostgreSQL migration."""

from __future__ import annotations

import os
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Sequence


ROOT = Path(__file__).resolve().parents[2]
DATABASE_DIR = (ROOT / "travel-api" / "database").resolve()
POSTGRES_IMAGE = "postgres:16"
CONTAINER = f"travelon-migration-test-{os.getpid()}-{uuid.uuid4().hex[:8]}"


HOTEL_FIXTURES = """
INSERT INTO city (id, country, province, region, city_id, normalized_name)
VALUES ('11111111-1111-1111-1111-111111111111', 'China', 'Beijing', 'North', 'BJ', 'beijing');

INSERT INTO hotel (id, description, name, rating, city_id)
VALUES (101, 'Migration test hotel', 'Test Hotel', 4.5, '11111111-1111-1111-1111-111111111111');

INSERT INTO hotel_photos (hotel_id, photos)
VALUES (101, 'https://example.test/hotel.jpg'),
       (101, 'https://example.test/hotel.jpg');

INSERT INTO room (id, description, guest_capacity, name, price_per_adult, room_type, hotel_id)
VALUES (1001, 'Migration test room', 2, 'Standard', 199.00, 'STANDARD', 101);

INSERT INTO room_reservation (id, date_from, date_to, main_reservation_id, room_id)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '2026-09-01 14:00:00', '2026-09-03 12:00:00',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1001);
"""

TRANSPORT_FIXTURES = """
INSERT INTO city (id, country, province, region, city_id, normalized_name)
VALUES ('22222222-2222-2222-2222-222222222222', 'China', 'Beijing', 'North', 'BJ', 'beijing'),
       ('33333333-3333-3333-3333-333333333333', 'China', 'Shanghai', 'East', 'SH', 'shanghai');

INSERT INTO ticket_offer_templates (
    id, arrival_date_time, arrival_station_code, arrival_terminal_name, carrier,
    code, departure_date_time, departure_station_code, departure_terminal_name,
    price, remaining_seats, seat_class, total_seats, type, arrival_city_id,
    departure_city_id, departure_station_name, arrival_station_name
)
VALUES (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    '2026-09-01 18:00:00', 'SHH', 'Hongqiao', 'Migration Rail',
    'G101', '2026-09-01 13:00:00', 'BJP', 'Beijing South',
    553.00, 20, 'SECOND_CLASS', 100, 'TRAIN', 'SH', 'BJ',
    'Beijing South', 'Shanghai Hongqiao'
);
"""


def execute(
    command: Sequence[str],
    *,
    input_text: str | None = None,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(
        list(command),
        input=input_text,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    if check and completed.returncode != 0:
        rendered = subprocess.list2cmdline(list(command))
        detail = completed.stdout.strip() or "no output"
        raise RuntimeError(f"Command failed ({completed.returncode}): {rendered}\n{detail}")
    return completed


def docker(*args: str, input_text: str | None = None, check: bool = True) -> subprocess.CompletedProcess[str]:
    return execute(["docker", *args], input_text=input_text, check=check)


def psql(database: str, sql: str) -> None:
    docker(
        "exec", "-i", CONTAINER,
        "psql", "-U", "admin", "-d", database, "-v", "ON_ERROR_STOP=1",
        input_text=sql,
    )


def psql_file(database: str, path: str) -> None:
    docker(
        "exec", CONTAINER,
        "psql", "-U", "admin", "-d", database, "-v", "ON_ERROR_STOP=1", "-f", path,
    )


def assert_sql(database: str, expected: str, query: str) -> None:
    completed = docker(
        "exec", CONTAINER,
        "psql", "-U", "admin", "-d", database, "-Atqc", query,
    )
    actual = completed.stdout.strip()
    if actual != expected:
        raise AssertionError(f"Assertion failed for {database}: expected [{expected}], got [{actual}]")


def migration_command(target_db: str, transport_db: str, *, migrate_legacy: bool) -> list[str]:
    command = [
        "docker", "run", "--rm",
        "--network", f"container:{CONTAINER}",
        "-e", "POSTGRES_USER=admin",
        "-e", "POSTGRES_PASSWORD=admin",
        "-e", "HOTEL_DB_NAME=hotel_db",
        "-e", f"TRANSPORT_DB_NAME={transport_db}",
        "-e", f"TRAVEL_CORE_DB_NAME={target_db}",
        "-e", "PGHOST=127.0.0.1",
        "-e", "PGPORT=5432",
    ]
    if migrate_legacy:
        command.extend(["-e", "MIGRATE_LEGACY_DATA=true"])
    command.extend([
        "--mount", f"type=bind,source={DATABASE_DIR},target=/database,readonly",
        "--entrypoint", "/bin/bash",
        POSTGRES_IMAGE,
        "/database/migration/migrate-existing-databases.sh",
    ])
    return command


def run_migration(
    target_db: str,
    transport_db: str,
    *,
    migrate_legacy: bool = True,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    return execute(
        migration_command(target_db, transport_db, migrate_legacy=migrate_legacy),
        check=check,
    )


def wait_for_postgres() -> None:
    for _ in range(60):
        ready = docker(
            "exec", CONTAINER, "pg_isready", "-U", "admin", "-d", "postgres",
            check=False,
        )
        if ready.returncode == 0:
            return
        time.sleep(1)
    raise RuntimeError("PostgreSQL test container did not become ready within 60 seconds")


def prepare_legacy_databases() -> None:
    psql("postgres", "CREATE DATABASE hotel_db;\nCREATE DATABASE transport_db;\n")
    psql_file("hotel_db", "/database/schema/hotel_schema.sql")
    psql_file("transport_db", "/database/schema/transport_schema.sql")
    psql("hotel_db", HOTEL_FIXTURES)
    psql("transport_db", TRANSPORT_FIXTURES)


def verify_opt_out() -> None:
    print("[migration-test] legacy migration disabled by default", flush=True)
    run_migration("travel_core_empty_db", "transport_db", migrate_legacy=False)
    assert_sql("travel_core_empty_db", "0", "SELECT count(*) FROM city")
    assert_sql(
        "travel_core_empty_db", "1",
        "SELECT (to_regclass('public.ticket_offer_templates') IS NOT NULL)::int",
    )
    assert_sql(
        "travel_core_empty_db", "1",
        "SELECT (to_regclass('public.travel_core_migration') IS NULL)::int",
    )


def verify_success_and_idempotency() -> None:
    print("[migration-test] successful opt-in migration", flush=True)
    run_migration("travel_core_db", "transport_db")
    assertions = (
        ("2", "SELECT count(*) FROM city"),
        ("1", "SELECT count(*) FROM hotel WHERE id = 101"),
        ("1", "SELECT count(*) FROM hotel_photos WHERE hotel_id = 101"),
        ("1", "SELECT count(*) FROM room WHERE id = 1001"),
        ("1", "SELECT count(*) FROM room_reservation WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'"),
        ("1", "SELECT count(*) FROM ticket_offer_templates WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'"),
        ("1", "SELECT count(*) FROM travel_core_migration WHERE id = 1"),
        ("1", "SELECT count(*) FROM pg_constraint WHERE conname = 'uq_hotel_photos_hotel_photo'"),
        ("1", "SELECT count(*) FROM hotel h JOIN city c ON c.id = h.city_id WHERE h.id = 101 AND c.city_id = 'BJ'"),
        (
            "1",
            "SELECT count(*) FROM ticket_offer_templates t "
            "JOIN city c1 ON c1.city_id = t.departure_city_id "
            "JOIN city c2 ON c2.city_id = t.arrival_city_id "
            "WHERE t.id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' "
            "AND c1.city_id = 'BJ' AND c2.city_id = 'SH'",
        ),
    )
    for expected, query in assertions:
        assert_sql("travel_core_db", expected, query)

    print("[migration-test] idempotent rerun", flush=True)
    run_migration("travel_core_db", "transport_db")
    assert_sql("travel_core_db", "2", "SELECT count(*) FROM city")
    assert_sql("travel_core_db", "1", "SELECT count(*) FROM hotel_photos WHERE hotel_id = 101")
    assert_sql("travel_core_db", "1", "SELECT count(*) FROM travel_core_migration WHERE id = 1")


def verify_failure_and_retry() -> None:
    print("[migration-test] failure and retry", flush=True)
    failed = run_migration("travel_core_retry_db", "missing_transport_db", check=False)
    if failed.returncode == 0:
        raise AssertionError("Migration unexpectedly succeeded with a missing source database")
    run_migration("travel_core_retry_db", "transport_db")
    assert_sql("travel_core_retry_db", "2", "SELECT count(*) FROM city")
    assert_sql("travel_core_retry_db", "1", "SELECT count(*) FROM hotel_photos WHERE hotel_id = 101")
    assert_sql(
        "travel_core_retry_db", "1",
        "SELECT count(*) FROM ticket_offer_templates WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'",
    )
    assert_sql("travel_core_retry_db", "1", "SELECT count(*) FROM travel_core_migration WHERE id = 1")


def main() -> int:
    try:
        docker("version")
        docker(
            "run", "--detach", "--rm", "--name", CONTAINER,
            "-e", "POSTGRES_USER=admin",
            "-e", "POSTGRES_PASSWORD=admin",
            "-e", "POSTGRES_DB=travel_admin",
            "--mount", f"type=bind,source={DATABASE_DIR},target=/database,readonly",
            POSTGRES_IMAGE,
        )
        wait_for_postgres()
        prepare_legacy_databases()
        verify_opt_out()
        verify_success_and_idempotency()
        verify_failure_and_retry()
        print("[migration-test] PostgreSQL 16 migration test passed", flush=True)
        return 0
    except (AssertionError, OSError, RuntimeError) as exc:
        print(f"[migration-test] FAILED: {exc}", file=sys.stderr, flush=True)
        return 1
    finally:
        try:
            docker("rm", "--force", CONTAINER, check=False)
        except OSError:
            # Docker may be absent or fail to start before a container exists.
            pass


if __name__ == "__main__":
    raise SystemExit(main())
