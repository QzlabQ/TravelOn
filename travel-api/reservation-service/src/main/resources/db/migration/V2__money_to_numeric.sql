-- Convert monetary columns from REAL to numeric(12,2) to match the BigDecimal
-- entity mappings. The reservation_frontend_summary view references reservation.price,
-- so it must be dropped before the ALTER and recreated afterwards.
-- (payment_transaction.amount and refund_record.amount have no dependent views.)
-- Supersedes database/cleanup/migrate-money-to-numeric.sql for reservation_db.
DROP VIEW IF EXISTS public.reservation_frontend_summary;

ALTER TABLE reservation
    ALTER COLUMN price TYPE numeric(12,2)
    USING round(price::numeric, 2);

ALTER TABLE payment_transaction
    ALTER COLUMN amount TYPE numeric(12,2)
    USING round(amount::numeric, 2);

ALTER TABLE refund_record
    ALTER COLUMN amount TYPE numeric(12,2)
    USING round(amount::numeric, 2);

CREATE VIEW public.reservation_frontend_summary AS
 SELECT r.id,
        r.user_id,
        r.status,
        r.booking_type,
        r.title,
        r.hotel_id,
        r.hotel_time_from,
        r.hotel_time_to,
        r.price,
        r.paid,
        r.created_at,
        r.payment_deadline,
        count(DISTINCT rt.traveler_id) AS traveler_count,
        count(DISTINCT rr.room_reservations_ids) AS room_reservation_count,
        count(DISTINCT tr.transport_reservations_ids) AS transport_reservation_count
   FROM reservation r
        LEFT JOIN reservation_travelers rt ON rt.reservation_id = r.id
        LEFT JOIN reservation_room_reservations_ids rr ON rr.reservation_id = r.id
        LEFT JOIN reservation_transport_reservations_ids tr ON tr.reservation_id = r.id
  GROUP BY r.id;
