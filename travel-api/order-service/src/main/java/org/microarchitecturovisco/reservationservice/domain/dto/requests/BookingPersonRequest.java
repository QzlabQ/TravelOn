package org.microarchitecturovisco.reservationservice.domain.dto.requests;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record BookingPersonRequest(
        String travelerId,
        @NotBlank @Size(max = 80) String name,
        @Size(max = 24) String travelerType,
        @Size(max = 24) String documentType,
        @Size(max = 48) String documentNumber,
        @Size(max = 32) String phone
) {
}
