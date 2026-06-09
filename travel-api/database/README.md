# Database schema and seed data

PostgreSQL initializes service databases from this directory when the data
directory is empty.

## Layout

- `init/001-create-service-databases.sql` creates one database per service.
- `init/010-apply-service-schema-and-seed.sql` connects to each service database,
  applies schema files, then applies seed files.
- `schema/*.sql` owns table creation.
- `seed/*.sql` owns initial data import from `seed-data`.
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
docker compose down
Remove-Item -Recurse -Force .\data\postgres
docker compose up -d --build
```

This deletes local database data. Use cleanup scripts instead when preserving
existing data matters.

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
