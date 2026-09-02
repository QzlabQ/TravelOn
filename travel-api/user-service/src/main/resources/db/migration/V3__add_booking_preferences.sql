CREATE TABLE IF NOT EXISTS public.booking_preferences (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    default_departure_city character varying(80) NOT NULL,
    default_arrival_city character varying(80) NOT NULL,
    preferred_hotel_min_rating numeric(2,1) NOT NULL,
    preferred_hotel_max_price character varying(32),
    preferred_train_types character varying(255) NOT NULL,
    only_available_tickets boolean NOT NULL,
    created_at timestamp(6) with time zone,
    updated_at timestamp(6) with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_booking_preferences_user_id ON public.booking_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_booking_preferences_user ON public.booking_preferences(user_id);
