-- Convert room.price_per_adult from REAL to numeric(12,2) to match the BigDecimal
-- entity mapping. The hotel_room_inventory view references this column, so it must
-- be dropped before the ALTER and recreated afterwards.
-- Supersedes database/cleanup/migrate-money-to-numeric.sql for hotel_db.
DROP VIEW IF EXISTS public.hotel_room_inventory;

ALTER TABLE room
    ALTER COLUMN price_per_adult TYPE numeric(12,2)
    USING round(price_per_adult::numeric, 2);

CREATE VIEW public.hotel_room_inventory AS
 SELECT h.id AS hotel_id,
        h.name AS hotel_name,
        h.rating,
        h.city_id,
        count(r.id) AS room_count,
        min(r.price_per_adult) AS min_price_per_adult,
        max(r.guest_capacity) AS max_guest_capacity
   FROM hotel h
        LEFT JOIN room r ON r.hotel_id = h.id
  GROUP BY h.id, h.name, h.rating, h.city_id;
