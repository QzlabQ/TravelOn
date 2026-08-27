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

-- ── Official featured attractions ────────────────────────────────────────────
-- Four built-in attractions that ship with the platform. Their ids are fixed and
-- referenced by the home-page preview and by the community-service protection list
-- (these attractions cannot be edited or deleted, even by an admin).
INSERT INTO public.attraction
    (id, name, city_id, description, cover_image_url, created_by_user_id, created_by_name, created_at, updated_at)
VALUES
    ('f0000000-0000-4000-a000-000000000001'::uuid, '颐和园', 'C039',
     '中国清朝时期皇家园林，前身为清漪园，是利用昆明湖、万寿山为基址，以杭州西湖风景为蓝本，汲取江南园林的某些设计手法和意境而建成的一座大型天然山水园，也是保存得最完整的一座皇家行宫御苑，被誉为皇家园林博物馆。',
     '/community/defaults/featured-1.png', 'bdda5c87-857b-30f4-a14d-81c6148ef49d'::uuid, '官方推荐', now(), now()),
    ('f0000000-0000-4000-a000-000000000002'::uuid, '迪士尼乐园', 'C005',
     '上海迪士尼乐园，是中国内地首座迪士尼主题乐园，是一座具有纯正迪士尼风格并融汇了中国风的主题乐园，主题园区分为米奇大街、奇想花园、探险岛、宝藏湾、明日世界、梦幻世界、迪士尼·皮克斯玩具总动员。',
     '/community/defaults/featured-2.png', 'bdda5c87-857b-30f4-a14d-81c6148ef49d'::uuid, '官方推荐', now(), now()),
    ('f0000000-0000-4000-a000-000000000003'::uuid, '布达拉宫', 'C133',
     '布达拉宫，位于拉萨市区西北的玛布日山（红山）上，是集宫殿、灵塔殿、佛殿、行政办公机构、僧官学校、僧舍等诸多功能共计1267间房舍的大型宫堡式建筑群。',
     '/community/defaults/featured-3.png', 'bdda5c87-857b-30f4-a14d-81c6148ef49d'::uuid, '官方推荐', now(), now()),
    ('f0000000-0000-4000-a000-000000000004'::uuid, '维多利亚港', 'C300',
     '维多利亚港（Victoria Harbour）位于香港岛与九龙半岛之间，东起鲤鱼门，西至青衣岛海域，为天然深水港，位列世界三大天然良港。',
     '/community/defaults/featured-4.png', 'bdda5c87-857b-30f4-a14d-81c6148ef49d'::uuid, '官方推荐', now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.attraction_images (attraction_id, image_url)
VALUES
    ('f0000000-0000-4000-a000-000000000001'::uuid, '/community/defaults/featured-1.png'),
    ('f0000000-0000-4000-a000-000000000002'::uuid, '/community/defaults/featured-2.png'),
    ('f0000000-0000-4000-a000-000000000003'::uuid, '/community/defaults/featured-3.png'),
    ('f0000000-0000-4000-a000-000000000004'::uuid, '/community/defaults/featured-4.png');

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
