# Database schema and seed data

PostgreSQL initializes service databases from this directory when the data
directory is empty.

## Layout

- `init/001-create-service-databases.sql` creates one database per service.
- `init/010-apply-service-schema-and-seed.sql` connects to each service database,
  applies schema files, then applies seed files.
- `schema/*.sql` owns table creation.
- `seed/*.sql` owns initial data import from `seed-data`.
- `../seed-data/README.md` documents ticket-template generation and rolling dates.
- `cleanup/*.sql` contains one-off cleanup scripts for existing developer
  databases.

## Runtime behavior

Spring services use `spring.jpa.hibernate.ddl-auto=validate` by default. Hibernate
checks that tables match the entities, but it no longer creates or mutates tables.

CSV bootstrap runners are disabled by default with:

```properties
app.seed-data.enabled=false
```

Set `APP_SEED_DATA_ENABLED=true` only when intentionally running the legacy
service-side CSV import.

## Rebuilding a local database

The Docker PostgreSQL entrypoint runs `database/init` only when
`travel-api/data/postgres` is empty. To rebuild from SQL:

```powershell
mise run services:down
Remove-Item -Recurse -Force .\data\postgres
mise run services:up_build
```

Run these commands from `travel-api`; mise still resolves the repository task
and its Compose working directory. This deletes local database data. Use cleanup scripts instead when preserving
existing data matters.

## Existing volumes and legacy data migration

The Docker entrypoint does not replay `database/init` on an existing data
volume. During normal startup, `travel-core-migration` only creates
`travel_core_db` if needed, applies the merged baseline schema when the target
is empty, and checks the required tables. It does not read or copy data from
`hotel_db` or `transport_db`. This keeps the normal startup path fast and
prevents an unexpected large data migration.

The historical migration remains available as an explicit opt-in. Stop the
old application containers, set the flag, and run the one-shot job from the
`travel-api` directory:

```powershell
$env:MIGRATE_LEGACY_DATA = "true"
docker compose stop travel-core
docker compose run --rm travel-core-migration
docker compose up -d travel-core
$env:MIGRATE_LEGACY_DATA = $null
```

With the flag enabled, `database/migration/migrate-existing-databases.sh`
copies the hotel and transport tables through staging schemas, merges `city`
by `city_id`, validates migrated identifiers and foreign keys, and records a
completion marker. Without `MIGRATE_LEGACY_DATA=true`, the script exits after
target database provisioning and never calls `pg_dump`.

The script does not modify the old databases. Keep `hotel_db` and
`transport_db` stopped and read-only during the cutover. They remain the
rollback snapshot before new writes are accepted by `travel-core-service`.
After cutover, new writes go only to `travel_core_db`; a rollback after new
writes requires a reverse migration or an explicit decision to discard those
writes, so the old and new databases must not be treated as automatically
consistent.

For Kubernetes or another deployment environment, execute the same script
from a PostgreSQL client container with `/database` mounted, wait for exit code
0, and only then roll out `travel-core-service`. Do not rely on
`docker-entrypoint-initdb.d` for an existing PostgreSQL volume.

## Simplified schema policy

The PostgreSQL schema is intentionally reduced to service-owned primary tables,
JPA collection tables, frontend-friendly read views, triggers, and supporting
indexes. Legacy command/event-store tables, hotel catering option tables,
data-generator tables, and old transport reference tables are not part of the
runtime schema.

`transport_db` is further simplified to a ticket catalog database centered on
`ticket_offer_templates`; legacy package transport inventory tables are no
longer part of the runtime schema.

For an existing developer database, run:

```powershell
docker compose exec postgres psql -U admin -d travel_admin -f /database/cleanup/drop-redundant-service-tables.sql
```
