import csv
import hashlib
import json
from datetime import datetime, timedelta
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]
API_DIR = ROOT_DIR / "travel-api"
OUTPUT_FILE = API_DIR / "seed-data" / "transport" / "train" / "generated_ticket_offers.csv"
BASE_DATE = datetime(2026, 6, 1)


def read_json(name: str):
    return json.loads((ROOT_DIR / name).read_text(encoding="utf-8"))


def read_city_ids():
    cities_path = API_DIR / "seed-data" / "common" / "cities.csv"
    with cities_path.open(encoding="utf-8", newline="") as file:
        return {
            row["cityName"]: row["cityId"]
            for row in csv.DictReader(file, delimiter="\t")
        }


def station_display_name(name: str):
    return name if name.endswith("站") else f"{name}站"


def normalize_seat_name(name: str):
    return f"{name}座" if name in {"一等", "二等"} else name


def seconds_to_datetime(origin_seconds: int, offset_seconds: int):
    return BASE_DATE + timedelta(seconds=origin_seconds + offset_seconds)


def seat_summaries(train_types):
    summaries = {}
    for train_type in train_types:
        seats = []
        for seat_name, seat_layout in train_type.get("seat", {}).items():
            prices = []
            seat_count = 0
            for seat_items in seat_layout.values():
                seat_count += len(seat_items)
                prices.extend(
                    item.get("price")
                    for item in seat_items
                    if isinstance(item, dict) and item.get("price") is not None
                )
            if not prices:
                continue
            seats.append(
                {
                    "seatClass": normalize_seat_name(seat_name),
                    "basePrice": round(sum(prices) / len(prices)),
                    "seatCount": seat_count,
                }
            )
        summaries[train_type["id"]] = seats
    return summaries


def price_for(train_type: str, base_price: int, duration_hours: float):
    divisor = 2.5 if train_type in {"G", "C", "D", "S"} else 5.0
    raw_price = base_price * max(0.22, duration_hours / divisor)
    return max(20, int(round(raw_price / 5) * 5))


def total_seats_for(seat_count: int):
    return min(180, max(20, seat_count // 12))


def remaining_seats_for(train_number: str, seat_class: str, total_seats: int):
    digest = int(hashlib.md5(f"{train_number}:{seat_class}".encode("utf-8")).hexdigest()[:8], 16)
    ratio = 0.25 + (digest % 60) / 100
    return max(1, min(total_seats, round(total_seats * ratio)))


def build_rows():
    city_ids = read_city_ids()
    station_city = {item["name"]: item["city"] for item in read_json("station.json")}
    train_type_seats = seat_summaries(read_json("train_type.json"))
    trains = read_json("train_number.json")

    rows = []
    seen = set()

    for train in trains:
        route = sorted(train.get("route", []), key=lambda item: item.get("order", 0))
        if len(route) < 2:
            continue

        departure_stop = route[0]
        arrival_stop = route[-1]
        departure_station = departure_stop.get("station", "")
        arrival_station = arrival_stop.get("station", "")
        departure_city = station_city.get(departure_station)
        arrival_city = station_city.get(arrival_station)
        departure_city_id = city_ids.get(departure_city)
        arrival_city_id = city_ids.get(arrival_city)
        if not departure_city_id or not arrival_city_id or departure_city_id == arrival_city_id:
            continue

        train_type = train.get("train_type", "")
        train_number = train.get("train_number", "")
        seats = train_type_seats.get(train_type, [])
        if not seats:
            continue

        origin_departure_seconds = int(train.get("originDepatureTime", 0))
        departure_offset = int(departure_stop.get("depatureTime") or 0)
        arrival_offset = int(arrival_stop.get("arrivalTime") or 0)
        departure_at = seconds_to_datetime(origin_departure_seconds, departure_offset)
        arrival_at = seconds_to_datetime(origin_departure_seconds, arrival_offset)
        if arrival_at <= departure_at:
            arrival_at += timedelta(days=1)
        duration_hours = max(0.5, (arrival_at - departure_at).total_seconds() / 3600)

        for seat in seats:
            total_seats = total_seats_for(seat["seatCount"])
            key = (train_number, departure_city_id, arrival_city_id, seat["seatClass"])
            if key in seen:
                continue
            seen.add(key)
            rows.append(
                [
                    "TRAIN",
                    departure_city_id,
                    arrival_city_id,
                    station_display_name(departure_station),
                    "",
                    station_display_name(arrival_station),
                    "",
                    departure_at.isoformat(timespec="seconds"),
                    arrival_at.isoformat(timespec="seconds"),
                    "中国铁路",
                    train_number,
                    seat["seatClass"],
                    str(price_for(train_type, seat["basePrice"], duration_hours)),
                    str(remaining_seats_for(train_number, seat["seatClass"], total_seats)),
                    str(total_seats),
                ]
            )

    return rows


def main():
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    rows = build_rows()
    with OUTPUT_FILE.open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file, delimiter="\t", lineterminator="\n")
        writer.writerow(
            [
                "type",
                "departureCityId",
                "arrivalCityId",
                "departureStationCode",
                "departureTerminalName",
                "arrivalStationCode",
                "arrivalTerminalName",
                "departureDateTime",
                "arrivalDateTime",
                "carrier",
                "code",
                "seatClass",
                "price",
                "remainingSeats",
                "totalSeats",
            ]
        )
        writer.writerows(rows)
    print(f"Generated {len(rows)} supplemental train ticket rows at {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
