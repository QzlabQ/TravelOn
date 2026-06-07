SELECT 'CREATE DATABASE hotel_db'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'hotel_db')\gexec

SELECT 'CREATE DATABASE transport_db'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'transport_db')\gexec

SELECT 'CREATE DATABASE user_db'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'user_db')\gexec

SELECT 'CREATE DATABASE reservation_db'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'reservation_db')\gexec

SELECT 'CREATE DATABASE community_db'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'community_db')\gexec

SELECT 'CREATE DATABASE payment_db'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'payment_db')\gexec
