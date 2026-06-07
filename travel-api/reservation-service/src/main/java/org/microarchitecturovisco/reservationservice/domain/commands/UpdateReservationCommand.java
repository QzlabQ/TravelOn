package org.microarchitecturovisco.reservationservice.domain.commands;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import org.microarchitecturovisco.reservationservice.domain.entity.ReservationStatus;

import java.util.UUID;
import java.time.LocalDateTime;

@Data
@Builder
@AllArgsConstructor
public class UpdateReservationCommand {
    UUID reservationId;
    Boolean paid;
    ReservationStatus status;
    String cancellationReason;
    LocalDateTime cancelledAt;
    LocalDateTime refundRequestedAt;
    LocalDateTime paidAt;
    LocalDateTime refundedAt;
}
