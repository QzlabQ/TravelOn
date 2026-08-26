-- First-boot provisioning (runs once, only on an empty data volume).
--
-- Applies each service's baseline SCHEMA. Seed DATA is no longer loaded here:
-- it is owned by each service's Flyway repeatable migration
-- (src/main/resources/db/migration/R__seed.sql), which loads the CSVs via
-- server-side COPY on service startup. This keeps schema + seed in one place
-- (Flyway) and lets seed changes re-apply without wiping the database.

\connect hotel_db
\i /database/schema/hotel_schema.sql

\connect transport_db
\i /database/schema/transport_schema.sql

\connect user_db
\i /database/schema/user_schema.sql

\connect reservation_db
\i /database/schema/reservation_schema.sql

\connect community_db
\i /database/schema/community_schema.sql

\connect payment_db
