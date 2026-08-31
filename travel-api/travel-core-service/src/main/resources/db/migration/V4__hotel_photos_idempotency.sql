-- Remove duplicates created by older baselines before adding the constraint.
DELETE FROM public.hotel_photos duplicate_row
USING public.hotel_photos retained_row
WHERE duplicate_row.ctid > retained_row.ctid
  AND duplicate_row.hotel_id = retained_row.hotel_id
  AND duplicate_row.photos IS NOT DISTINCT FROM retained_row.photos;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.hotel_photos'::regclass
          AND conname = 'uq_hotel_photos_hotel_photo'
    ) THEN
        ALTER TABLE public.hotel_photos
            ADD CONSTRAINT uq_hotel_photos_hotel_photo UNIQUE (hotel_id, photos);
    END IF;
END $$;
