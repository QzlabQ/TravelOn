SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET client_min_messages = warning;

CREATE TABLE public.reservation (
    id uuid NOT NULL,
    adults_quantity integer NOT NULL,
    booking_code character varying(255),
    booking_type character varying(255) NOT NULL,
    cancellation_reason character varying(240),
    cancelled_at timestamp(6) without time zone,
    children_under10quantity integer NOT NULL,
    children_under18quantity integer NOT NULL,
    children_under3quantity integer NOT NULL,
    created_at timestamp(6) without time zone,
    hotel_id integer,
    hotel_time_from timestamp(6) without time zone NOT NULL,
    hotel_time_to timestamp(6) without time zone NOT NULL,
    paid boolean NOT NULL,
    paid_at timestamp(6) without time zone,
    payment_deadline timestamp(6) without time zone,
    price numeric(12,2) NOT NULL,
    provider character varying(255),
    refund_requested_at timestamp(6) without time zone,
    refunded_at timestamp(6) without time zone,
    status character varying(255) NOT NULL,
    title character varying(255),
    user_id uuid NOT NULL,
    CONSTRAINT reservation_status_check CHECK (status IN ('PENDING_PAYMENT', 'PAID', 'CANCELLED', 'EXPIRED', 'REFUND_PROCESSING', 'REFUNDED'))
);

-- Stores the travel-core-service room.id (bigint) values included in this reservation.
-- This is the Room entity ID, NOT the RoomReservation record ID (uuid) created by travel-core-service.
-- travel-core-service links back via room_reservation.main_reservation_id (uuid).
CREATE TABLE public.reservation_room_reservations_ids (
    reservation_id uuid NOT NULL,
    room_reservations_ids bigint
);

-- Stores the travel-core-service ticket_offer_templates.id (uuid) values included in this reservation.
CREATE TABLE public.reservation_transport_reservations_ids (
    reservation_id uuid NOT NULL,
    transport_reservations_ids uuid
);

CREATE TABLE public.reservation_travelers (
    reservation_id uuid NOT NULL,
    document_number character varying(255),
    document_type character varying(255),
    name character varying(255),
    phone character varying(255),
    traveler_id character varying(255),
    traveler_type character varying(255)
);

CREATE TABLE public.payment_transaction (
    id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    approved boolean NOT NULL,
    card_last4 character varying(4),
    created_at timestamp(6) without time zone,
    failure_reason character varying(240),
    reservation_id uuid NOT NULL,
    status character varying(24) NOT NULL
);

CREATE TABLE public.refund_record (
    id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    completed_at timestamp(6) without time zone,
    reason character varying(240),
    requested_at timestamp(6) without time zone,
    reservation_id uuid NOT NULL,
    status character varying(255) NOT NULL,
    CONSTRAINT refund_record_status_check CHECK (status IN ('PROCESSING', 'COMPLETED', 'REJECTED'))
);

ALTER TABLE ONLY public.reservation
    ADD CONSTRAINT reservation_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payment_transaction
    ADD CONSTRAINT payment_transaction_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.refund_record
    ADD CONSTRAINT refund_record_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.reservation_room_reservations_ids
    ADD CONSTRAINT fk_reservation_rooms_reservation FOREIGN KEY (reservation_id) REFERENCES public.reservation(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reservation_transport_reservations_ids
    ADD CONSTRAINT fk_reservation_transports_reservation FOREIGN KEY (reservation_id) REFERENCES public.reservation(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reservation_travelers
    ADD CONSTRAINT fk_reservation_travelers_reservation FOREIGN KEY (reservation_id) REFERENCES public.reservation(id) ON DELETE CASCADE;

CREATE INDEX idx_reservation_user_created ON public.reservation(user_id, created_at DESC);
CREATE INDEX idx_reservation_status_deadline ON public.reservation(status, payment_deadline);
CREATE INDEX idx_reservation_hotel_dates ON public.reservation(hotel_id, hotel_time_from, hotel_time_to);
CREATE INDEX idx_reservation_booking_code ON public.reservation(booking_code);
CREATE INDEX idx_payment_transaction_reservation ON public.payment_transaction(reservation_id, created_at DESC);
CREATE INDEX idx_refund_record_reservation ON public.refund_record(reservation_id, requested_at DESC);

CREATE VIEW public.reservation_frontend_summary AS
SELECT
    r.id,
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
FROM public.reservation r
LEFT JOIN public.reservation_travelers rt ON rt.reservation_id = r.id
LEFT JOIN public.reservation_room_reservations_ids rr ON rr.reservation_id = r.id
LEFT JOIN public.reservation_transport_reservations_ids tr ON tr.reservation_id = r.id
GROUP BY r.id;
