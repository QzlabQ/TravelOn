-- Convert ticket_offer_templates.price from INTEGER to numeric(12,2) to match the
-- BigDecimal entity mapping. The transport_offer_search_view references this column,
-- so it must be dropped before the ALTER and recreated afterwards.
-- Supersedes database/cleanup/migrate-money-to-numeric.sql for transport_db.
DROP VIEW IF EXISTS public.transport_offer_search_view;

ALTER TABLE ticket_offer_templates
    ALTER COLUMN price TYPE numeric(12,2)
    USING round(price::numeric, 2);

CREATE VIEW public.transport_offer_search_view AS
 SELECT id,
        type,
        departure_city_id,
        arrival_city_id,
        departure_date_time,
        arrival_date_time,
        carrier,
        code,
        seat_class,
        price,
        remaining_seats,
        total_seats,
        departure_station_code,
        departure_terminal_name,
        arrival_station_code,
        arrival_terminal_name,
        departure_station_name,
        arrival_station_name
   FROM ticket_offer_templates;
