package org.microarchitecturovisco.userservice.repositories;

import org.microarchitecturovisco.userservice.domain.Traveler;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TravelerRepository extends JpaRepository<Traveler, UUID> {
    List<Traveler> findByUserIdOrderByDefaultTravelerDescNameAsc(UUID userId);

    Optional<Traveler> findByIdAndUserId(UUID id, UUID userId);

    List<Traveler> findByUserIdAndDefaultTravelerTrue(UUID userId);
}
