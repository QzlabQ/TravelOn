SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET client_min_messages = warning;

CREATE TABLE public.city (
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
    city_id uuid
);

CREATE TABLE public.hotel_photos (
    hotel_id integer NOT NULL,
    photos character varying(255)
);

CREATE TABLE public.room (
    id bigint NOT NULL,
    description text,
    guest_capacity integer NOT NULL,
    name character varying(255) NOT NULL,
    price_per_adult numeric(12,2) NOT NULL,
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

CREATE TABLE public.ticket_offer_templates (
    id uuid NOT NULL,
    arrival_date_time timestamp(6) without time zone,
    arrival_station_code character varying(255),
    arrival_terminal_name character varying(255),
    carrier character varying(255),
    code character varying(255),
    departure_date_time timestamp(6) without time zone,
    departure_station_code character varying(255),
    departure_terminal_name character varying(255),
    price numeric(12,2) NOT NULL,
    remaining_seats integer NOT NULL,
    seat_class character varying(255),
    total_seats integer NOT NULL,
    type character varying(255),
    arrival_city_id character varying(255),
    departure_city_id character varying(255),
    departure_station_name character varying(255),
    arrival_station_name character varying(255),
    CONSTRAINT ticket_offer_templates_type_check CHECK (type IN ('FLIGHT', 'TRAIN'))
);

ALTER TABLE ONLY public.city
    ADD CONSTRAINT city_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.city
    ADD CONSTRAINT uq_city_city_id UNIQUE (city_id);

ALTER TABLE ONLY public.hotel
    ADD CONSTRAINT hotel_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.room
    ADD CONSTRAINT room_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.room_reservation
    ADD CONSTRAINT room_reservation_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.room_reservation
    ADD CONSTRAINT uq_room_reservation_main_room UNIQUE (main_reservation_id, room_id);

ALTER TABLE ONLY public.ticket_offer_templates
    ADD CONSTRAINT ticket_offer_templates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.hotel
    ADD CONSTRAINT fk_hotel_city FOREIGN KEY (city_id) REFERENCES public.city(id);

ALTER TABLE ONLY public.hotel_photos
    ADD CONSTRAINT fk_hotel_photos_hotel FOREIGN KEY (hotel_id) REFERENCES public.hotel(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.room
    ADD CONSTRAINT fk_room_hotel FOREIGN KEY (hotel_id) REFERENCES public.hotel(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.room_reservation
    ADD CONSTRAINT fk_room_reservation_room FOREIGN KEY (room_id) REFERENCES public.room(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ticket_offer_templates
    ADD CONSTRAINT fk_ticket_departure_city FOREIGN KEY (departure_city_id) REFERENCES public.city(city_id);

ALTER TABLE ONLY public.ticket_offer_templates
    ADD CONSTRAINT fk_ticket_arrival_city FOREIGN KEY (arrival_city_id) REFERENCES public.city(city_id);

CREATE INDEX idx_hotel_city ON public.hotel(city_id);
CREATE INDEX idx_hotel_rating ON public.hotel(rating DESC);
CREATE INDEX idx_city_city_id ON public.city(city_id);
CREATE INDEX idx_city_normalized_name ON public.city(normalized_name);
CREATE INDEX idx_room_hotel ON public.room(hotel_id);
CREATE INDEX idx_room_price_capacity ON public.room(price_per_adult, guest_capacity);
CREATE INDEX idx_room_reservation_room_dates ON public.room_reservation(room_id, date_from, date_to);
CREATE INDEX idx_room_reservation_main_reservation ON public.room_reservation(main_reservation_id);
CREATE INDEX idx_ticket_offer_search ON public.ticket_offer_templates(type, departure_city_id, arrival_city_id, departure_date_time);
CREATE INDEX idx_ticket_offer_price ON public.ticket_offer_templates(price);
CREATE INDEX idx_ticket_offer_remaining_seats ON public.ticket_offer_templates(remaining_seats);
CREATE INDEX idx_ticket_offer_code ON public.ticket_offer_templates(code);

CREATE VIEW public.hotel_room_inventory AS
SELECT
    h.id AS hotel_id,
    h.name AS hotel_name,
    h.rating,
    h.city_id,
    count(r.id) AS room_count,
    min(r.price_per_adult) AS min_price_per_adult,
    max(r.guest_capacity) AS max_guest_capacity
FROM public.hotel h
LEFT JOIN public.room r ON r.hotel_id = h.id
GROUP BY h.id, h.name, h.rating, h.city_id;

CREATE VIEW public.transport_offer_search_view AS
SELECT
    id,
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
FROM public.ticket_offer_templates;
