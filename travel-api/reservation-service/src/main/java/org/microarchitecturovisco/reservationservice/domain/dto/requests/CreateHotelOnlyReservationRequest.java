package org.microarchitecturovisco.reservationservice.domain.dto.requests;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.util.UUID;

public record CreateHotelOnlyReservationRequest(
        @NotNull UUID userId,
        @NotNull UUID hotelId,
        @NotBlank String hotelName,
        @NotNull LocalDate dateFrom,
        @NotNull LocalDate dateTo,
        @Min(1) int adultsQuantity,
        @Min(0) int childrenUnder3Quantity,
        @Min(0) int childrenUnder10Quantity,
        @Min(0) int childrenUnder18Quantity,
        @Min(0) float price,
        String roomName
) {
}
