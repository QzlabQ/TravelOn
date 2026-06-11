package org.microarchitecturovisco.reservationservice.domain.dto.requests;

import jakarta.annotation.Nullable;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.Valid;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record CreateTicketReservationRequest(
        @NotNull UUID userId,
        @NotBlank String transportType,
        @NotNull LocalDate departureDate,
        @NotBlank String departureTime,
        @NotBlank String arrivalTime,
        @NotBlank String provider,
        @NotBlank String bookingCode,
        @Min(1) int passengerCount,
        @Min(0) float price,
        List<@Valid BookingPersonRequest> travelers,
        @Nullable UUID ticketOfferId
) {
}
