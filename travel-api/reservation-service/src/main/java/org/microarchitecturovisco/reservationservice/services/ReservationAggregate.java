package org.microarchitecturovisco.reservationservice.services;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.reservationservice.domain.commands.CreateReservationCommand;
import org.microarchitecturovisco.reservationservice.domain.commands.DeleteReservationCommand;
import org.microarchitecturovisco.reservationservice.domain.commands.UpdateReservationCommand;
import org.microarchitecturovisco.reservationservice.domain.entity.Reservation;
import org.microarchitecturovisco.reservationservice.domain.events.ReservationCreatedEvent;
import org.microarchitecturovisco.reservationservice.domain.events.ReservationDeletedEvent;
import org.microarchitecturovisco.reservationservice.domain.events.ReservationEvent;
import org.microarchitecturovisco.reservationservice.domain.events.ReservationUpdateEvent;
import org.microarchitecturovisco.reservationservice.domain.entity.ReservationStatus;
import org.microarchitecturovisco.reservationservice.repositories.ReservationRepository;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;
import java.util.logging.Logger;

@RequiredArgsConstructor
@Component
public class ReservationAggregate {
    static Logger logger = Logger.getLogger("ReservationAggregate");
    private final ReservationProjector reservationProjector;
    private final ReservationRepository reservationRepository;

    public List<ReservationEvent> handleCreateReservationCommand(CreateReservationCommand command) {
        ReservationCreatedEvent event = ReservationCreatedEvent.builder()
                .idReservation(command.getId())
                .hotelTimeFrom(command.getHotelTimeFrom())
                .hotelTimeTo(command.getHotelTimeTo())
                .infantsQuantity(command.getInfantsQuantity())
                .kidsQuantity(command.getKidsQuantity())
                .teensQuantity(command.getTeensQuantity())
                .adultsQuantity(command.getAdultsQuantity())
                .price(command.getPrice())
                .paid(command.isPaid())
                .status(command.getStatus() == null ? ReservationStatus.PENDING_PAYMENT : command.getStatus())
                .bookingType(command.getBookingType())
                .hotelId(command.getHotelId())
                .roomReservationsIds(command.getRoomReservationsIds())
                .transportReservationsIds(command.getTransportReservationsIds())
                .userId(command.getUserId())
                .title(command.getTitle())
                .provider(command.getProvider())
                .bookingCode(command.getBookingCode())
                .travelers(command.getTravelers())
                .paymentDeadline(command.getPaymentDeadline())
                .build();
        reservationProjector.project(List.of(event));
        return List.of(event);
    }

    public List<ReservationEvent> handleDeleteReservationCommand(DeleteReservationCommand command) {
        ReservationDeletedEvent event = ReservationDeletedEvent.builder()
                .idReservation(command.getId())
                .hotelTimeFrom(command.getHotelTimeFrom())
                .hotelTimeTo(command.getHotelTimeTo())
                .infantsQuantity(command.getInfantsQuantity())
                .kidsQuantity(command.getKidsQuantity())
                .teensQuantity(command.getTeensQuantity())
                .adultsQuantity(command.getAdultsQuantity())
                .price(command.getPrice())
                .paid(command.isPaid())
                .hotelId(command.getHotelId())
                .roomReservationsIds(command.getRoomReservationsIds())
                .transportReservationsIds(command.getTransportReservationsIds())
                .userId(command.getUserId())
                .build();
        reservationProjector.project(List.of(event));
        return List.of(event);
    }

    public List<ReservationEvent> handleReservationUpdateCommand(UpdateReservationCommand command) {
        Optional<Reservation> reservationOptional = reservationRepository.findById(command.getReservationId());
        if(reservationOptional.isEmpty()) {
            logger.warning("Reservation with id " + command.getReservationId() + " not found.");
            return null;
        }

        ReservationUpdateEvent event = ReservationUpdateEvent.builder()
                .idReservation(command.getReservationId())
                .paid(command.getPaid())
                .status(command.getStatus())
                .cancellationReason(command.getCancellationReason())
                .cancelledAt(command.getCancelledAt())
                .refundRequestedAt(command.getRefundRequestedAt())
                .paidAt(command.getPaidAt())
                .refundedAt(command.getRefundedAt())
                .build();
        reservationProjector.project(List.of(event));

        return List.of(event);
    }
}
