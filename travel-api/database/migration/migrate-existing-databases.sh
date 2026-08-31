#!/usr/bin/env bash
set -euo pipefail

# Migrate an existing PostgreSQL volume before switching traffic to
# travel-core-service. The old databases are never modified until every
# target-table validation has passed.

: "${POSTGRES_USER:=admin}"
: "${POSTGRES_PASSWORD:=admin}"
: "${PGHOST:=postgres}"
: "${PGPORT:=5432}"
: "${HOTEL_DB_NAME:=hotel_db}"
: "${TRANSPORT_DB_NAME:=transport_db}"
: "${TRAVEL_CORE_DB_NAME:=travel_core_db}"

PGPASSWORD="$POSTGRES_PASSWORD"
 export PGPASSWORD POSTGRES_USER POSTGRES_PASSWORD PGHOST PGPORT

psql_admin=(psql --username "$POSTGRES_USER" --dbname postgres --no-password --set ON_ERROR_STOP=1)
psql_target=(psql --username "$POSTGRES_USER" --dbname "$TRAVEL_CORE_DB_NAME" --no-password --set ON_ERROR_STOP=1 --variable hotel_db="$HOTEL_DB_NAME" --variable transport_db="$TRANSPORT_DB_NAME")

for attempt in {1..60}; do
  if pg_isready --host "$PGHOST" --port "$PGPORT" --username "$POSTGRES_USER" --dbname postgres >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" == 60 ]]; then
    echo "[travel-core-migration] PostgreSQL did not become ready" >&2
    exit 1
  fi
  sleep 2
done

database_exists() {
  [[ "$("${psql_admin[@]}" --tuples-only --no-align --command "SELECT 1 FROM pg_database WHERE datname = '$1'" | tr -d '[:space:]')" == "1" ]]
}

table_exists() {
  [[ "$(psql --username "$POSTGRES_USER" --dbname "$1" --no-password --tuples-only --no-align --command "SELECT (to_regclass('public.$2') IS NOT NULL)::int" | tr -d '[:space:]')" == "1" ]]
}

echo "[travel-core-migration] ensuring database $TRAVEL_CORE_DB_NAME exists"
"${psql_admin[@]}" --variable target_db="$TRAVEL_CORE_DB_NAME" <<'SQL'
SELECT format('CREATE DATABASE %I', :'target_db')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'target_db')\gexec
SQL

if "${psql_target[@]}" --tuples-only --no-align --command \
  "SELECT (to_regclass('public.travel_core_migration') IS NOT NULL)::int" | grep -q '^1$'; then
  echo "[travel-core-migration] migration already completed"
  exit 0
fi

required_tables=(city hotel hotel_photos room room_reservation ticket_offer_templates)
target_has_city="$("${psql_target[@]}" --tuples-only --no-align --command "SELECT (to_regclass('public.city') IS NOT NULL)::int" | tr -d '[:space:]')"
if [[ "$target_has_city" != "1" ]]; then
  echo "[travel-core-migration] applying merged baseline schema"
  "${psql_target[@]}" --file /database/schema/travel_core_schema.sql
else
  for table in "${required_tables[@]}"; do
    if ! table_exists "$TRAVEL_CORE_DB_NAME" "$table"; then
      echo "target database is partially initialized: missing public.$table" >&2
      exit 1
    fi
  done
fi

"${psql_target[@]}" <<'SQL'
CREATE SCHEMA IF NOT EXISTS migration_hotel;
CREATE SCHEMA IF NOT EXISTS migration_transport;

DROP TABLE IF EXISTS migration_hotel.city, migration_hotel.hotel,
    migration_hotel.hotel_photos, migration_hotel.room,
    migration_hotel.room_reservation CASCADE;
DROP TABLE IF EXISTS migration_transport.city,
    migration_transport.ticket_offer_templates CASCADE;

CREATE TABLE migration_hotel.city (LIKE public.city INCLUDING DEFAULTS);
CREATE TABLE migration_hotel.hotel (LIKE public.hotel INCLUDING DEFAULTS);
CREATE TABLE migration_hotel.hotel_photos (LIKE public.hotel_photos INCLUDING DEFAULTS);
CREATE TABLE migration_hotel.room (LIKE public.room INCLUDING DEFAULTS);
CREATE TABLE migration_hotel.room_reservation (LIKE public.room_reservation INCLUDING DEFAULTS);
CREATE TABLE migration_transport.city (LIKE public.city INCLUDING DEFAULTS);
CREATE TABLE migration_transport.ticket_offer_templates (LIKE public.ticket_offer_templates INCLUDING DEFAULTS);

-- Older baselines did not protect this collection table from duplicates.
DELETE FROM public.hotel_photos duplicate_row
USING public.hotel_photos retained_row
WHERE duplicate_row.ctid > retained_row.ctid
  AND duplicate_row.hotel_id = retained_row.hotel_id
  AND duplicate_row.photos IS NOT DISTINCT FROM retained_row.photos;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.hotel_photos'::regclass
          AND conname = 'uq_hotel_photos_hotel_photo'
    ) THEN
        ALTER TABLE public.hotel_photos
            ADD CONSTRAINT uq_hotel_photos_hotel_photo UNIQUE (hotel_id, photos);
    END IF;
END $$;
SQL

dump_into_staging() {
  local source_db="$1"
  local schema="$2"
  shift 2

  if ! database_exists "$source_db"; then
    echo "[travel-core-migration] source database $source_db does not exist" >&2
    exit 1
  fi

  for table in "$@"; do
    if table_exists "$source_db" "$table"; then
      echo "[travel-core-migration] copying $source_db.public.$table"
      pg_dump --username "$POSTGRES_USER" --dbname "$source_db" --no-password \
        --data-only --inserts --no-owner --no-privileges --table="public.$table" \
        | sed "s/public\./$schema./g" \
        | "${psql_target[@]}"
    else
      echo "[travel-core-migration] $source_db.public.$table does not exist; skipping"
    fi
  done
}

dump_into_staging "$HOTEL_DB_NAME" migration_hotel \
  city hotel hotel_photos room room_reservation
dump_into_staging "$TRANSPORT_DB_NAME" migration_transport \
  city ticket_offer_templates

"${psql_target[@]}" <<'SQL'
-- Cities are merged by the stable city_id, not by the source UUID. This keeps
-- hotel foreign keys valid even when old databases were created at different times.
INSERT INTO public.city (id, city_id, country, province, region, normalized_name)
SELECT DISTINCT ON (city_id) id, city_id, country, province, region, normalized_name
FROM migration_hotel.city
WHERE city_id IS NOT NULL
ORDER BY city_id, id
ON CONFLICT (city_id) DO NOTHING;

INSERT INTO public.city (id, city_id, country, province, region, normalized_name)
SELECT DISTINCT ON (city_id) id, city_id, country, province, region, normalized_name
FROM migration_transport.city
WHERE city_id IS NOT NULL
ORDER BY city_id, id
ON CONFLICT (city_id) DO NOTHING;

INSERT INTO public.hotel (id, name, rating, description, city_id)
SELECT h.id, h.name, h.rating, h.description, target_city.id
FROM migration_hotel.hotel h
LEFT JOIN migration_hotel.city source_city ON source_city.id = h.city_id
LEFT JOIN public.city target_city ON target_city.city_id = source_city.city_id
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    rating = EXCLUDED.rating,
    description = EXCLUDED.description,
    city_id = EXCLUDED.city_id;

INSERT INTO public.hotel_photos (hotel_id, photos)
SELECT hotel_id, photos
FROM migration_hotel.hotel_photos
ON CONFLICT (hotel_id, photos) DO NOTHING;

INSERT INTO public.room (id, name, description, guest_capacity, room_type, price_per_adult, hotel_id)
SELECT id, name, description, guest_capacity, room_type, price_per_adult, hotel_id
FROM migration_hotel.room
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    guest_capacity = EXCLUDED.guest_capacity,
    room_type = EXCLUDED.room_type,
    price_per_adult = EXCLUDED.price_per_adult,
    hotel_id = EXCLUDED.hotel_id;

INSERT INTO public.room_reservation (id, date_from, date_to, main_reservation_id, room_id)
SELECT id, date_from, date_to, main_reservation_id, room_id
FROM migration_hotel.room_reservation
ON CONFLICT (id) DO UPDATE SET
    date_from = EXCLUDED.date_from,
    date_to = EXCLUDED.date_to,
    main_reservation_id = EXCLUDED.main_reservation_id,
    room_id = EXCLUDED.room_id;

INSERT INTO public.ticket_offer_templates (
    id, arrival_date_time, arrival_station_code, arrival_terminal_name, carrier,
    code, departure_date_time, departure_station_code, departure_terminal_name,
    price, remaining_seats, seat_class, total_seats, type, arrival_city_id,
    departure_city_id, departure_station_name, arrival_station_name
)
SELECT id, arrival_date_time, arrival_station_code, arrival_terminal_name, carrier,
       code, departure_date_time, departure_station_code, departure_terminal_name,
       price, remaining_seats, seat_class, total_seats, type, arrival_city_id,
       departure_city_id, departure_station_name, arrival_station_name
FROM migration_transport.ticket_offer_templates
ON CONFLICT (id) DO UPDATE SET
    arrival_date_time = EXCLUDED.arrival_date_time,
    arrival_station_code = EXCLUDED.arrival_station_code,
    arrival_terminal_name = EXCLUDED.arrival_terminal_name,
    carrier = EXCLUDED.carrier,
    code = EXCLUDED.code,
    departure_date_time = EXCLUDED.departure_date_time,
    departure_station_code = EXCLUDED.departure_station_code,
    departure_terminal_name = EXCLUDED.departure_terminal_name,
    price = EXCLUDED.price,
    remaining_seats = EXCLUDED.remaining_seats,
    seat_class = EXCLUDED.seat_class,
    total_seats = EXCLUDED.total_seats,
    type = EXCLUDED.type,
    arrival_city_id = EXCLUDED.arrival_city_id,
    departure_city_id = EXCLUDED.departure_city_id,
    departure_station_name = EXCLUDED.departure_station_name,
    arrival_station_name = EXCLUDED.arrival_station_name;

DO $$
DECLARE missing_count bigint;
BEGIN
    SELECT count(*) INTO missing_count
    FROM migration_hotel.hotel source
    LEFT JOIN public.hotel target ON target.id = source.id
    WHERE target.id IS NULL;
    IF missing_count > 0 THEN
        RAISE EXCEPTION 'hotel migration validation failed: % rows missing', missing_count;
    END IF;

    SELECT count(*) INTO missing_count
    FROM migration_hotel.hotel source
    LEFT JOIN migration_hotel.city source_city ON source_city.id = source.city_id
    LEFT JOIN public.city target_city ON target_city.city_id = source_city.city_id
    WHERE source.city_id IS NOT NULL AND target_city.id IS NULL;
    IF missing_count > 0 THEN
        RAISE EXCEPTION 'hotel city reference validation failed: % rows missing', missing_count;
    END IF;

    SELECT count(*) INTO missing_count
    FROM migration_hotel.city source
    LEFT JOIN public.city target ON target.city_id = source.city_id
    WHERE source.city_id IS NOT NULL AND target.city_id IS NULL;
    IF missing_count > 0 THEN
        RAISE EXCEPTION 'hotel city migration validation failed: % rows missing', missing_count;
    END IF;

    SELECT count(*) INTO missing_count
    FROM migration_transport.city source
    LEFT JOIN public.city target ON target.city_id = source.city_id
    WHERE source.city_id IS NOT NULL AND target.city_id IS NULL;
    IF missing_count > 0 THEN
        RAISE EXCEPTION 'transport city migration validation failed: % rows missing', missing_count;
    END IF;

    SELECT count(*) INTO missing_count
    FROM migration_hotel.room source
    LEFT JOIN public.room target ON target.id = source.id
    WHERE target.id IS NULL;
    IF missing_count > 0 THEN
        RAISE EXCEPTION 'room migration validation failed: % rows missing', missing_count;
    END IF;

    SELECT count(*) INTO missing_count
    FROM migration_hotel.room_reservation source
    LEFT JOIN public.room_reservation target ON target.id = source.id
    WHERE target.id IS NULL;
    IF missing_count > 0 THEN
        RAISE EXCEPTION 'room_reservation migration validation failed: % rows missing', missing_count;
    END IF;

    SELECT count(*) INTO missing_count
    FROM migration_transport.ticket_offer_templates source
    LEFT JOIN public.ticket_offer_templates target ON target.id = source.id
    WHERE target.id IS NULL;
    IF missing_count > 0 THEN
        RAISE EXCEPTION 'ticket offer migration validation failed: % rows missing', missing_count;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.hotel h
        WHERE h.city_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.city c WHERE c.id = h.city_id)
    ) THEN
        RAISE EXCEPTION 'hotel city foreign-key validation failed';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.ticket_offer_templates t
        WHERE NOT EXISTS (SELECT 1 FROM public.city c WHERE c.city_id = t.departure_city_id)
           OR NOT EXISTS (SELECT 1 FROM public.city c WHERE c.city_id = t.arrival_city_id)
    ) THEN
        RAISE EXCEPTION 'ticket offer city foreign-key validation failed';
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.travel_core_migration (
    id integer PRIMARY KEY CHECK (id = 1),
    hotel_database text NOT NULL,
    transport_database text NOT NULL,
    migrated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.travel_core_migration (id, hotel_database, transport_database)
VALUES (1, :'hotel_db', :'transport_db')
ON CONFLICT (id) DO NOTHING;

DROP SCHEMA migration_hotel CASCADE;
DROP SCHEMA migration_transport CASCADE;
SQL

echo "[travel-core-migration] migration and validation completed"
