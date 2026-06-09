package org.microarchitecturovisco.reservationservice.domain.events;

import lombok.*;
import org.microarchitecturovisco.reservationservice.domain.entity.ReservationStatus;

import java.util.UUID;
import java.time.LocalDateTime;

@Builder
@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
public class ReservationUpdateEvent extends ReservationEvent {
    private UUID idReservation;
    private Boolean paid;
    private ReservationStatus status;
    private String cancellationReason;
    private LocalDateTime cancelledAt;
    private LocalDateTime refundRequestedAt;
    private LocalDateTime paidAt;
    private LocalDateTime refundedAt;
}
