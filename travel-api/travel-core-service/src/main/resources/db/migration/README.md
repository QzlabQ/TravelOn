# Database migrations (Flyway)

This folder holds Flyway schema migrations for **this service's own database**.

## How it works

- On first startup against an existing database (provisioned by
  `database/init/*.sql`), Flyway finds tables but no history table, so it
  **adopts the current schema as the V1 baseline** (`baseline-on-migrate=true`,
  `baseline-version=1`). V1 is therefore never re-run — it *is* the current
  `database/schema/<service>_schema.sql`.
- Every later schema change is a new versioned script here, applied
  incrementally and recorded in `flyway_schema_history`. Data is preserved — no
  more wiping `data/postgres` on redeploy.

## Adding a change

1. Create `V2__short_description.sql` (then `V3__...`, `V4__...`). Numbers must be
   strictly increasing and start at **V2** (V1 is the baseline).
2. Write plain JDBC-compatible SQL only — **no psql meta-commands** (`\connect`,
   `\copy`, `\i`). Each service's Flyway already targets its own database.
3. Update the matching JPA entity so Hibernate `validate` still passes.
4. Never edit a migration that has already been applied anywhere; add a new one.

Keep `database/schema/<service>_schema.sql` in sync as the human-readable
end-state (it is the baseline for fresh installs).

`R__seed.sql` relies on database constraints for idempotency. In particular,
`hotel_photos` has a unique constraint on `(hotel_id, photos)` so rerunning the
repeatable migration cannot duplicate an image row.
