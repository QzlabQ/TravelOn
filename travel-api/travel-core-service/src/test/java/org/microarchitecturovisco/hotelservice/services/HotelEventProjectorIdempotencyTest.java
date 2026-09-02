package org.microarchitecturovisco.hotelservice.services;

import org.junit.jupiter.api.Test;
import org.microarchitecturovisco.hotelservice.model.events.RoomReservationCreatedEvent;
import org.microarchitecturovisco.hotelservice.model.events.HotelCreatedEvent;
import org.microarchitecturovisco.hotelservice.model.domain.Location;
import org.microarchitecturovisco.hotelservice.repositories.HotelRepository;
import org.microarchitecturovisco.hotelservice.repositories.LocationRepository;
import org.microarchitecturovisco.hotelservice.repositories.RoomRepository;
import org.microarchitecturovisco.hotelservice.repositories.RoomReservationRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.Optional;

import static org.mockito.Mockito.*;

class HotelEventProjectorIdempotencyTest {

    @Test
    void duplicateReservationDeliveryDoesNotCreateAnotherRoomReservation() {
        RoomRepository rooms = mock(RoomRepository.class);
        RoomReservationRepository reservations = mock(RoomReservationRepository.class);
        HotelEventProjector projector = new HotelEventProjector(
                rooms, mock(HotelRepository.class), reservations, mock(LocationRepository.class));
        UUID reservationId = UUID.randomUUID();
        when(reservations.insertIfAbsent(any(), any(), any(), eq(reservationId), eq(42L))).thenReturn(0);
        RoomReservationCreatedEvent event = RoomReservationCreatedEvent.builder()
                .id(UUID.randomUUID())
                .idRoomReservation(reservationId)
                .idRoom(42L)
                .idHotel(7)
                .dateFrom(LocalDateTime.now())
                .dateTo(LocalDateTime.now().plusDays(1))
                .eventTimeStamp(LocalDateTime.now())
                .build();

        projector.project(List.of(event));

        verify(reservations, never()).save(any());
        verify(rooms, never()).save(any());
    }

    @Test
    void concurrentUniqueConstraintConflictIsTreatedAsSuccessfulDuplicate() {
        RoomRepository rooms = mock(RoomRepository.class);
        RoomReservationRepository reservations = mock(RoomReservationRepository.class);
        HotelEventProjector projector = new HotelEventProjector(
                rooms, mock(HotelRepository.class), reservations, mock(LocationRepository.class));
        UUID reservationId = UUID.randomUUID();
        when(reservations.insertIfAbsent(any(), any(), any(), eq(reservationId), eq(42L))).thenReturn(0);
        RoomReservationCreatedEvent event = RoomReservationCreatedEvent.builder()
                .id(UUID.randomUUID())
                .idRoomReservation(reservationId)
                .idRoom(42L)
                .idHotel(7)
                .dateFrom(LocalDateTime.now())
                .dateTo(LocalDateTime.now().plusDays(1))
                .eventTimeStamp(LocalDateTime.now())
                .build();

        projector.project(List.of(event));

        verify(rooms, never()).save(any());
    }

    @Test
    void creatingHotelByExistingLocationIdKeepsPersistedLocationFields() {
        HotelRepository hotels = mock(HotelRepository.class);
        LocationRepository locations = mock(LocationRepository.class);
        UUID locationId = UUID.randomUUID();
        Location persistedLocation = Location.builder()
                .id(locationId)
                .country("China")
                .region("Shanghai")
                .build();
        when(locations.findById(locationId)).thenReturn(Optional.of(persistedLocation));
        HotelEventProjector projector = new HotelEventProjector(
                mock(RoomRepository.class), hotels, mock(RoomReservationRepository.class), locations);
        HotelCreatedEvent event = HotelCreatedEvent.builder()
                .idHotel(99001)
                .idLocation(locationId)
                .name("Test hotel")
                .country(null)
                .region(null)
                .photos(List.of())
                .build();

        projector.project(List.of(event));

        verify(hotels).save(argThat(hotel -> hotel.getLocation() == persistedLocation));
        verify(locations, never()).save(any());
        org.junit.jupiter.api.Assertions.assertEquals("China", persistedLocation.getCountry());
        org.junit.jupiter.api.Assertions.assertEquals("Shanghai", persistedLocation.getRegion());
    }
}
