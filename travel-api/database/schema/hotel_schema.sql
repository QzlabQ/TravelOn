SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET client_min_messages = warning;

CREATE TABLE public.location (
    id uuid NOT NULL,
    country character varying(255) NOT NULL,
    region character varying(255),
    city_id character varying(255),
    normalized_name character varying(255),
    province character varying(255)
);

CREATE TABLE public.hotel (
    id integer NOT NULL,
    description text,
    name character varying(255),
    rating real NOT NULL,
    location_id uuid
);

CREATE TABLE public.hotel_photos (
    hotel_id integer NOT NULL,
    photos character varying(255)
);

CREATE TABLE public.photo (
    id uuid NOT NULL,
    url oid
);

CREATE TABLE public.room (
    id bigint NOT NULL,
    description text,
    guest_capacity integer NOT NULL,
    name character varying(255) NOT NULL,
    price_per_adult real NOT NULL,
    room_type character varying(255),
    hotel_id integer
);

CREATE TABLE public.room_reservation (
    id uuid NOT NULL,
    date_from timestamp(6) without time zone NOT NULL,
    date_to timestamp(6) without time zone NOT NULL,
    main_reservation_id uuid,
    room_id bigint NOT NULL
);

ALTER TABLE ONLY public.location
    ADD CONSTRAINT location_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.hotel
    ADD CONSTRAINT hotel_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.photo
    ADD CONSTRAINT photo_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.room
    ADD CONSTRAINT room_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.room_reservation
    ADD CONSTRAINT room_reservation_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.hotel
    ADD CONSTRAINT fk_hotel_location FOREIGN KEY (location_id) REFERENCES public.location(id);

ALTER TABLE ONLY public.hotel_photos
    ADD CONSTRAINT fk_hotel_photos_hotel FOREIGN KEY (hotel_id) REFERENCES public.hotel(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.room
    ADD CONSTRAINT fk_room_hotel FOREIGN KEY (hotel_id) REFERENCES public.hotel(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.room_reservation
    ADD CONSTRAINT fk_room_reservation_room FOREIGN KEY (room_id) REFERENCES public.room(id) ON DELETE CASCADE;

CREATE INDEX idx_hotel_location ON public.hotel(location_id);
CREATE INDEX idx_hotel_rating ON public.hotel(rating DESC);
CREATE INDEX idx_location_city ON public.location(city_id);
CREATE INDEX idx_location_normalized_name ON public.location(normalized_name);
CREATE INDEX idx_room_hotel ON public.room(hotel_id);
CREATE INDEX idx_room_price_capacity ON public.room(price_per_adult, guest_capacity);
CREATE INDEX idx_room_reservation_room_dates ON public.room_reservation(room_id, date_from, date_to);
CREATE INDEX idx_room_reservation_main_reservation ON public.room_reservation(main_reservation_id);

CREATE VIEW public.hotel_room_inventory AS
SELECT
    h.id AS hotel_id,
    h.name AS hotel_name,
    h.rating,
    h.location_id,
    count(r.id) AS room_count,
    min(r.price_per_adult) AS min_price_per_adult,
    max(r.guest_capacity) AS max_guest_capacity
FROM public.hotel h
LEFT JOIN public.room r ON r.hotel_id = h.id
GROUP BY h.id, h.name, h.rating, h.location_id;
