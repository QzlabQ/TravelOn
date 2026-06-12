package org.microarchitecturovisco.userservice.dto;

import org.microarchitecturovisco.userservice.domain.User;

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
    public static UserProfileResponse from(User user) {
        return new UserProfileResponse(
                user.getId(),
                user.getEmail(),
                user.getName(),
                user.getSurname(),
                user.getPhone(),
                user.getAvatarUrl(),
                user.getLoyaltyTier(),
                user.getRole() == null ? "USER" : user.getRole().name(),
                user.getCreatedAt(),
                user.getUpdatedAt(),
                user.getLastLoginAt()
        );
    }
}
