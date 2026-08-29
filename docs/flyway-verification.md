# Flyway migration & seed — verification record

Reproducible check that the Flyway-managed schema + seed setup is healthy.

## How to run

Bring the stack up, then from `travel-api/`:

```bash
docker compose up -d --build      # first boot loads schema (baseline) + R__seed
bash scripts/verify-flyway.sh     # exits 0 only if every check passes
```

The script verifies:

1. all service containers are running;
2. each Postgres-backed DB has its Flyway **V1 baseline**, its `V*` migrations, and its `R__seed` repeatable migration recorded as successful in `flyway_schema_history`;
3. key seed tables are populated;
4. monetary columns are `numeric`;
5. `hotel_photos` has **no duplicate rows** — proving the `R__seed` repeatable migration is idempotent (it was re-run in this capture by changing its checksum).

## Captured run (2026-08-29)

Context: the stack was rebuilt with `docker compose up -d --build` against an
existing data volume. The `hotel` `R__seed` checksum had changed (the
`hotel_photos` insert was switched from an ineffective `ON CONFLICT DO NOTHING`
to `WHERE NOT EXISTS`), so Flyway **replayed** it on already-seeded data — note
`R seed` appears twice in `hotel_db` history, and `hotel_photos` still has no
duplicates.

```text
== 1. Containers ==
  running services: 13
  [PASS] at least 12 services running
== 2. Flyway history per DB ==
  user_db: 1 << Flyway Baseline >>[true] | R seed[true]
  [PASS] user_db baseline present
  hotel_db: 1 << Flyway Baseline >>[true] | 2 money to numeric[true] | R seed[true] | 3 room reservation idempotency[true] | R seed[true]
  [PASS] hotel_db baseline present
  transport_db: 1 << Flyway Baseline >>[true] | 2 money to numeric[true] | R seed[true]
  [PASS] transport_db baseline present
  reservation_db: 1 << Flyway Baseline >>[true] | 2 money to numeric[true]
  [PASS] reservation_db baseline present
  community_db: 1 << Flyway Baseline >>[true] | R seed[true] | 2 move featured image urls to static defaults[true] | R seed[true]
  [PASS] community_db baseline present
  [PASS] hotel_db R__seed applied
  [PASS] community_db R__seed applied
  [PASS] user_db R__seed applied
  [PASS] transport_db R__seed applied
== 3. Seed row counts ==
  [PASS] hotel_db.hotel = 8637 (>= 1)
  [PASS] user_db.users = 40 (>= 1)
  [PASS] hotel_db.room = 21518 (>= 1)
  [PASS] transport_db.ticket_offer_templates = 609469 (>= 1000)
  [PASS] hotel_db.city = 320 (>= 1)
  [PASS] community_db.attraction = 4 (>= 4)
== 4. Money columns are numeric ==
  [PASS] hotel_db.room.price_per_adult = numeric
  [PASS] transport_db.ticket_offer_templates.price = numeric
  [PASS] reservation_db.reservation.price = numeric
  [PASS] reservation_db.payment_transaction.amount = numeric
  [PASS] reservation_db.refund_record.amount = numeric
== 5. hotel_photos has no duplicate (hotel_id, photos) rows ==
  [PASS] no duplicate hotel_photos rows

RESULT: ALL CHECKS PASSED
```

> Note: `reservation_db` has no `R__seed` (reservations are transactional, not
> seeded). `payment_db` is intentionally not under Flyway — it has no entities or
> tables, so there is no schema to manage.
