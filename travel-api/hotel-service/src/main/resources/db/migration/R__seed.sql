-- Seed data for this service, managed by Flyway as a repeatable migration.
-- Re-runs only when this file changes; idempotent via INSERT ... ON CONFLICT
-- and, for tables without a unique key (hotel_photos), INSERT ... WHERE NOT EXISTS.
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

COPY seed_cities FROM '/seed-data/common/cities.csv' WITH (FORMAT csv, HEADER true, DELIMITER E'\t', NULL '');
COPY seed_hotels FROM '/seed-data/hotel/hotels.csv' WITH (FORMAT csv, HEADER true, DELIMITER E'\t', NULL '');
COPY seed_hotel_rooms FROM '/seed-data/hotel/hotel_rooms.csv' WITH (FORMAT csv, HEADER true, DELIMITER E'\t', NULL '');
COPY seed_hotel_photos FROM '/seed-data/hotel/hotel_photos.csv' WITH (FORMAT csv, HEADER true, DELIMITER E'\t', NULL '');

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
WHERE city_id IN (SELECT DISTINCT city_id FROM seed_hotels WHERE city_id IS NOT NULL AND city_id <> '')
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

-- hotel_photos has no unique key, so ON CONFLICT cannot dedupe. Guard with
-- NOT EXISTS so re-running this repeatable migration does not duplicate rows.
INSERT INTO public.hotel_photos (hotel_id, photos)
SELECT h.source_id, p.photo_url
FROM seed_hotel_photos p
JOIN seed_hotels h ON h.source_id = p.source_hotel_id
WHERE NOT EXISTS (
    SELECT 1 FROM public.hotel_photos existing
    WHERE existing.hotel_id = h.source_id
      AND existing.photos = p.photo_url
);

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
