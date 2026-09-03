package org.microarchitecturovisco.userservice.dto;

import org.microarchitecturovisco.userservice.domain.BookingPreferences;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;

public record BookingPreferencesResponse(
        String defaultDepartureCity,
        String defaultArrivalCity,
        BigDecimal preferredHotelMinRating,
        String preferredHotelMaxPrice,
        List<String> preferredTrainTypes,
        boolean onlyAvailableTickets,
        Instant createdAt,
        Instant updatedAt
) {
    public static BookingPreferencesResponse from(BookingPreferences preferences) {
        List<String> trainTypes = preferences.getPreferredTrainTypes() == null || preferences.getPreferredTrainTypes().isBlank()
                ? List.of()
                : Arrays.stream(preferences.getPreferredTrainTypes().split(","))
                .filter(value -> !value.isBlank())
                .toList();
        return new BookingPreferencesResponse(
                preferences.getDefaultDepartureCity(),
                preferences.getDefaultArrivalCity(),
                preferences.getPreferredHotelMinRating(),
                preferences.getPreferredHotelMaxPrice(),
                trainTypes,
                preferences.isOnlyAvailableTickets(),
                preferences.getCreatedAt(),
                preferences.getUpdatedAt()
        );
    }
}
