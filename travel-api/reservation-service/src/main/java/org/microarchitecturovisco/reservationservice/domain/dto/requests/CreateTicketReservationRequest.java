package org.microarchitecturovisco.reservationservice.domain.dto.requests;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.util.UUID;

public record CreateTicketReservationRequest(
        @NotNull UUID userId,
        @NotBlank String transportType,
        @NotBlank String routeFrom,
        @NotBlank String routeTo,
        @NotNull LocalDate departureDate,
        @NotBlank String departureTime,
        @NotBlank String arrivalTime,
        @NotBlank String provider,
        @NotBlank String bookingCode,
        @Min(1) int passengerCount,
        @Min(0) float price
) {
}
