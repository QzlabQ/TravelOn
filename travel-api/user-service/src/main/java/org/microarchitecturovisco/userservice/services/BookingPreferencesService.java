package org.microarchitecturovisco.userservice.services;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.userservice.domain.BookingPreferences;
import org.microarchitecturovisco.userservice.domain.User;
import org.microarchitecturovisco.userservice.dto.BookingPreferencesRequest;
import org.microarchitecturovisco.userservice.dto.BookingPreferencesResponse;
import org.microarchitecturovisco.userservice.repositories.BookingPreferencesRepository;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class BookingPreferencesService {

    private static final List<String> ALLOWED_TRAIN_TYPES = List.of("GC", "D", "T", "K", "Z", "OTHER");

    private final UserService userService;
    private final BookingPreferencesRepository bookingPreferencesRepository;
    private final CityCatalog cityCatalog;

    public Optional<BookingPreferencesResponse> get(String token) {
        User user = userService.requireUserByToken(token);
        return bookingPreferencesRepository.findByUserId(user.getId()).map(BookingPreferencesResponse::from);
    }

    public BookingPreferencesResponse save(String token, BookingPreferencesRequest request) {
        User user = userService.requireUserByToken(token);
        BookingPreferences preferences = bookingPreferencesRepository.findByUserId(user.getId())
                .orElseGet(() -> BookingPreferences.builder().id(UUID.randomUUID()).userId(user.getId()).build());

        List<String> trainTypes = request.preferredTrainTypes().stream()
                .map(String::trim)
                .filter(ALLOWED_TRAIN_TYPES::contains)
                .distinct()
                .toList();
        BigDecimal rating = request.preferredHotelMinRating().setScale(1, java.math.RoundingMode.HALF_UP);
        String departureCity = cityCatalog.canonicalName(request.defaultDepartureCity());
        String arrivalCity = cityCatalog.canonicalName(request.defaultArrivalCity());
        if (departureCity == null || arrivalCity == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported booking preference city");
        }
        if (departureCity.equals(arrivalCity)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Departure and arrival cities must differ");
        }
        preferences.setDefaultDepartureCity(departureCity);
        preferences.setDefaultArrivalCity(arrivalCity);
        preferences.setPreferredHotelMinRating(rating);
        preferences.setPreferredHotelMaxPrice(normalizePrice(request.preferredHotelMaxPrice()));
        preferences.setPreferredTrainTypes(String.join(",", trainTypes));
        preferences.setOnlyAvailableTickets(request.onlyAvailableTickets());
        return BookingPreferencesResponse.from(bookingPreferencesRepository.save(preferences));
    }

    private String normalizePrice(String value) {
        if (value == null || value.isBlank()) return null;
        String normalized = value.trim();
        if (!normalized.matches("\\d+(\\.\\d{1,2})?")) return null;
        return normalized;
    }
}
