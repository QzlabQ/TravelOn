# Database schema, seed data, and migrations

Schema and seed data are managed by **Flyway**, per service. This directory holds
the first-boot bootstrap (create databases + baseline schema) that Flyway then
adopts and evolves.

## Layout

- `init/001-create-service-databases.sql` — creates one empty database per service
  (runs once, on an empty data volume, via the Postgres entrypoint).
- `init/010-apply-service-schema-and-seed.sql` — connects to each service database
  and applies its **schema only**. Seed data is **no longer** loaded here.
- `schema/*.sql` — the baseline table definitions. On first boot each service's
  Flyway finds these tables and adopts them as its **V1 baseline**
  (`baseline-on-migrate=true`, `baseline-version=1`).
- `seed/*.sql` — historical source of the seed logic. **Not executed at runtime**
  anymore; the live seed is each service's `R__seed.sql` (see below). Kept for
  reference only.
- `cleanup/*.sql` — one-off historical patches, now superseded by Flyway
  migrations. Kept for reference.

## Who owns what

Each Postgres-backed service owns its own database's migrations under
`src/main/resources/db/migration/`:

- `V2__*.sql`, `V3__*.sql`, … — incremental schema changes (V1 is the adopted
  baseline). Applied once, in order, recorded in `flyway_schema_history`.
- `R__seed.sql` — a Flyway **repeatable** migration that loads seed data with
  server-side `COPY` from the `/seed-data` CSVs (mounted into the Postgres
  container). Idempotent via `INSERT … ON CONFLICT DO NOTHING` (and
  `INSERT … WHERE NOT EXISTS` for tables without a unique key, e.g.
  `hotel_photos`).

Services under Flyway: `user`, `hotel`, `transport`, `reservation`, `community`.
`payment` connects to an (empty) `payment_db` with no entities/tables, so there is
no schema to manage and it is intentionally not under Flyway. `offer-provider`
uses an in-memory H2 database.

## Runtime behavior

Spring services use `spring.jpa.hibernate.ddl-auto=validate`. Flyway runs **before**
Hibernate: it applies pending `V*`/`R__` migrations, then Hibernate only validates
that the tables match the entities. Hibernate never creates or mutates tables.

## Changing the schema (no wipe)

1. Add `V2__short_description.sql` (then `V3__…`) under the owning service's
   `db/migration/`. Numbers start at **V2** (V1 is the baseline).
2. Write plain JDBC SQL only — **no psql meta-commands** (`\connect`, `\copy`, `\i`).
3. Update the matching JPA entity so `validate` still passes.
4. Redeploy — Flyway applies the migration incrementally and **preserves data**:

```powershell
cd travel-api
docker compose up -d --build
```

## Changing seed data

- **Editing `R__seed.sql`** (the SQL) changes its checksum, so Flyway replays it on
  the next start (idempotent, no wipe needed).
- **Editing only a CSV under `seed-data/` does NOT change the `R__seed.sql`
  checksum**, so Flyway will **not** replay it automatically. To pull in new CSV
  rows, also bump `R__seed.sql` (e.g. change a comment) so its checksum changes.
- `R__seed.sql` only inserts (idempotent); it does not update or delete existing
  rows. To change or remove already-seeded rows, write a `V*` migration.

## When a full reset is still needed (rare)

Only when you change the **baseline** itself — `init/010` or `schema/*.sql` — rather
than adding a `V*` migration. On an existing volume the entrypoint does not re-run,
so the baseline change would not take effect. Reset with:

```powershell
cd travel-api
docker compose down
Remove-Item -Recurse -Force .\data\postgres
docker compose up -d --build
```

This deletes local database data.

## Verifying a deployment

`scripts/verify-flyway.sh` checks that every DB service started, that
`flyway_schema_history` contains the expected migrations, that key seed tables are
populated, and that monetary columns are `numeric`. See
`docs/flyway-verification.md` for a captured run.

## Simplified schema policy

The schema is intentionally reduced to service-owned primary tables, JPA collection
tables, frontend-friendly read views, triggers, and supporting indexes. Legacy
command/event-store tables, hotel catering tables, data-generator tables, and old
transport reference tables are not part of the runtime schema. `transport_db` is a
ticket catalog centered on `ticket_offer_templates`.
