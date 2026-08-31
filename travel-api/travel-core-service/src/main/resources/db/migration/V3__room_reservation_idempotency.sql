-- Keep one row for each reservation/room pair before enforcing idempotent delivery.
DELETE FROM room_reservation duplicate
USING room_reservation retained
WHERE duplicate.main_reservation_id = retained.main_reservation_id
  AND duplicate.room_id = retained.room_id
  AND duplicate.id > retained.id;

-- The fresh-install baseline already contains this constraint. Existing
-- databases may not, so only add it when it is absent.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_room_reservation_main_room'
          AND conrelid = 'public.room_reservation'::regclass
    ) THEN
        ALTER TABLE public.room_reservation
            ADD CONSTRAINT uq_room_reservation_main_room
            UNIQUE (main_reservation_id, room_id);
    END IF;
END
$$;
