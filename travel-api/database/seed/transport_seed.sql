CREATE TEMP TABLE seed_ticket_offers (
    type text,
    departure_city_id text,
    arrival_city_id text,
    departure_station_code text,
    departure_terminal_name text,
    arrival_station_code text,
    arrival_terminal_name text,
    departure_date_time timestamp,
    arrival_date_time timestamp,
    carrier text,
    code text,
    seat_class text,
    price integer,
    remaining_seats integer,
    total_seats integer
);

\copy seed_ticket_offers FROM '/seed-data/transport/plane/ticket_offers.csv' WITH (FORMAT csv, HEADER true, DELIMITER E'\t', NULL '')
\copy seed_ticket_offers FROM '/seed-data/transport/plane/generated_ticket_offers.csv' WITH (FORMAT csv, HEADER true, DELIMITER E'\t', NULL '')
\copy seed_ticket_offers FROM '/seed-data/transport/train/ticket_offers.csv' WITH (FORMAT csv, HEADER true, DELIMITER E'\t', NULL '')
\copy seed_ticket_offers FROM '/seed-data/transport/train/generated_ticket_offers.csv' WITH (FORMAT csv, HEADER true, DELIMITER E'\t', NULL '')

INSERT INTO public.ticket_offer_templates (
    id,
    type,
    departure_city_id,
    arrival_city_id,
    departure_station_code,
    departure_terminal_name,
    arrival_station_code,
    arrival_terminal_name,
    departure_date_time,
    arrival_date_time,
    carrier,
    code,
    seat_class,
    price,
    remaining_seats,
    total_seats
)
SELECT (substr(md5(concat_ws(E'\t', type, departure_city_id, arrival_city_id, departure_station_code,
                             departure_terminal_name, arrival_station_code, arrival_terminal_name,
                             departure_date_time::text, arrival_date_time::text, carrier, code,
                             seat_class, price::text)), 1, 8) || '-' ||
        substr(md5(concat_ws(E'\t', type, departure_city_id, arrival_city_id, departure_station_code,
                             departure_terminal_name, arrival_station_code, arrival_terminal_name,
                             departure_date_time::text, arrival_date_time::text, carrier, code,
                             seat_class, price::text)), 9, 4) || '-' ||
        substr(md5(concat_ws(E'\t', type, departure_city_id, arrival_city_id, departure_station_code,
                             departure_terminal_name, arrival_station_code, arrival_terminal_name,
                             departure_date_time::text, arrival_date_time::text, carrier, code,
                             seat_class, price::text)), 13, 4) || '-' ||
        substr(md5(concat_ws(E'\t', type, departure_city_id, arrival_city_id, departure_station_code,
                             departure_terminal_name, arrival_station_code, arrival_terminal_name,
                             departure_date_time::text, arrival_date_time::text, carrier, code,
                             seat_class, price::text)), 17, 4) || '-' ||
        substr(md5(concat_ws(E'\t', type, departure_city_id, arrival_city_id, departure_station_code,
                             departure_terminal_name, arrival_station_code, arrival_terminal_name,
                             departure_date_time::text, arrival_date_time::text, carrier, code,
                             seat_class, price::text)), 21, 12))::uuid,
       type,
       departure_city_id,
       arrival_city_id,
       departure_station_code,
       departure_terminal_name,
       arrival_station_code,
       arrival_terminal_name,
       departure_date_time,
       arrival_date_time,
       carrier,
       code,
       seat_class,
       price,
       remaining_seats,
       total_seats
FROM seed_ticket_offers
ON CONFLICT (id) DO NOTHING;
