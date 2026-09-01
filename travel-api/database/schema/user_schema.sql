--
-- PostgreSQL database dump
--

\restrict e0MYpoxTdvj4oIRSkO8GQ5Zg8RN5s4RyBnOnnWRcxXNesxTCF6HQxCRTq9h6Fhx

-- Dumped from database version 16.13 (Debian 16.13-1.pgdg13+1)
-- Dumped by pg_dump version 16.13 (Debian 16.13-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: travelers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.travelers (
    id uuid NOT NULL,
    created_at timestamp(6) with time zone,
    default_traveler boolean NOT NULL,
    document_number character varying(48),
    document_type character varying(24),
    name character varying(80) NOT NULL,
    phone character varying(32),
    student boolean NOT NULL,
    traveler_type character varying(24) NOT NULL,
    updated_at timestamp(6) with time zone,
    user_id uuid NOT NULL
);


--
-- Name: user_identities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_identities (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    real_name character varying(80) NOT NULL,
    document_type character varying(24) NOT NULL,
    document_number character varying(48) NOT NULL,
    created_at timestamp(6) with time zone,
    updated_at timestamp(6) with time zone
);


--
-- Name: saved_bank_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_bank_cards (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    card_number character varying(19) NOT NULL,
    label character varying(64) NOT NULL,
    created_at timestamp(6) with time zone
);

--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    avatar_url character varying(255),
    created_at timestamp(6) with time zone,
    email character varying(100) NOT NULL,
    last_login_at timestamp(6) with time zone,
    loyalty_tier character varying(32),
    name character varying(50) NOT NULL,
    password_hash character varying(255) NOT NULL,
    phone character varying(32),
    role character varying(16) DEFAULT 'USER'::character varying NOT NULL,
    session_token character varying(255),
    surname character varying(50) NOT NULL,
    updated_at timestamp(6) with time zone
);


--
-- Name: user_identities user_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_identities
    ADD CONSTRAINT user_identities_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.saved_bank_cards
    ADD CONSTRAINT saved_bank_cards_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_identities
    ADD CONSTRAINT uk_user_identities_user_id UNIQUE (user_id);

ALTER TABLE ONLY public.saved_bank_cards
    ADD CONSTRAINT uk_saved_bank_cards_user_card UNIQUE (user_id, card_number);

--
-- Name: travelers travelers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.travelers
    ADD CONSTRAINT travelers_pkey PRIMARY KEY (id);


--
-- Name: users uk_6dotkott2kjsp8vw4d0m25fb7; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT uk_6dotkott2kjsp8vw4d0m25fb7 UNIQUE (email);


--
-- Name: users uk_enbs6m99vdkva67teyrm0jw3x; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT uk_enbs6m99vdkva67teyrm0jw3x UNIQUE (session_token);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.travelers
    ADD CONSTRAINT fk_travelers_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_identities
    ADD CONSTRAINT fk_user_identities_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.saved_bank_cards
    ADD CONSTRAINT fk_saved_bank_cards_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

CREATE INDEX idx_travelers_user ON public.travelers(user_id);
CREATE INDEX idx_saved_bank_cards_user ON public.saved_bank_cards(user_id);
CREATE INDEX idx_travelers_user_default ON public.travelers(user_id, default_traveler);
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_session_token ON public.users(session_token);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_set_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_travelers_set_updated_at
BEFORE UPDATE ON public.travelers
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_user_identities_set_updated_at
BEFORE UPDATE ON public.user_identities
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE VIEW public.user_frontend_profile AS
SELECT
    u.id,
    u.email,
    u.name,
    u.surname,
    u.phone,
    u.avatar_url,
    u.loyalty_tier,
    u.role,
    u.last_login_at,
    count(t.id) AS traveler_count
FROM public.users u
LEFT JOIN public.travelers t ON t.user_id = u.id
GROUP BY u.id;


--
-- PostgreSQL database dump complete
--

\unrestrict e0MYpoxTdvj4oIRSkO8GQ5Zg8RN5s4RyBnOnnWRcxXNesxTCF6HQxCRTq9h6Fhx

