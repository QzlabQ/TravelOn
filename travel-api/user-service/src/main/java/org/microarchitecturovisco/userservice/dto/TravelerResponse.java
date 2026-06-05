package org.microarchitecturovisco.userservice.dto;

import org.microarchitecturovisco.userservice.domain.Traveler;

import java.time.Instant;
import java.util.UUID;

public record TravelerResponse(
        UUID id,
        String name,
        String travelerType,
        String documentType,
        String documentNumber,
        String phone,
        boolean student,
        boolean defaultTraveler,
        Instant createdAt,
        Instant updatedAt
) {
    public static TravelerResponse from(Traveler traveler) {
        return new TravelerResponse(
                traveler.getId(),
                traveler.getName(),
                traveler.getTravelerType(),
                traveler.getDocumentType(),
                traveler.getDocumentNumber(),
                traveler.getPhone(),
                traveler.isStudent(),
                traveler.isDefaultTraveler(),
                traveler.getCreatedAt(),
                traveler.getUpdatedAt()
        );
    }
}
