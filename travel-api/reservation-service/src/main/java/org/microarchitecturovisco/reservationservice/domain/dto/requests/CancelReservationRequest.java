package org.microarchitecturovisco.reservationservice.domain.dto.requests;

import jakarta.validation.constraints.Size;

public record CancelReservationRequest(
        @Size(max = 240) String reason
) {
}
