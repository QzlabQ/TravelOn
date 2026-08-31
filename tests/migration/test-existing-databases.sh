#!/usr/bin/env bash
set -euo pipefail

# Reproduce the old two-database layout in PostgreSQL 16 and verify the
# upgrade path before a deployment switches to travel-core-service.

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
database_dir="$repo_root/travel-api/database"
container="travelon-migration-test-$$"

cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run -d --rm \
  --name "$container" \
  -e POSTGRES_USER=admin \
  -e POSTGRES_PASSWORD=admin \
  -e POSTGRES_DB=travel_admin \
  -v "$database_dir:/database:ro" \
  postgres:16 >/dev/null

for attempt in {1..60}; do
  if docker exec "$container" pg_isready -U admin -d postgres >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" == 60 ]]; then
    echo "PostgreSQL test container did not become ready" >&2
    exit 1
  fi
  sleep 1
done

docker exec -i "$container" psql -U admin -d postgres -v ON_ERROR_STOP=1 <<'SQL'
CREATE DATABASE hotel_db;
CREATE DATABASE transport_db;
SQL

docker exec "$container" psql -U admin -d hotel_db -v ON_ERROR_STOP=1 \
  -f /database/schema/hotel_schema.sql
docker exec "$container" psql -U admin -d transport_db -v ON_ERROR_STOP=1 \
  -f /database/schema/transport_schema.sql

# The two source databases deliberately use different UUIDs for the same
# stable city_id. The migration must keep one city row and remap hotel FKs by
# city_id. The old hotel schema also has no unique constraint on photos.
docker exec -i "$container" psql -U admin -d hotel_db -v ON_ERROR_STOP=1 <<'SQL'
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
SQL

docker exec -i "$container" psql -U admin -d transport_db -v ON_ERROR_STOP=1 <<'SQL'
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
SQL

run_migration() {
  local target_db="$1"
  local transport_db="$2"

  docker run --rm \
    --network "container:$container" \
    -e POSTGRES_USER=admin \
    -e POSTGRES_PASSWORD=admin \
    -e HOTEL_DB_NAME=hotel_db \
    -e TRANSPORT_DB_NAME="$transport_db" \
    -e TRAVEL_CORE_DB_NAME="$target_db" \
    -e PGHOST=127.0.0.1 \
    -e PGPORT=5432 \
    -v "$database_dir:/database:ro" \
    --entrypoint /bin/bash postgres:16 \
    /database/migration/migrate-existing-databases.sh
}

assert_sql() {
  local database="$1"
  local expected="$2"
  local query="$3"
  local actual
  actual="$(docker exec "$container" psql -U admin -d "$database" -Atqc "$query")"
  if [[ "$actual" != "$expected" ]]; then
    echo "Assertion failed for $database: expected [$expected], got [$actual]" >&2
    exit 1
  fi
}

echo "[migration-test] successful migration"
run_migration travel_core_db transport_db >/dev/null

assert_sql travel_core_db 2 "SELECT count(*) FROM city"
assert_sql travel_core_db 1 "SELECT count(*) FROM hotel WHERE id = 101"
assert_sql travel_core_db 1 "SELECT count(*) FROM hotel_photos WHERE hotel_id = 101"
assert_sql travel_core_db 1 "SELECT count(*) FROM room WHERE id = 1001"
assert_sql travel_core_db 1 "SELECT count(*) FROM room_reservation WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'"
assert_sql travel_core_db 1 "SELECT count(*) FROM ticket_offer_templates WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'"
assert_sql travel_core_db 1 "SELECT count(*) FROM travel_core_migration WHERE id = 1"
assert_sql travel_core_db 1 "SELECT count(*) FROM pg_constraint WHERE conname = 'uq_hotel_photos_hotel_photo'"
assert_sql travel_core_db 1 "SELECT count(*) FROM hotel h JOIN city c ON c.id = h.city_id WHERE h.id = 101 AND c.city_id = 'BJ'"
assert_sql travel_core_db 1 "SELECT count(*) FROM ticket_offer_templates t JOIN city c1 ON c1.city_id = t.departure_city_id JOIN city c2 ON c2.city_id = t.arrival_city_id WHERE t.id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' AND c1.city_id = 'BJ' AND c2.city_id = 'SH'"

echo "[migration-test] idempotent rerun"
run_migration travel_core_db transport_db >/dev/null
assert_sql travel_core_db 2 "SELECT count(*) FROM city"
assert_sql travel_core_db 1 "SELECT count(*) FROM hotel_photos WHERE hotel_id = 101"
assert_sql travel_core_db 1 "SELECT count(*) FROM travel_core_migration WHERE id = 1"

echo "[migration-test] failure and retry"
if run_migration travel_core_retry_db missing_transport_db >/dev/null 2>&1; then
  echo "Migration unexpectedly succeeded with a missing source database" >&2
  exit 1
fi
run_migration travel_core_retry_db transport_db >/dev/null
assert_sql travel_core_retry_db 2 "SELECT count(*) FROM city"
assert_sql travel_core_retry_db 1 "SELECT count(*) FROM hotel_photos WHERE hotel_id = 101"
assert_sql travel_core_retry_db 1 "SELECT count(*) FROM ticket_offer_templates WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'"
assert_sql travel_core_retry_db 1 "SELECT count(*) FROM travel_core_migration WHERE id = 1"

echo "[migration-test] PostgreSQL 16 migration test passed"
