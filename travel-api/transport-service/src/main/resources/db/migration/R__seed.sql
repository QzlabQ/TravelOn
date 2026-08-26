-- Seed data for this service, managed by Flyway as a repeatable migration.
-- Re-runs only when this file changes; idempotent via INSERT ... ON CONFLICT.
-- Converted from database/seed: psql copy meta-command -> server-side COPY
-- (reads CSVs from /seed-data on the postgres container; admin is superuser).

CREATE TEMP TABLE seed_ticket_offers (
    type text,
    departure_city_id text,
    arrival_city_id text,
    departure_station_code text,
    departure_terminal_name text,
    arrival_station_code text,
    arrival_terminal_name text,
    departure_date_time timestamp,
    arrival_date_time timestamp,
    carrier text,
    code text,
    seat_class text,
    price numeric(12,2),
    remaining_seats integer,
    total_seats integer,
    departure_station_name text,
    arrival_station_name text
);

-- ticket_offers.csv files are schedule templates only; the dated booking
-- inventory is produced by scripts/generate_dated_ticket_offers.py into the
-- generated_ticket_offers.csv files, which are the rows actually imported.
COPY seed_ticket_offers FROM '/seed-data/transport/plane/generated_ticket_offers.csv' WITH (FORMAT csv, HEADER true, DELIMITER E'\t', NULL '');
COPY seed_ticket_offers FROM '/seed-data/transport/train/generated_ticket_offers.csv' WITH (FORMAT csv, HEADER true, DELIMITER E'\t', NULL '');

CREATE TEMP TABLE seed_cities_transport (
    city_id text,
    country text,
    province text,
    city_name text
);

COPY seed_cities_transport FROM '/seed-data/common/cities.csv' WITH (FORMAT csv, HEADER true, DELIMITER E'\t', NULL '');

INSERT INTO public.city (id, city_id, country, province, region, normalized_name)
SELECT DISTINCT
       (substr(md5(city_id), 1, 8) || '-' || substr(md5(city_id), 9, 4) || '-' ||
        substr(md5(city_id), 13, 4) || '-' || substr(md5(city_id), 17, 4) || '-' ||
        substr(md5(city_id), 21, 12))::uuid,
       city_id,
       country,
       province,
       city_name,
       city_name
FROM seed_cities_transport
WHERE city_id IN (
    SELECT DISTINCT departure_city_id FROM seed_ticket_offers WHERE departure_city_id IS NOT NULL AND departure_city_id <> ''
    UNION
    SELECT DISTINCT arrival_city_id FROM seed_ticket_offers WHERE arrival_city_id IS NOT NULL AND arrival_city_id <> ''
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.ticket_offer_templates (
    id,
    type,
    departure_city_id,
    arrival_city_id,
    departure_station_code,
    departure_terminal_name,
    arrival_station_code,
    arrival_terminal_name,
    departure_date_time,
    arrival_date_time,
    carrier,
    code,
    seat_class,
    price,
    remaining_seats,
    total_seats,
    departure_station_name,
    arrival_station_name
)
SELECT (substr(md5(concat_ws(E'\t', type, departure_city_id, arrival_city_id, departure_station_code,
                             departure_terminal_name, arrival_station_code, arrival_terminal_name,
                             departure_date_time::text, arrival_date_time::text, carrier, code,
                             seat_class, price::text)), 1, 8) || '-' ||
        substr(md5(concat_ws(E'\t', type, departure_city_id, arrival_city_id, departure_station_code,
                             departure_terminal_name, arrival_station_code, arrival_terminal_name,
                             departure_date_time::text, arrival_date_time::text, carrier, code,
                             seat_class, price::text)), 9, 4) || '-' ||
        substr(md5(concat_ws(E'\t', type, departure_city_id, arrival_city_id, departure_station_code,
                             departure_terminal_name, arrival_station_code, arrival_terminal_name,
                             departure_date_time::text, arrival_date_time::text, carrier, code,
                             seat_class, price::text)), 13, 4) || '-' ||
        substr(md5(concat_ws(E'\t', type, departure_city_id, arrival_city_id, departure_station_code,
                             departure_terminal_name, arrival_station_code, arrival_terminal_name,
                             departure_date_time::text, arrival_date_time::text, carrier, code,
                             seat_class, price::text)), 17, 4) || '-' ||
        substr(md5(concat_ws(E'\t', type, departure_city_id, arrival_city_id, departure_station_code,
                             departure_terminal_name, arrival_station_code, arrival_terminal_name,
                             departure_date_time::text, arrival_date_time::text, carrier, code,
                             seat_class, price::text)), 21, 12))::uuid,
       type,
       departure_city_id,
       arrival_city_id,
       departure_station_code,
       departure_terminal_name,
       arrival_station_code,
       arrival_terminal_name,
       departure_date_time,
       arrival_date_time,
       carrier,
       code,
       seat_class,
       price,
       remaining_seats,
       total_seats,
       departure_station_name,
       arrival_station_name
FROM seed_ticket_offers
ON CONFLICT (id) DO NOTHING;
