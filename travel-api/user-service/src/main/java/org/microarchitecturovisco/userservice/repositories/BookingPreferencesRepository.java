package org.microarchitecturovisco.userservice.repositories;

import org.microarchitecturovisco.userservice.domain.BookingPreferences;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface BookingPreferencesRepository extends JpaRepository<BookingPreferences, UUID> {
    Optional<BookingPreferences> findByUserId(UUID userId);
}
