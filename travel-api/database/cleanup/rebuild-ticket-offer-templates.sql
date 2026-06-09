DROP TABLE IF EXISTS ticket_offer_templates;

CREATE TABLE ticket_offer_templates (
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
    CONSTRAINT ticket_offer_templates_pkey PRIMARY KEY (id),
    CONSTRAINT ticket_offer_templates_type_check CHECK (
        type IN ('FLIGHT', 'TRAIN')
    )
);
