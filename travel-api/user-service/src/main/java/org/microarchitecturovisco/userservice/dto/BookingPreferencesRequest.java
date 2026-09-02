package org.microarchitecturovisco.userservice.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;

public record BookingPreferencesRequest(
        @NotBlank @Size(max = 80) String defaultDepartureCity,
        @NotBlank @Size(max = 80) String defaultArrivalCity,
        @NotNull @DecimalMin("0.0") @DecimalMax("5.0") BigDecimal preferredHotelMinRating,
        @Size(max = 32) String preferredHotelMaxPrice,
        @NotNull @Size(max = 6) List<@NotBlank @Size(max = 12) String> preferredTrainTypes,
        boolean onlyAvailableTickets
) {
}
