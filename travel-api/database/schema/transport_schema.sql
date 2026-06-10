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
    province character varying(255),
    CONSTRAINT city_pkey PRIMARY KEY (id),
    CONSTRAINT uq_city_city_id UNIQUE (city_id)
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
    price integer NOT NULL,
    remaining_seats integer NOT NULL,
    seat_class character varying(255),
    total_seats integer NOT NULL,
    type character varying(255),
    arrival_city_id character varying(255),
    departure_city_id character varying(255),
    CONSTRAINT ticket_offer_templates_type_check CHECK (type IN ('FLIGHT', 'TRAIN'))
);

ALTER TABLE ONLY public.ticket_offer_templates
    ADD CONSTRAINT ticket_offer_templates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ticket_offer_templates
    ADD CONSTRAINT fk_ticket_departure_city FOREIGN KEY (departure_city_id) REFERENCES public.city(city_id);

ALTER TABLE ONLY public.ticket_offer_templates
    ADD CONSTRAINT fk_ticket_arrival_city FOREIGN KEY (arrival_city_id) REFERENCES public.city(city_id);

CREATE INDEX idx_ticket_offer_search ON public.ticket_offer_templates(type, departure_city_id, arrival_city_id, departure_date_time);
CREATE INDEX idx_ticket_offer_price ON public.ticket_offer_templates(price);
CREATE INDEX idx_ticket_offer_remaining_seats ON public.ticket_offer_templates(remaining_seats);
CREATE INDEX idx_ticket_offer_code ON public.ticket_offer_templates(code);

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
    arrival_terminal_name
FROM public.ticket_offer_templates;
