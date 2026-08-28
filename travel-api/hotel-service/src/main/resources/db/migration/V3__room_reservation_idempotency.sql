-- Keep one row for each reservation/room pair before enforcing idempotent delivery.
DELETE FROM room_reservation duplicate
USING room_reservation retained
WHERE duplicate.main_reservation_id = retained.main_reservation_id
  AND duplicate.room_id = retained.room_id
  AND duplicate.id > retained.id;

ALTER TABLE room_reservation
    ADD CONSTRAINT uq_room_reservation_main_room
    UNIQUE (main_reservation_id, room_id);
