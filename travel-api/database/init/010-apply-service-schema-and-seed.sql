\connect hotel_db
\i /database/schema/hotel_schema.sql
\i /database/seed/hotel_seed.sql

\connect transport_db
\i /database/schema/transport_schema.sql
\i /database/seed/transport_seed.sql

\connect user_db
\i /database/schema/user_schema.sql
\i /database/seed/user_seed.sql

\connect reservation_db
\i /database/schema/reservation_schema.sql

\connect community_db
\i /database/schema/community_schema.sql
\i /database/seed/community_seed.sql

\connect payment_db
