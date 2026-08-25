package org.microarchitecturovisco.reservationservice.domain.dto.requests;

import jakarta.annotation.Nullable;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.Valid;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.math.BigDecimal;
import jakarta.validation.constraints.DecimalMin;

public record CreateHotelOnlyReservationRequest(
        @NotNull UUID userId,
        @NotNull Integer hotelId,
        @NotBlank String hotelName,
        @NotNull LocalDate dateFrom,
        @NotNull LocalDate dateTo,
        @Min(1) int adultsQuantity,
        @Min(0) int childrenUnder3Quantity,
        @Min(0) int childrenUnder10Quantity,
        @Min(0) int childrenUnder18Quantity,
        @DecimalMin("0.00") BigDecimal price,
        String roomName,
        List<@Valid BookingPersonRequest> travelers,
        @Nullable Long roomId
) {
}
