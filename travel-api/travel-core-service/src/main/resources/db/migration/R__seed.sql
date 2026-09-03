-- Seed data for this service, managed by Flyway as a repeatable migration.
-- Re-runs only when this file changes; idempotent via INSERT ... ON CONFLICT.
-- Converted from database/seed: psql copy meta-command -> server-side COPY
-- (reads CSVs from /seed-data on the postgres container; admin is superuser).

CREATE TEMP TABLE seed_hotels (
    source_id integer,
    name text,
    description text,
    city_id text
);

CREATE TEMP TABLE seed_cities (
    city_id text,
    country text,
    province text,
    city_name text
);

CREATE TEMP TABLE seed_hotel_rooms (
    source_hotel_id integer,
    name text,
    description text,
    price numeric(12,2),
    id bigint,
    guest_capacity integer,
    room_type text
);

CREATE TEMP TABLE seed_hotel_photos (
    source_hotel_id integer,
    photo_url text
);

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

COPY seed_cities FROM '/seed-data/common/cities.csv' WITH (FORMAT csv, HEADER true, DELIMITER E'\t', NULL '');
COPY seed_hotels FROM '/seed-data/hotel/hotels.csv' WITH (FORMAT csv, HEADER true, DELIMITER E'\t', NULL '');
COPY seed_hotel_rooms FROM '/seed-data/hotel/hotel_rooms.csv' WITH (FORMAT csv, HEADER true, DELIMITER E'\t', NULL '');
COPY seed_hotel_photos FROM '/seed-data/hotel/hotel_photos.csv' WITH (FORMAT csv, HEADER true, DELIMITER E'\t', NULL '');
COPY seed_ticket_offers FROM '/seed-data/transport/plane/generated_ticket_offers.csv' WITH (FORMAT csv, HEADER true, DELIMITER E'\t', NULL '');
COPY seed_ticket_offers FROM '/seed-data/transport/train/generated_ticket_offers.csv' WITH (FORMAT csv, HEADER true, DELIMITER E'\t', NULL '');

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
FROM seed_cities
WHERE city_id IN (
    SELECT city_id FROM seed_hotels WHERE city_id IS NOT NULL AND city_id <> ''
    UNION
    SELECT departure_city_id FROM seed_ticket_offers WHERE departure_city_id IS NOT NULL AND departure_city_id <> ''
    UNION
    SELECT arrival_city_id FROM seed_ticket_offers WHERE arrival_city_id IS NOT NULL AND arrival_city_id <> ''
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.hotel (id, name, rating, description, city_id)
SELECT h.source_id,
       h.name,
       0,
       h.description,
       (substr(md5(h.city_id), 1, 8) || '-' || substr(md5(h.city_id), 9, 4) || '-' ||
        substr(md5(h.city_id), 13, 4) || '-' || substr(md5(h.city_id), 17, 4) || '-' ||
        substr(md5(h.city_id), 21, 12))::uuid
FROM seed_hotels h
JOIN seed_cities c ON c.city_id = h.city_id
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.hotel_photos (hotel_id, photos)
SELECT h.source_id, p.photo_url
FROM seed_hotel_photos p
JOIN seed_hotels h ON h.source_id = p.source_hotel_id
ON CONFLICT (hotel_id, photos) DO NOTHING;

INSERT INTO public.room (id, name, description, guest_capacity, room_type, price_per_adult, hotel_id)
SELECT r.id,
       r.name,
       r.description,
       COALESCE(r.guest_capacity, 2),
       COALESCE(r.room_type, 'STANDARD'),
       r.price,
       h.source_id
FROM seed_hotel_rooms r
JOIN seed_hotels h ON h.source_id = r.source_hotel_id
ON CONFLICT (id) DO NOTHING;

-- 票务种子表整表重建。
--
-- 这张表的主键是行内容（含价格）的 md5，所以改一次种子价格就是一批全新的 id：
-- 只做 INSERT ... ON CONFLICT DO NOTHING 的话旧行会原样留下，同一个班次同一天
-- 会同时存在新旧两个价格。这张表是纯种子数据、没有任何外键指向它，直接清空重建。
DELETE FROM public.ticket_offer_templates;

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
