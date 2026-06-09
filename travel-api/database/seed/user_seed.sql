SET search_path TO public;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

CREATE TEMP TABLE seed_users (
    email text,
    password text,
    first_name text,
    last_name text
);

\copy seed_users FROM '/seed-data/user/users.csv' WITH (FORMAT csv, HEADER true, DELIMITER ',', NULL '')

INSERT INTO public.users (
    id,
    email,
    password_hash,
    name,
    surname,
    loyalty_tier,
    created_at,
    updated_at
)
SELECT (substr(md5(email || password || first_name || last_name), 1, 8) || '-' ||
        substr(md5(email || password || first_name || last_name), 9, 4) || '-' ||
        substr(md5(email || password || first_name || last_name), 13, 4) || '-' ||
        substr(md5(email || password || first_name || last_name), 17, 4) || '-' ||
        substr(md5(email || password || first_name || last_name), 21, 12))::uuid,
       lower(email),
       encode(digest('travel-ui:' || password, 'sha256'), 'hex'),
       first_name,
       last_name,
       'Explorer',
       now(),
       now()
FROM seed_users
ON CONFLICT (id) DO NOTHING;
