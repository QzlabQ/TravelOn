#!/usr/bin/env bash
# Reproducible verification of the Flyway-managed schema + seed setup.
# Run from travel-api/ with the stack up:  bash scripts/verify-flyway.sh
# Checks: all containers up, Flyway history per DB, seed row counts,
# money columns are numeric, and hotel_photos has no duplicate rows.
set -uo pipefail

PSQL() { docker compose exec -T postgres psql -U "${POSTGRES_USER:-admin}" -tAc "$1" "$2"; }
fail=0
ok()   { echo "  [PASS] $1"; }
bad()  { echo "  [FAIL] $1"; fail=1; }

echo "== 1. Containers =="
up=$(docker compose ps --status running --format '{{.Name}}' | wc -l | tr -d ' ')
echo "  running services: $up"
docker compose ps --format '{{.Name}}\t{{.State}}' | sort
[ "$up" -ge 12 ] && ok "at least 12 services running" || bad "fewer than 12 services running"

echo "== 2. Flyway history per DB (expect V1 baseline; V2 where applicable; R__seed) =="
for db in user_db hotel_db transport_db reservation_db community_db; do
  hist=$(PSQL "select string_agg(coalesce(version,'R')||' '||description||'['||success||']', ' | ' order by installed_rank) from flyway_schema_history" "$db")
  echo "  $db: $hist"
  echo "$hist" | grep -qi "flyway baseline" && ok "$db baseline present" || bad "$db missing baseline"
done
for db in hotel_db community_db user_db transport_db; do
  PSQL "select 1 from flyway_schema_history where description='seed' and success" "$db" | grep -q 1 \
    && ok "$db R__seed applied" || bad "$db R__seed not applied"
done

echo "== 3. Seed row counts =="
declare -A EXPECT=( ["hotel_db:hotel"]=1 ["hotel_db:room"]=1 ["hotel_db:city"]=1
                    ["transport_db:ticket_offer_templates"]=1000 ["community_db:attraction"]=4
                    ["user_db:users"]=1 )
for key in "${!EXPECT[@]}"; do
  db=${key%%:*}; tbl=${key##*:}; min=${EXPECT[$key]}
  n=$(PSQL "select count(*) from $tbl" "$db")
  [ "${n:-0}" -ge "$min" ] && ok "$db.$tbl = $n (>= $min)" || bad "$db.$tbl = ${n:-0} (< $min)"
done

echo "== 4. Money columns are numeric =="
for row in "hotel_db:room:price_per_adult" "transport_db:ticket_offer_templates:price" \
           "reservation_db:reservation:price" "reservation_db:payment_transaction:amount" \
           "reservation_db:refund_record:amount"; do
  IFS=: read -r db tbl col <<< "$row"
  t=$(PSQL "select data_type from information_schema.columns where table_name='$tbl' and column_name='$col'" "$db")
  [ "$t" = "numeric" ] && ok "$db.$tbl.$col = numeric" || bad "$db.$tbl.$col = ${t:-missing}"
done

echo "== 5. hotel_photos has no duplicate (hotel_id, photos) rows =="
dups=$(PSQL "select coalesce(sum(c-1),0) from (select count(*) c from hotel_photos group by hotel_id, photos having count(*)>1) d" hotel_db)
[ "${dups:-0}" = "0" ] && ok "no duplicate hotel_photos rows" || bad "$dups duplicate hotel_photos rows"

echo
[ "$fail" = "0" ] && echo "RESULT: ALL CHECKS PASSED" || echo "RESULT: FAILURES PRESENT"
exit "$fail"
