#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "${SCRIPT_DIR}/../../.." && pwd)"
API_BASE="${API_BASE:-http://localhost:58082}"
RUN_ID="e2e-$(date +%Y%m%d-%H%M%S)"
RESULT_ROOT="${RESULT_ROOT:-${ROOT}/test-results}"
RESULT_DIR="${RESULT_ROOT}/${RUN_ID}"
mkdir -p "${RESULT_DIR}/responses"

passed=0
failed=0
blocked=0
declare -a cases=()

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'missing required command: %s\n' "$1" >&2
    exit 2
  fi
}

require_command curl
require_command jq
require_command docker

if docker compose version >/dev/null 2>&1; then
  compose=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  compose=(docker-compose)
else
  printf 'missing Docker Compose: install the Docker Compose plugin or docker-compose\n' >&2
  exit 2
fi

date_after_days() {
  local days="$1"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    date -v+"${days}"d +%F
  else
    date -d "+${days} days" +%F
  fi
}

record_case() {
  local id="$1"
  local status="$2"
  local detail="$3"
  cases+=("{\"id\":\"${id}\",\"status\":\"${status}\",\"detail\":\"${detail//\"/\\\"}\"}")
  case "${status}" in
    PASSED) passed=$((passed + 1)) ;;
    FAILED) failed=$((failed + 1)) ;;
    BLOCKED) blocked=$((blocked + 1)) ;;
  esac
}

request() {
  local name="$1"
  local method="$2"
  local path="$3"
  local body="${4:-}"
  local token="${5:-}"
  local body_file="${RESULT_DIR}/responses/${name}.json"
  local status_file="${RESULT_DIR}/responses/${name}.status"
  local args=(-sS -o "${body_file}" -w '%{http_code}' -X "${method}" -H 'Accept: application/json')
  if [[ -n "${body}" ]]; then
    args+=(-H 'Content-Type: application/json' --data "${body}")
  fi
  if [[ -n "${token}" ]]; then
    args+=(-H "X-User-Token: ${token}")
  fi
  curl "${args[@]}" "${API_BASE}${path}" >"${status_file}"
  cat "${status_file}"
}

expect_status() {
  local id="$1"
  local actual="$2"
  local expected="$3"
  local detail="$4"
  if [[ "${actual}" == "${expected}" ]]; then
    record_case "${id}" PASSED "${detail}"
  else
    record_case "${id}" FAILED "${detail}; expected HTTP ${expected}, got ${actual}"
  fi
}

json() {
  jq -e -r "$1" "$2"
}

stay_from="$(date_after_days 20)"
stay_to="$(date_after_days 22)"
transport_date="$(date_after_days 25)"
email="e2e.${RUN_ID}@example.test"
password="TravelOnE2E2026!"
traveler_document="E2E-${RUN_ID}"
admin_email="${ADMIN_EMAIL:-}"
admin_password="${ADMIN_PASSWORD:-}"
admin_account_file="${ADMIN_ACCOUNT_FILE:-${ROOT}/admin_account.txt}"
if [[ -z "${admin_email}" || -z "${admin_password}" ]]; then
  if [[ -f "${admin_account_file}" ]]; then
    admin_email="$(sed -n '1s/^email: //p' "${admin_account_file}")"
    admin_password="$(sed -n '2s/^password: //p' "${admin_account_file}")"
  fi
fi
if [[ -z "${admin_email}" || -z "${admin_password}" ]]; then
  printf 'set ADMIN_EMAIL and ADMIN_PASSWORD, or provide ADMIN_ACCOUNT_FILE\n' >&2
  exit 2
fi

status="$(request "health-hotel-destinations" GET "/hotels/destinations")"
expect_status "ENV-01" "${status}" 200 "Gateway routes hotel destinations"
destination_id="$(json '.[] | select(.cityId == "C001") | .idLocation' "${RESULT_DIR}/responses/health-hotel-destinations.json")"

register_body="$(jq -nc --arg email "${email}" --arg password "${password}" '{email:$email,password:$password,name:"E2E Tester",surname:"",phone:"13800138000"}')"
status="$(request "bs01-register" POST "/users/auth/register" "${register_body}")"
expect_status "BS01-API-01" "${status}" 201 "Register a dedicated E2E user"
token="$(json '.token' "${RESULT_DIR}/responses/bs01-register.json")"
user_id="$(json '.user.id' "${RESULT_DIR}/responses/bs01-register.json")"

status="$(request "bs01-login" POST "/users/auth/login" "$(jq -nc --arg email "${email}" --arg password "${password}" '{email:$email,password:$password}')")"
expect_status "BS01-API-02" "${status}" 200 "Log in with the registered user"
token="$(json '.token' "${RESULT_DIR}/responses/bs01-login.json")"

traveler_body="$(jq -nc --arg document "${traveler_document}" '{name:"E2E Traveler",travelerType:"ADULT",documentType:"PASSPORT",documentNumber:$document,phone:"13800138000",student:false,defaultTraveler:true}')"
status="$(request "bs01-create-traveler" POST "/users/me/travelers" "${traveler_body}" "${token}")"
expect_status "BS01-API-03" "${status}" 201 "Create a reusable traveler"
traveler_id="$(json '.id' "${RESULT_DIR}/responses/bs01-create-traveler.json")"
status="$(request "bs01-list-travelers" GET "/users/me/travelers" "" "${token}")"
expect_status "BS01-API-04" "${status}" 200 "Read the saved traveler list"
if jq -e --arg traveler_id "${traveler_id}" 'map(.id) | index($traveler_id) != null' "${RESULT_DIR}/responses/bs01-list-travelers.json" >/dev/null; then
  record_case "BS01-API-05" PASSED "Saved traveler is returned by the current-user endpoint"
else
  record_case "BS01-API-05" FAILED "Saved traveler is absent from the current-user endpoint"
fi

status="$(request "bs02-search-hotels" GET "/hotels/search?destinationId=${destination_id}&dateFrom=${stay_from}&dateTo=${stay_to}&adults=1&minRating=0&sortBy=price")"
expect_status "BS02-API-01" "${status}" 200 "Search hotels for a valid future stay"
hotel_id="$(json '.[0].hotelId' "${RESULT_DIR}/responses/bs02-search-hotels.json")"
hotel_name="$(json '.[0].name' "${RESULT_DIR}/responses/bs02-search-hotels.json")"
hotel_price="$(json '.[0].pricePerAdult' "${RESULT_DIR}/responses/bs02-search-hotels.json")"

booking_traveler="$(jq -nc --arg id "${traveler_id}" --arg document "${traveler_document}" '{travelerId:$id,name:"E2E Traveler",travelerType:"ADULT",documentType:"PASSPORT",documentNumber:$document,phone:"13800138000"}')"
hotel_order_body="$(jq -nc --argjson uid "\"${user_id}\"" --argjson hid "${hotel_id}" --arg name "${hotel_name}" --arg from "${stay_from}" --arg to "${stay_to}" --argjson price "${hotel_price}" --argjson traveler "${booking_traveler}" '{userId:$uid,hotelId:$hid,hotelName:$name,dateFrom:$from,dateTo:$to,adultsQuantity:1,childrenUnder3Quantity:0,childrenUnder10Quantity:0,childrenUnder18Quantity:0,price:$price,roomName:"E2E room",travelers:[$traveler]}')"
status="$(request "bs02-create-hotel-order" POST "/reservations/hotels" "${hotel_order_body}" "${token}")"
expect_status "BS02-API-02" "${status}" 200 "Create a pending hotel reservation"
hotel_order_id="$(json '.id' "${RESULT_DIR}/responses/bs02-create-hotel-order.json")"

status="$(request "bs02-create-hotel-order-unauth" POST "/reservations/hotels" "${hotel_order_body}")"
expect_status "BS02-ALT-01" "${status}" 401 "Reject hotel booking without an X-User-Token"

status="$(request "bs03-flight-options-before-fixture" GET "/transports/tickets/options?type=FLIGHT")"
expect_status "BS03-API-01" "${status}" 200 "Load flight options"

status="$(request "fixture-admin-login" POST "/users/auth/login" "$(jq -nc --arg email "${admin_email}" --arg password "${admin_password}" '{email:$email,password:$password}')")"
expect_status "FIXTURE-01" "${status}" 200 "Log in as the built-in administrator to create isolated future ticket inventory"
admin_token="$(json '.token' "${RESULT_DIR}/responses/fixture-admin-login.json")"

flight_fixture_body="$(jq -nc --arg departure "${transport_date}T09:00:00" --arg arrival "${transport_date}T11:30:00" --arg code "E2E-F-${RUN_ID}" '{type:"FLIGHT",departureCityId:"C039",arrivalCityId:"C005",departureStationCode:"E2E-PEK",departureTerminalName:"E2E Terminal",departureStationName:"E2E Beijing",arrivalStationCode:"E2E-PVG",arrivalTerminalName:"E2E Terminal",arrivalStationName:"E2E Shanghai",departureDateTime:$departure,arrivalDateTime:$arrival,carrier:"E2E Air",code:$code,seatClass:"ECONOMY",price:588.88,remainingSeats:5,totalSeats:5}')"
status="$(request "fixture-create-flight" POST "/transports/tickets/templates" "${flight_fixture_body}" "${admin_token}")"
expect_status "FIXTURE-02" "${status}" 201 "Create an isolated future flight template"
flight_fixture_id="$(json '.id' "${RESULT_DIR}/responses/fixture-create-flight.json")"

train_fixture_body="$(jq -nc --arg departure "${transport_date}T14:00:00" --arg arrival "${transport_date}T18:30:00" --arg code "E2E-T-${RUN_ID}" '{type:"TRAIN",departureCityId:"C005",arrivalCityId:"C039",departureStationCode:"E2E-SH",departureTerminalName:"E2E Station",departureStationName:"E2E Shanghai",arrivalStationCode:"E2E-BJ",arrivalTerminalName:"E2E Station",arrivalStationName:"E2E Beijing",departureDateTime:$departure,arrivalDateTime:$arrival,carrier:"E2E Rail",code:$code,seatClass:"SECOND_CLASS",price:288.88,remainingSeats:5,totalSeats:5}')"
status="$(request "fixture-create-train" POST "/transports/tickets/templates" "${train_fixture_body}" "${admin_token}")"
expect_status "FIXTURE-03" "${status}" 201 "Create an isolated future train template"
train_fixture_id="$(json '.id' "${RESULT_DIR}/responses/fixture-create-train.json")"

flight_departure="北京市"
flight_arrival="上海市"
status="$(request "bs03-search-flights" GET "/transports/tickets?type=FLIGHT&departureCity=$(printf '%s' "${flight_departure}" | jq -sRr @uri)&arrivalCity=$(printf '%s' "${flight_arrival}" | jq -sRr @uri)&departureDate=${transport_date}&onlyAvailable=true&sortBy=departure")"
expect_status "BS03-API-02" "${status}" 200 "Search available flights"
flight_offer_id="$(json '.[0].ticketOfferId' "${RESULT_DIR}/responses/bs03-search-flights.json")"
flight_code="$(json '.[0].code' "${RESULT_DIR}/responses/bs03-search-flights.json")"
flight_departure_time="$(json '.[0].departureTime' "${RESULT_DIR}/responses/bs03-search-flights.json")"
flight_arrival_time="$(json '.[0].arrivalTime' "${RESULT_DIR}/responses/bs03-search-flights.json")"
flight_provider="$(json '.[0].carrier' "${RESULT_DIR}/responses/bs03-search-flights.json")"
flight_price="$(json '.[0].price' "${RESULT_DIR}/responses/bs03-search-flights.json")"
flight_order_body="$(jq -nc --argjson uid "\"${user_id}\"" --arg date "${transport_date}" --arg departure "${flight_departure_time}" --arg arrival "${flight_arrival_time}" --arg provider "${flight_provider}" --arg code "${flight_code}" --arg offer "${flight_offer_id}" --argjson price "${flight_price}" --argjson traveler "${booking_traveler}" '{userId:$uid,transportType:"FLIGHT",departureDate:$date,departureTime:$departure,arrivalTime:$arrival,provider:$provider,bookingCode:$code,passengerCount:1,price:$price,travelers:[$traveler],ticketOfferId:$offer}')"
status="$(request "bs03-create-flight-order" POST "/reservations/tickets" "${flight_order_body}" "${token}")"
expect_status "BS03-API-03" "${status}" 200 "Create a pending flight reservation"
flight_order_id="$(json '.id' "${RESULT_DIR}/responses/bs03-create-flight-order.json")"

status="$(request "bs04-train-options" GET "/transports/tickets/options?type=TRAIN")"
expect_status "BS04-API-01" "${status}" 200 "Load train options"
train_departure="上海市"
train_arrival="北京市"
status="$(request "bs04-search-trains" GET "/transports/tickets?type=TRAIN&departureCity=$(printf '%s' "${train_departure}" | jq -sRr @uri)&arrivalCity=$(printf '%s' "${train_arrival}" | jq -sRr @uri)&departureDate=${transport_date}&onlyAvailable=true&sortBy=departure")"
expect_status "BS04-API-02" "${status}" 200 "Search available trains"
train_offer_id="$(json '.[0].ticketOfferId' "${RESULT_DIR}/responses/bs04-search-trains.json")"
train_code="$(json '.[0].code' "${RESULT_DIR}/responses/bs04-search-trains.json")"
train_departure_time="$(json '.[0].departureTime' "${RESULT_DIR}/responses/bs04-search-trains.json")"
train_arrival_time="$(json '.[0].arrivalTime' "${RESULT_DIR}/responses/bs04-search-trains.json")"
train_provider="$(json '.[0].carrier' "${RESULT_DIR}/responses/bs04-search-trains.json")"
train_price="$(json '.[0].price' "${RESULT_DIR}/responses/bs04-search-trains.json")"
train_order_body="$(jq -nc --argjson uid "\"${user_id}\"" --arg date "${transport_date}" --arg departure "${train_departure_time}" --arg arrival "${train_arrival_time}" --arg provider "${train_provider}" --arg code "${train_code}" --arg offer "${train_offer_id}" --argjson price "${train_price}" --argjson traveler "${booking_traveler}" '{userId:$uid,transportType:"TRAIN",departureDate:$date,departureTime:$departure,arrivalTime:$arrival,provider:$provider,bookingCode:$code,passengerCount:1,price:$price,travelers:[$traveler],ticketOfferId:$offer}')"
status="$(request "bs04-create-train-order" POST "/reservations/tickets" "${train_order_body}" "${token}")"
expect_status "BS04-API-03" "${status}" 200 "Create a pending train reservation"
train_order_id="$(json '.id' "${RESULT_DIR}/responses/bs04-create-train-order.json")"

status="$(request "bs05-invalid-payment" POST "/reservations/purchase" "$(jq -nc --arg id "${hotel_order_id}" '{reservationId:$id,cardNumber:"6200000000000000"}')" "${token}")"
expect_status "BS05-ERR-01" "${status}" 400 "Reject an invalid Luhn UnionPay number and retain a payment failure"
status="$(request "bs05-valid-payment" POST "/reservations/purchase" "$(jq -nc --arg id "${hotel_order_id}" '{reservationId:$id,cardNumber:"6222020000078888"}')" "${token}")"
expect_status "BS05-API-01" "${status}" 200 "Pay the hotel reservation with a valid UnionPay card"
status="$(request "bs05-hotel-order-after-payment" GET "/reservations/${hotel_order_id}" "" "${token}")"
expect_status "BS05-API-02" "${status}" 200 "Read the paid hotel reservation"
if jq -e '.status == "PAID" and .paid == true' "${RESULT_DIR}/responses/bs05-hotel-order-after-payment.json" >/dev/null; then
  record_case "BS05-API-03" PASSED "Hotel order transitions to PAID"
else
  record_case "BS05-API-03" FAILED "Hotel order did not transition to PAID"
fi
status="$(request "bs05-payment-history" GET "/reservations/${hotel_order_id}/payments" "" "${token}")"
expect_status "BS05-API-04" "${status}" 200 "Read payment transaction history"
if jq -e 'map(.status) | (index("FAILED") != null and index("SUCCESS") != null)' "${RESULT_DIR}/responses/bs05-payment-history.json" >/dev/null; then
  record_case "BS05-API-05" PASSED "Payment history records both failure and later success"
else
  record_case "BS05-API-05" FAILED "Payment history does not contain the expected failure/success trail"
fi

status="$(request "bs05-cancel-flight" POST "/reservations/${flight_order_id}/cancel" '{"reason":"E2E alternate-flow cancellation"}' "${token}")"
expect_status "BS05-ALT-01" "${status}" 200 "Cancel an unpaid flight reservation"
if jq -e '.status == "CANCELLED"' "${RESULT_DIR}/responses/bs05-cancel-flight.json" >/dev/null; then
  record_case "BS05-ALT-02" PASSED "Unpaid flight order transitions to CANCELLED"
else
  record_case "BS05-ALT-02" FAILED "Unpaid flight order did not transition to CANCELLED"
fi

status="$(request "bs05-cancel-paid-hotel" POST "/reservations/${hotel_order_id}/cancel" '{"reason":"E2E paid-order refund"}' "${token}")"
expect_status "BS05-ALT-03" "${status}" 200 "Request refund by cancelling a paid reservation"
status="$(request "bs05-refunds" GET "/reservations/${hotel_order_id}/refunds" "" "${token}")"
expect_status "BS05-ALT-04" "${status}" 200 "Read the refund record"
if jq -e 'length > 0 and .[0].amount > 0' "${RESULT_DIR}/responses/bs05-refunds.json" >/dev/null; then
  record_case "BS05-ALT-05" PASSED "Paid-order cancellation creates a refund record"
else
  record_case "BS05-ALT-05" FAILED "Paid-order cancellation did not create a refund record"
fi

status="$(request "bs06-list-orders" GET "/reservations/user/${user_id}" "" "${token}")"
expect_status "BS06-API-01" "${status}" 200 "Read all reservations for the E2E user"
if jq -e --arg hotel "${hotel_order_id}" --arg flight "${flight_order_id}" --arg train "${train_order_id}" 'map(.id) | (index($hotel) != null and index($flight) != null and index($train) != null)' "${RESULT_DIR}/responses/bs06-list-orders.json" >/dev/null; then
  record_case "BS06-API-02" PASSED "Order list exposes hotel, flight, and train reservations"
else
  record_case "BS06-API-02" FAILED "Order list is missing one or more created reservations"
fi

status="$(request "bs07-post-unauth" POST "/community/posts" '{"title":"unauth E2E","content":"should be rejected","contentFormat":"PLAIN_TEXT","category":"TRAVEL_NOTE"}')"
expect_status "BS07-ERR-01" "${status}" 401 "Reject unauthenticated community publishing"
post_body="$(jq -nc --arg title "E2E post ${RUN_ID}" '{title:$title,content:"End-to-end community post.",contentFormat:"PLAIN_TEXT",category:"TRAVEL_NOTE",destinationCityId:"C001",imageUrls:[]}')"
status="$(request "bs07-create-post" POST "/community/posts" "${post_body}" "${token}")"
expect_status "BS07-API-01" "${status}" 201 "Publish a community post"
post_id="$(json '.id' "${RESULT_DIR}/responses/bs07-create-post.json")"
status="$(request "bs07-like-post" POST "/community/posts/${post_id}/likes" '{}' "${token}")"
expect_status "BS07-API-02" "${status}" 200 "Like the created community post"
status="$(request "bs07-comment-post" POST "/community/posts/${post_id}/comments" '{"content":"E2E comment"}' "${token}")"
expect_status "BS07-API-03" "${status}" 201 "Comment on the created community post"
status="$(request "bs07-favorite-post" POST "/community/favorites/toggle" "$(jq -nc --arg id "${post_id}" '{type:"POST",targetId:$id}')" "${token}")"
expect_status "BS07-API-04" "${status}" 200 "Favorite the created community post"
status="$(request "bs07-my-posts" GET "/community/me/posts" "" "${token}")"
expect_status "BS07-API-05" "${status}" 200 "Read the current user's posts"
if jq -e --arg post_id "${post_id}" 'map(.id) | index($post_id) != null' "${RESULT_DIR}/responses/bs07-my-posts.json" >/dev/null; then
  record_case "BS07-API-06" PASSED "Published post is visible in the user's profile"
else
  record_case "BS07-API-06" FAILED "Published post is absent from the user's profile"
fi

planner_core="$(jq -nc --arg date "${transport_date}" '{city:"上海",departureCity:"北京",travelStartDate:$date,travelEndDate:$date,peopleCount:1,budget:"2000",travelStyle:"休闲",mustVisitKeywords:["外滩"],avoidKeywords:[]}')"
status="$(request "bs08-create-conversation" POST "/ai-arrange/api/conversations" "$(jq -nc --argjson uid "\"${user_id}\"" --argjson core "${planner_core}" '{userId:$uid,coreSlots:$core}')")"
expect_status "BS08-API-01" "${status}" 200 "Create an AI planner conversation"
conversation_id="$(json '.id' "${RESULT_DIR}/responses/bs08-create-conversation.json")"

planner_run_body="$(jq -nc --argjson uid "\"${user_id}\"" --arg date "${transport_date}" '{userId:$uid,message:"请生成包含外滩的一日行程。",planningMode:"INITIAL_PLAN",planningScope:"DAY_PLAN",modelVariant:"FLASH",targetDayIndex:1,targetDate:$date,selectedPlaceIds:[]}')"
status="$(request "bs08-run-planner" POST "/ai-arrange/api/conversations/${conversation_id}/planner/run" "${planner_run_body}")"
expect_status "BS08-API-02" "${status}" 200 "Generate the initial planner snapshot through the planner agent"
if [[ "${status}" == "200" ]] && jq -e '.version != null' "${RESULT_DIR}/responses/bs08-run-planner.json" >/dev/null; then
  initial_snapshot_version="$(json '.version' "${RESULT_DIR}/responses/bs08-run-planner.json")"

  snapshot_body="$(jq -nc --argjson uid "\"${user_id}\"" --argjson base "${initial_snapshot_version}" '{userId:$uid,markdown:"# E2E 上海一日行程\n- 外滩",mode:"TRIP",baseVersion:$base}')"
  status="$(request "bs08-create-snapshot-v1" POST "/ai-arrange/api/conversations/${conversation_id}/markdown-snapshots" "${snapshot_body}")"
  expect_status "BS08-API-03" "${status}" 200 "Save the first planner Markdown revision"
  snapshot_v1="$(json '.version' "${RESULT_DIR}/responses/bs08-create-snapshot-v1.json")"
  snapshot_body_v2="$(jq -nc --argjson uid "\"${user_id}\"" --argjson base "${snapshot_v1}" '{userId:$uid,markdown:"# E2E 上海一日行程\n- 外滩\n- 上海博物馆",mode:"TRIP",baseVersion:$base}')"
  status="$(request "bs08-create-snapshot-v2" POST "/ai-arrange/api/conversations/${conversation_id}/markdown-snapshots" "${snapshot_body_v2}")"
  expect_status "BS08-API-04" "${status}" 200 "Save a revised planner snapshot"
  snapshot_v2="$(json '.version' "${RESULT_DIR}/responses/bs08-create-snapshot-v2.json")"
  status="$(request "bs08-diff" GET "/ai-arrange/api/conversations/${conversation_id}/snapshots/${snapshot_v1}/diff/${snapshot_v2}?userId=${user_id}")"
  expect_status "BS08-API-05" "${status}" 200 "Compare planner snapshot versions"
  status="$(request "bs08-rollback" POST "/ai-arrange/api/conversations/${conversation_id}/snapshots/${snapshot_v1}/rollback?userId=${user_id}" '{}')"
  expect_status "BS08-API-06" "${status}" 200 "Roll back the planner to the first snapshot"
else
  record_case "BS08-API-03" BLOCKED "Initial planner snapshot was not generated"
  record_case "BS08-API-04" BLOCKED "Initial planner snapshot was not generated"
  record_case "BS08-API-05" BLOCKED "Initial planner snapshot was not generated"
  record_case "BS08-API-06" BLOCKED "Initial planner snapshot was not generated"
fi
status="$(request "bs08-invalid-core" POST "/ai-arrange/api/conversations" "{\"userId\":\"${user_id}\",\"coreSlots\":{\"city\":\"\",\"peopleCount\":0}}")"
expect_status "BS08-ERR-01" "${status}" 400 "Reject planner creation without required core slots"

"${compose[@]}" -f "${ROOT}/travel-api/docker-compose.yml" exec -T postgres psql -U admin -d user_db -Atc "select count(*) from travelers where user_id = '${user_id}';" >"${RESULT_DIR}/db-traveler-count.txt"
"${compose[@]}" -f "${ROOT}/travel-api/docker-compose.yml" exec -T postgres psql -U admin -d reservation_db -Atc "select id || '|' || status || '|' || paid from reservation where user_id = '${user_id}' order by created_at;" >"${RESULT_DIR}/db-reservations.txt"
"${compose[@]}" -f "${ROOT}/travel-api/docker-compose.yml" exec -T postgres psql -U admin -d community_db -Atc "select id || '|' || title from community_post where author_user_id = '${user_id}';" >"${RESULT_DIR}/db-community-posts.txt"
# Spring Data stores UUID values as Java legacy BSON binary (subtype 3).
conversation_id_java_legacy_base64="$(printf '%s' "${conversation_id}" | tr -d '-' | xxd -r -p | perl -0777 -ne 'print scalar reverse substr($_,0,8); print scalar reverse substr($_,8,8)' | base64)"
"${compose[@]}" -f "${ROOT}/travel-api/docker-compose.yml" exec -T mongo mongosh --quiet ai-arrange-db --eval "db.planner_snapshots.countDocuments({conversationId: BinData(3, '${conversation_id_java_legacy_base64}')})" >"${RESULT_DIR}/db-planner-snapshots.txt"

if [[ "$(cat "${RESULT_DIR}/db-traveler-count.txt")" -ge 1 ]] && [[ "$(wc -l <"${RESULT_DIR}/db-reservations.txt" | tr -d ' ')" -ge 3 ]] && [[ "$(wc -l <"${RESULT_DIR}/db-community-posts.txt" | tr -d ' ')" -ge 1 ]]; then
  record_case "DB-01" PASSED "PostgreSQL contains the traveler, reservations, and community post created by the E2E run"
else
  record_case "DB-01" FAILED "PostgreSQL does not contain all expected E2E records"
fi
if [[ "$(cat "${RESULT_DIR}/db-planner-snapshots.txt")" -ge 2 ]]; then
  record_case "DB-02" PASSED "MongoDB contains the saved planner snapshots"
else
  record_case "DB-02" FAILED "MongoDB does not contain both planner snapshots"
fi

status="$(request "bs07-delete-post" DELETE "/community/posts/${post_id}" "" "${token}")"
expect_status "CLEANUP-01" "${status}" 204 "Delete the temporary community post"
status="$(request "fixture-delete-flight" DELETE "/transports/tickets/templates/${flight_fixture_id}" "" "${admin_token}")"
expect_status "CLEANUP-02" "${status}" 204 "Delete the isolated future flight template"
status="$(request "fixture-delete-train" DELETE "/transports/tickets/templates/${train_fixture_id}" "" "${admin_token}")"
expect_status "CLEANUP-03" "${status}" 204 "Delete the isolated future train template"

printf '{\n  "runId": "%s",\n  "apiBase": "%s",\n  "userId": "%s",\n  "passed": %d,\n  "failed": %d,\n  "blocked": %d,\n  "cases": [\n%s\n  ]\n}\n' \
  "${RUN_ID}" "${API_BASE}" "${user_id}" "${passed}" "${failed}" "${blocked}" \
  "$(printf '    %s,\n' "${cases[@]}" | sed '$s/,$//')" >"${RESULT_DIR}/summary.json"

printf 'result_dir=%s\npassed=%s\nfailed=%s\nblocked=%s\n' "${RESULT_DIR}" "${passed}" "${failed}" "${blocked}"
[[ "${failed}" -eq 0 ]]
