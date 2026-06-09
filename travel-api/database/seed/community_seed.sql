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
