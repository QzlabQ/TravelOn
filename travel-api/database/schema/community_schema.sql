--
-- PostgreSQL database dump
--

\restrict gvLeUQcaafMKdqPppemJtR9smKn7MkNB600avCi4BnY5vrUZv1uhBO5fQOi9J2G

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

--
-- Name: community_post; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_post (
    id uuid NOT NULL,
    author_name character varying(255) NOT NULL,
    author_user_id uuid NOT NULL,
    associated_target_id character varying(120),
    associated_target_name character varying(255),
    associated_target_type character varying(255),
    category character varying(255) NOT NULL,
    content text NOT NULL,
    content_format character varying(255) NOT NULL DEFAULT 'PLAIN_TEXT',
    created_at timestamp(6) with time zone NOT NULL,
    destination_city_id character varying(255),
    like_count integer NOT NULL,
    title character varying(120) NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    CONSTRAINT community_post_associated_target_type_check CHECK (((associated_target_type)::text = ANY ((ARRAY['SCENIC_SPOT'::character varying, 'ROUTE'::character varying, 'MERCHANT'::character varying, 'HOTEL'::character varying])::text[]))),
    CONSTRAINT community_post_category_check CHECK (((category)::text = ANY ((ARRAY['TRAVEL_NOTE'::character varying, 'SCENIC_SPOT'::character varying, 'ROUTE'::character varying, 'MERCHANT'::character varying, 'HOTEL'::character varying, 'FOOD'::character varying, 'TRANSPORT'::character varying, 'OTHER'::character varying])::text[]))),
    CONSTRAINT community_post_content_format_check CHECK (((content_format)::text = ANY ((ARRAY['PLAIN_TEXT'::character varying, 'MARKDOWN'::character varying])::text[])))
);


--
-- Name: community_post_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_post_images (
    post_id uuid NOT NULL,
    image_url character varying(1000)
);


--
-- Name: post_like; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_like (
    id uuid NOT NULL,
    created_at timestamp(6) with time zone NOT NULL,
    post_id uuid NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: review; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.review (
    id bigint NOT NULL,
    author_name character varying(255) NOT NULL,
    author_user_id uuid NOT NULL,
    category character varying(255) NOT NULL,
    content character varying(2000) NOT NULL,
    created_at timestamp(6) with time zone NOT NULL,
    rating integer NOT NULL,
    target_id character varying(255),
    target_name character varying(255) NOT NULL,
    target_type character varying(255) NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    CONSTRAINT review_category_check CHECK (((category)::text = ANY ((ARRAY['TRAVEL_NOTE'::character varying, 'SCENIC_SPOT'::character varying, 'ROUTE'::character varying, 'MERCHANT'::character varying, 'HOTEL'::character varying, 'FOOD'::character varying, 'TRANSPORT'::character varying, 'OTHER'::character varying])::text[]))),
    CONSTRAINT review_target_type_check CHECK (((target_type)::text = ANY ((ARRAY['SCENIC_SPOT'::character varying, 'ROUTE'::character varying, 'MERCHANT'::character varying, 'HOTEL'::character varying])::text[])))
);


--
-- Name: review_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.review_images (
    review_id bigint NOT NULL,
    image_url character varying(1000)
);


--
-- Name: community_post community_post_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_post
    ADD CONSTRAINT community_post_pkey PRIMARY KEY (id);


--
-- Name: post_like post_like_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_like
    ADD CONSTRAINT post_like_pkey PRIMARY KEY (id);


--
-- Name: review review_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review
    ADD CONSTRAINT review_pkey PRIMARY KEY (id);


--
-- Name: post_like ukimigx1o2wwpjvfoyubvginj6a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_like
    ADD CONSTRAINT ukimigx1o2wwpjvfoyubvginj6a UNIQUE (post_id, user_id);


--
-- Name: community_post_images fkk0qkynnekml4qotcayonr02he; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_post_images
    ADD CONSTRAINT fkk0qkynnekml4qotcayonr02he FOREIGN KEY (post_id) REFERENCES public.community_post(id);

ALTER TABLE ONLY public.review_images
    ADD CONSTRAINT fk_review_images_review FOREIGN KEY (review_id) REFERENCES public.review(id);
CREATE INDEX idx_review_images_review ON public.review_images(review_id);

CREATE INDEX idx_community_post_category_created ON public.community_post(category, created_at DESC);
CREATE INDEX idx_community_post_popular ON public.community_post(like_count DESC, created_at DESC);
CREATE INDEX idx_community_post_destination ON public.community_post(destination_city_id);

ALTER TABLE ONLY public.community_post
    ADD CONSTRAINT fk_community_post_destination_city FOREIGN KEY (destination_city_id) REFERENCES public.city(city_id);
CREATE INDEX idx_post_like_post ON public.post_like(post_id);
CREATE INDEX idx_post_like_user ON public.post_like(user_id);
CREATE INDEX idx_review_target_created ON public.review(target_type, target_id, created_at DESC);
CREATE INDEX idx_review_category_created ON public.review(category, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_community_post_set_updated_at
BEFORE UPDATE ON public.community_post
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_review_set_updated_at
BEFORE UPDATE ON public.review
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.sync_community_post_like_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    target_post_id uuid;
BEGIN
    IF TG_OP = 'DELETE' THEN
        target_post_id = OLD.post_id;
    ELSE
        target_post_id = NEW.post_id;
    END IF;

    UPDATE public.community_post
    SET like_count = (
        SELECT count(*)::integer
        FROM public.post_like
        WHERE post_id = target_post_id
    )
    WHERE id = target_post_id;

    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_post_like_sync_count
AFTER INSERT OR DELETE ON public.post_like
FOR EACH ROW
EXECUTE FUNCTION public.sync_community_post_like_count();

CREATE VIEW public.community_target_summary AS
SELECT
    target_type,
    target_id,
    count(*) AS review_count,
    round(avg(rating)::numeric, 1) AS average_rating
FROM public.review
WHERE target_id IS NOT NULL
GROUP BY target_type, target_id;


--
-- Name: attraction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attraction (
    id uuid NOT NULL,
    name character varying(120) NOT NULL,
    city_id character varying(255),
    description character varying(2000),
    cover_image_url character varying(1000),
    created_by_user_id uuid NOT NULL,
    created_by_name character varying(255) NOT NULL,
    created_at timestamp(6) with time zone NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    CONSTRAINT attraction_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uq_attraction_name_city
    ON public.attraction (lower(name), lower(coalesce(city_id, '')));
CREATE INDEX idx_attraction_name ON public.attraction (name);
CREATE INDEX idx_attraction_city ON public.attraction (city_id);

ALTER TABLE ONLY public.attraction
    ADD CONSTRAINT fk_attraction_city FOREIGN KEY (city_id) REFERENCES public.city(city_id);

--
-- Name: attraction_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attraction_images (
    attraction_id uuid NOT NULL,
    image_url character varying(1000)
);

ALTER TABLE ONLY public.attraction_images
    ADD CONSTRAINT fk_attraction_images_attraction FOREIGN KEY (attraction_id) REFERENCES public.attraction(id);
CREATE INDEX idx_attraction_images_attraction ON public.attraction_images(attraction_id);

CREATE TRIGGER trg_attraction_set_updated_at
BEFORE UPDATE ON public.attraction
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: travel_route; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.travel_route (
    id uuid NOT NULL,
    title character varying(120) NOT NULL,
    summary character varying(4000),
    days integer NOT NULL,
    people_count integer NOT NULL,
    budget integer NOT NULL,
    style character varying(255) NOT NULL,
    destination_city_id character varying(255),
    cover_image_url character varying(1000),
    author_user_id uuid NOT NULL,
    author_name character varying(255) NOT NULL,
    created_at timestamp(6) with time zone NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    CONSTRAINT travel_route_pkey PRIMARY KEY (id),
    CONSTRAINT travel_route_style_check CHECK (((style)::text = ANY ((ARRAY['LEISURE'::character varying, 'CULTURE'::character varying, 'NATURE'::character varying, 'FOOD'::character varying, 'FAMILY'::character varying, 'ADVENTURE'::character varying, 'ROMANTIC'::character varying, 'OTHER'::character varying])::text[])))
);

CREATE INDEX idx_travel_route_style_created ON public.travel_route(style, created_at DESC);
CREATE INDEX idx_travel_route_city ON public.travel_route(destination_city_id);

ALTER TABLE ONLY public.travel_route
    ADD CONSTRAINT fk_travel_route_destination_city FOREIGN KEY (destination_city_id) REFERENCES public.city(city_id);

CREATE TRIGGER trg_travel_route_set_updated_at
BEFORE UPDATE ON public.travel_route
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: travel_route_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.travel_route_images (
    route_id uuid NOT NULL,
    image_url character varying(1000)
);

ALTER TABLE ONLY public.travel_route_images
    ADD CONSTRAINT fk_travel_route_images_route FOREIGN KEY (route_id) REFERENCES public.travel_route(id);
CREATE INDEX idx_travel_route_images_route ON public.travel_route_images(route_id);

--
-- Name: route_stop; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.route_stop (
    id uuid NOT NULL,
    route_id uuid NOT NULL,
    attraction_id uuid NOT NULL,
    attraction_name character varying(120) NOT NULL,
    attraction_city character varying(255),
    cover_image_url character varying(1000),
    day_number integer NOT NULL,
    sort_order integer NOT NULL,
    note character varying(1000),
    CONSTRAINT route_stop_pkey PRIMARY KEY (id)
);

ALTER TABLE ONLY public.route_stop
    ADD CONSTRAINT fk_route_stop_route FOREIGN KEY (route_id) REFERENCES public.travel_route(id);
CREATE INDEX idx_route_stop_route ON public.route_stop(route_id, day_number, sort_order);


--
-- Name: community_favorite; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_favorite (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    type character varying(255) NOT NULL,
    target_id character varying(255) NOT NULL,
    created_at timestamp(6) with time zone NOT NULL,
    CONSTRAINT community_favorite_pkey PRIMARY KEY (id),
    CONSTRAINT community_favorite_type_check CHECK (((type)::text = ANY ((ARRAY['POST'::character varying, 'ROUTE'::character varying, 'ATTRACTION'::character varying])::text[]))),
    CONSTRAINT uq_community_favorite_user_target UNIQUE (user_id, type, target_id)
);

CREATE INDEX idx_community_favorite_user_type_created
    ON public.community_favorite(user_id, type, created_at DESC);
CREATE INDEX idx_community_favorite_target
    ON public.community_favorite(type, target_id);


--
-- Name: community_comment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_comment (
    id uuid NOT NULL,
    target_type character varying(255) NOT NULL,
    target_id character varying(255) NOT NULL,
    author_user_id uuid NOT NULL,
    author_name character varying(255) NOT NULL,
    content character varying(2000) NOT NULL,
    created_at timestamp(6) with time zone NOT NULL,
    CONSTRAINT community_comment_pkey PRIMARY KEY (id),
    CONSTRAINT community_comment_target_type_check CHECK (((target_type)::text = ANY ((ARRAY['POST'::character varying, 'ROUTE'::character varying, 'ATTRACTION'::character varying])::text[])))
);

CREATE INDEX idx_community_comment_target_created
    ON public.community_comment(target_type, target_id, created_at DESC);
CREATE INDEX idx_community_comment_author_created
    ON public.community_comment(author_user_id, created_at DESC);


--
-- Name: community_comment_like; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_comment_like (
    id uuid NOT NULL,
    comment_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp(6) with time zone NOT NULL,
    CONSTRAINT community_comment_like_pkey PRIMARY KEY (id),
    CONSTRAINT uq_community_comment_like_comment_user UNIQUE (comment_id, user_id)
);

ALTER TABLE ONLY public.community_comment_like
    ADD CONSTRAINT fk_community_comment_like_comment FOREIGN KEY (comment_id) REFERENCES public.community_comment(id);
CREATE INDEX idx_community_comment_like_comment ON public.community_comment_like(comment_id);
CREATE INDEX idx_community_comment_like_user_comment ON public.community_comment_like(user_id, comment_id);


--
-- Name: review_like; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.review_like (
    id uuid NOT NULL,
    review_id bigint NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp(6) with time zone NOT NULL,
    CONSTRAINT review_like_pkey PRIMARY KEY (id),
    CONSTRAINT uq_review_like_review_user UNIQUE (review_id, user_id)
);

ALTER TABLE ONLY public.review_like
    ADD CONSTRAINT fk_review_like_review FOREIGN KEY (review_id) REFERENCES public.review(id);
CREATE INDEX idx_review_like_review ON public.review_like(review_id);
CREATE INDEX idx_review_like_user_review ON public.review_like(user_id, review_id);


--
-- PostgreSQL database dump complete
--

\unrestrict gvLeUQcaafMKdqPppemJtR9smKn7MkNB600avCi4BnY5vrUZv1uhBO5fQOi9J2G

