CREATE TEMP TABLE seed_cities_community (
    city_id text,
    country text,
    province text,
    city_name text
);

\copy seed_cities_community FROM '/seed-data/common/cities.csv' WITH (FORMAT csv, HEADER true, DELIMITER E'\t', NULL '')

INSERT INTO public.city (id, city_id, country, province, region, normalized_name)
SELECT (substr(md5(city_id), 1, 8) || '-' || substr(md5(city_id), 9, 4) || '-' ||
        substr(md5(city_id), 13, 4) || '-' || substr(md5(city_id), 17, 4) || '-' ||
        substr(md5(city_id), 21, 12))::uuid,
       city_id,
       country,
       province,
       city_name,
       city_name
FROM seed_cities_community
ON CONFLICT (id) DO NOTHING;

CREATE TEMP TABLE seed_hotel_reviews (
    id bigint,
    target_id text,
    rating numeric,
    content text,
    created_at timestamp
);

CREATE TEMP TABLE seed_hotels_lookup (
    source_id text,
    name text,
    description text,
    city_id text
);

\copy seed_hotel_reviews FROM '/seed-data/hotel/hotel_reviews.csv' WITH (FORMAT csv, HEADER true, DELIMITER E'\t', NULL '')
\copy seed_hotels_lookup FROM '/seed-data/hotel/hotels.csv' WITH (FORMAT csv, HEADER true, DELIMITER E'\t', NULL '')

INSERT INTO public.review (
    id,
    target_type,
    target_id,
    target_name,
    rating,
    content,
    category,
    author_user_id,
    author_name,
    created_at,
    updated_at
)
SELECT r.id,
       'HOTEL',
       r.target_id,
       h.name,
       LEAST(5, GREATEST(1, round(r.rating)::integer)),
       r.content,
       'HOTEL',
       'bdda5c87-857b-30f4-a14d-81c6148ef49d'::uuid,
       'Seed Traveler',
       r.created_at AT TIME ZONE 'UTC',
       r.created_at AT TIME ZONE 'UTC'
FROM seed_hotel_reviews r
JOIN seed_hotels_lookup h ON h.source_id = r.target_id
WHERE r.content IS NOT NULL AND r.content <> ''
ON CONFLICT (id) DO NOTHING;
