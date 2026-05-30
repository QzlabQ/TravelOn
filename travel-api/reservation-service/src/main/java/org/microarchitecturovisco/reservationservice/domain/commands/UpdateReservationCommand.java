package org.microarchitecturovisco.reservationservice.domain.commands;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import org.microarchitecturovisco.reservationservice.domain.entity.ReservationStatus;

import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class UpdateReservationCommand {
    UUID reservationId;
    Boolean paid;
    ReservationStatus status;
}
