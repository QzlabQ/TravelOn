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
    role,
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
       'USER',
       now(),
       now()
FROM seed_users
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (
    id,
    email,
    password_hash,
    name,
    surname,
    loyalty_tier,
    role,
    created_at,
    updated_at
)
VALUES
    (
        (substr(md5('admin:admin@nullptr.email'), 1, 8) || '-' ||
         substr(md5('admin:admin@nullptr.email'), 9, 4) || '-' ||
         substr(md5('admin:admin@nullptr.email'), 13, 4) || '-' ||
         substr(md5('admin:admin@nullptr.email'), 17, 4) || '-' ||
         substr(md5('admin:admin@nullptr.email'), 21, 12))::uuid,
        'admin@nullptr.email',
        encode(digest('travel-ui:' || 'd53v(B*&tT^87Ym', 'sha256'), 'hex'),
        'Admin',
        '',
        'Administrator',
        'ADMIN',
        now(),
        now()
    ),
    (
        (substr(md5('admin:administrator@nullptr.email'), 1, 8) || '-' ||
         substr(md5('admin:administrator@nullptr.email'), 9, 4) || '-' ||
         substr(md5('admin:administrator@nullptr.email'), 13, 4) || '-' ||
         substr(md5('admin:administrator@nullptr.email'), 17, 4) || '-' ||
         substr(md5('admin:administrator@nullptr.email'), 21, 12))::uuid,
        'administrator@nullptr.email',
        encode(digest('travel-ui:' || '&Bt6Rg8h^&756dS', 'sha256'), 'hex'),
        'Admin',
        '',
        'Administrator',
        'ADMIN',
        now(),
        now()
    ),
    (
        (substr(md5('admin:nullptrofficial@nullptr.email'), 1, 8) || '-' ||
         substr(md5('admin:nullptrofficial@nullptr.email'), 9, 4) || '-' ||
         substr(md5('admin:nullptrofficial@nullptr.email'), 13, 4) || '-' ||
         substr(md5('admin:nullptrofficial@nullptr.email'), 17, 4) || '-' ||
         substr(md5('admin:nullptrofficial@nullptr.email'), 21, 12))::uuid,
        'nullptrofficial@nullptr.email',
        encode(digest('travel-ui:' || 'aDmIn_Psw7d6%N#$', 'sha256'), 'hex'),
        'Admin',
        '',
        'Administrator',
        'ADMIN',
        now(),
        now()
    )
ON CONFLICT (email) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    loyalty_tier = EXCLUDED.loyalty_tier,
    role = EXCLUDED.role,
    updated_at = now();
