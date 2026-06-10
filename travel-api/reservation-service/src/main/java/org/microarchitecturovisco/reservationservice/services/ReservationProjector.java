package org.microarchitecturovisco.reservationservice.services;

import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.reservationservice.domain.entity.Reservation;
import org.microarchitecturovisco.reservationservice.domain.entity.ReservationStatus;
import org.microarchitecturovisco.reservationservice.domain.events.ReservationCreatedEvent;
import org.microarchitecturovisco.reservationservice.domain.events.ReservationDeletedEvent;
import org.microarchitecturovisco.reservationservice.domain.events.ReservationEvent;
import org.microarchitecturovisco.reservationservice.domain.events.ReservationUpdateEvent;
import org.microarchitecturovisco.reservationservice.repositories.ReservationRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.ArrayList;

@RequiredArgsConstructor
@Component
public class ReservationProjector {
    private final ReservationRepository reservationRepository;
    private final EntityManager entityManager;

    @Transactional
    public void project(List<ReservationEvent> events) {
        for(ReservationEvent event : events) {
            if(event instanceof ReservationCreatedEvent) {
                apply((ReservationCreatedEvent) event);
            }
            if(event instanceof ReservationUpdateEvent) {
                apply((ReservationUpdateEvent) event);
            }
            if(event instanceof ReservationDeletedEvent) {
                apply((ReservationDeletedEvent) event);
            }
        }
    }

    public void apply(ReservationCreatedEvent event) {
        Reservation reservation = Reservation.builder()
                .id(event.getIdReservation())
                .hotelTimeFrom(event.getHotelTimeFrom())
                .hotelTimeTo(event.getHotelTimeTo())
                .childrenUnder3Quantity(event.getInfantsQuantity())
                .childrenUnder10Quantity(event.getKidsQuantity())
                .childrenUnder18Quantity(event.getTeensQuantity())
                .adultsQuantity(event.getAdultsQuantity())
                .price(event.getPrice())
                .paid(event.isPaid())
                .status(event.getStatus() == null ? ReservationStatus.PENDING_PAYMENT : event.getStatus())
                .bookingType(event.getBookingType() == null ? "PACKAGE" : event.getBookingType())
                .hotelId(event.getHotelId())
                .roomReservationsIds(mutableList(event.getRoomReservationsIds()))
                .transportReservationsIds(mutableList(event.getTransportReservationsIds()))
                .userId(event.getUserId())
                .title(event.getTitle())
                .provider(event.getProvider())
                .bookingCode(event.getBookingCode())
                .travelers(mutableList(event.getTravelers()))
                .build();
        entityManager.persist(reservation);
    }

    public void apply(ReservationUpdateEvent event) {
        Reservation reservation = reservationRepository.findById(event.getIdReservation()).orElseThrow(RuntimeException::new);
        if (event.getPaid() != null) {
            reservation.setPaid(event.getPaid());
        }
        if (event.getStatus() != null) {
            reservation.setStatus(event.getStatus());
        }
        if (event.getCancellationReason() != null) {
            reservation.setCancellationReason(event.getCancellationReason());
        }
        if (event.getCancelledAt() != null) {
            reservation.setCancelledAt(event.getCancelledAt());
        }
        if (event.getRefundRequestedAt() != null) {
            reservation.setRefundRequestedAt(event.getRefundRequestedAt());
        }
        if (event.getPaidAt() != null) {
            reservation.setPaidAt(event.getPaidAt());
        }
        if (event.getRefundedAt() != null) {
            reservation.setRefundedAt(event.getRefundedAt());
        }

        reservationRepository.save(reservation);
    }

    public void apply(ReservationDeletedEvent event) {
        Reservation reservation = reservationRepository.findById(event.getIdReservation()).orElseThrow(RuntimeException::new);
        reservationRepository.deleteById(reservation.getId());
    }

    private <T> List<T> mutableList(List<T> values) {
        return values == null ? new ArrayList<>() : new ArrayList<>(values);
    }

}
