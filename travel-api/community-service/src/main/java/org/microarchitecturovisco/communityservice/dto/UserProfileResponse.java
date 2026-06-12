package org.microarchitecturovisco.communityservice.dto;

import java.time.Instant;
import java.util.UUID;

public record UserProfileResponse(
        UUID id,
        String email,
        String name,
        String surname,
        String phone,
        String avatarUrl,
        String loyaltyTier,
        String role,
        Instant createdAt,
        Instant updatedAt,
        Instant lastLoginAt
) {
    public String displayName() {
        String fullName = ((name == null ? "" : name) + " " + (surname == null ? "" : surname)).trim();
        return fullName.isBlank() ? email : fullName;
    }

    public boolean admin() {
        return "ADMIN".equalsIgnoreCase(role);
    }
}
