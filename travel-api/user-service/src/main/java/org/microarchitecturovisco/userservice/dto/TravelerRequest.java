package org.microarchitecturovisco.userservice.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record TravelerRequest(
        @NotBlank @Size(max = 80) String name,
        @NotBlank @Size(max = 24) String travelerType,
        @Size(max = 24) String documentType,
        @Size(max = 48) String documentNumber,
        @Size(max = 32) String phone,
        boolean student,
        boolean defaultTraveler
) {
}
