import csv
from datetime import datetime, timedelta
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
OUTPUT_FILE = ROOT_DIR / "seed-data" / "transport" / "plane" / "generated_ticket_offers.csv"
START_DATE = datetime(2026, 6, 11)
DAY_COUNT = 24

AIRPORTS = {
    "C039": [("PEK", "T3"), ("PKX", "T2")],
    "C005": [("SHA", "T2"), ("PVG", "T2")],
    "C112": [("CAN", "T2")],
    "C190": [("SZX", "T3")],
    "C128": [("CTU", "T2"), ("TFU", "T2")],
    "C153": [("HGH", "T4")],
    "C246": [("XIY", "T3")],
    "C272": [("CKG", "T3")],
    "C042": [("NKG", "T2")],
}

ROUTES = [
    ("C039", "C005", 145, 520, "CA", "中国国航"),
    ("C005", "C039", 145, 520, "MU", "东方航空"),
    ("C039", "C112", 195, 720, "CA", "中国国航"),
    ("C112", "C039", 195, 720, "CZ", "南方航空"),
    ("C039", "C190", 205, 760, "CA", "中国国航"),
    ("C190", "C039", 205, 760, "ZH", "深圳航空"),
    ("C005", "C112", 155, 610, "MU", "东方航空"),
    ("C112", "C005", 155, 610, "CZ", "南方航空"),
    ("C005", "C190", 155, 640, "MU", "东方航空"),
    ("C190", "C005", 155, 640, "ZH", "深圳航空"),
    ("C039", "C128", 180, 690, "CA", "中国国航"),
    ("C128", "C039", 180, 690, "3U", "四川航空"),
    ("C005", "C128", 190, 720, "MU", "东方航空"),
    ("C128", "C005", 190, 720, "3U", "四川航空"),
    ("C112", "C128", 140, 560, "CZ", "南方航空"),
    ("C128", "C112", 140, 560, "3U", "四川航空"),
    ("C039", "C153", 130, 480, "CA", "中国国航"),
    ("C153", "C039", 130, 480, "HU", "海南航空"),
    ("C005", "C246", 160, 650, "MU", "东方航空"),
    ("C246", "C005", 160, 650, "HU", "海南航空"),
    ("C039", "C272", 170, 680, "CA", "中国国航"),
    ("C272", "C039", 170, 680, "3U", "四川航空"),
]

DEPARTURE_SLOTS = [
    (17, 20),
    (18, 45),
    (20, 10),
    (21, 35),
]

SEAT_CLASSES = [
    ("经济舱", 1.0, 36),
    ("公务舱", 2.6, 8),
]


def airport_for(city_id: str, day_index: int, slot_index: int):
    airports = AIRPORTS[city_id]
    return airports[(day_index + slot_index) % len(airports)]


def build_code(prefix: str, route_index: int, slot_index: int):
    return f"{prefix}{7000 + route_index * 10 + slot_index}"


def build_rows():
    rows = []
    for day_index in range(DAY_COUNT):
        flight_date = START_DATE + timedelta(days=day_index)
        for route_index, (from_city, to_city, duration_minutes, base_price, prefix, carrier) in enumerate(ROUTES):
            for slot_index, (hour, minute) in enumerate(DEPARTURE_SLOTS):
                departure = flight_date.replace(hour=hour, minute=minute, second=0, microsecond=0)
                arrival = departure + timedelta(minutes=duration_minutes)
                departure_airport, departure_terminal = airport_for(from_city, day_index, slot_index)
                arrival_airport, arrival_terminal = airport_for(to_city, day_index + 1, slot_index)
                code = build_code(prefix, route_index, slot_index)
                for seat_class, price_factor, seat_count in SEAT_CLASSES:
                    remaining_seats = max(3, seat_count - ((day_index + route_index + slot_index) % max(4, seat_count // 2)))
                    rows.append([
                        "FLIGHT",
                        from_city,
                        to_city,
                        departure_airport,
                        departure_terminal,
                        arrival_airport,
                        arrival_terminal,
                        departure.isoformat(timespec="seconds"),
                        arrival.isoformat(timespec="seconds"),
                        carrier,
                        code,
                        seat_class,
                        str(int(round(base_price * price_factor / 10) * 10)),
                        str(remaining_seats),
                        str(seat_count),
                    ])
    return rows


def main():
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_FILE.open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file, delimiter="\t", lineterminator="\n")
        writer.writerow([
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
        ])
        rows = build_rows()
        writer.writerows(rows)
    print(f"Generated {len(rows)} supplemental flight ticket rows at {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
