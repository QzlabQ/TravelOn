\connect hotel_db

DROP TABLE IF EXISTS public.hotel_created_event_photos;
DROP TABLE IF EXISTS public.hotel_created_event;
DROP TABLE IF EXISTS public.room_created_event;
DROP TABLE IF EXISTS public.room_update_event;
DROP TABLE IF EXISTS public.room_reservation_created_event;
DROP TABLE IF EXISTS public.room_reservation_deleted_event;
DROP TABLE IF EXISTS public.catering_option;
DROP TABLE IF EXISTS public.catering_option_created_event;

\connect transport_db

DROP TABLE IF EXISTS public.transports_reservations;
DROP TABLE IF EXISTS public.transport;
DROP TABLE IF EXISTS public.transport_courses;
DROP TABLE IF EXISTS public.locations;
DROP TABLE IF EXISTS public.transport_created_event;
DROP TABLE IF EXISTS public.transport_update_event;
DROP TABLE IF EXISTS public.transport_reservation_created_event;
DROP TABLE IF EXISTS public.transport_reservation_deleted_event;
DROP TABLE IF EXISTS public.train_route;
DROP TABLE IF EXISTS public.train_type_seats;
DROP TABLE IF EXISTS public.train_type;
DROP TABLE IF EXISTS public.train_number;
DROP TABLE IF EXISTS public.station;
DROP TABLE IF EXISTS public.city;

\connect reservation_db

DROP TABLE IF EXISTS public.create_reservation_command_room_reservations_ids;
DROP TABLE IF EXISTS public.create_reservation_command_transport_reservations_ids;
DROP TABLE IF EXISTS public.create_reservation_command_travelers;
DROP TABLE IF EXISTS public.delete_reservation_command_room_reservations_ids;
DROP TABLE IF EXISTS public.delete_reservation_command_transport_reservations_ids;
DROP TABLE IF EXISTS public.create_reservation_command;
DROP TABLE IF EXISTS public.delete_reservation_command;
DROP TABLE IF EXISTS public.reservation_created_event_room_reservations_ids;
DROP TABLE IF EXISTS public.reservation_created_event_transport_reservations_ids;
DROP TABLE IF EXISTS public.reservation_created_event_travelers;
DROP TABLE IF EXISTS public.reservation_deleted_event_room_reservations_ids;
DROP TABLE IF EXISTS public.reservation_deleted_event_transport_reservations_ids;
DROP TABLE IF EXISTS public.reservation_created_event;
DROP TABLE IF EXISTS public.reservation_deleted_event;
DROP TABLE IF EXISTS public.reservation_update_event;
