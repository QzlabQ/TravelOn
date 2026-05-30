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
                user.getCreatedAt(),
                user.getUpdatedAt(),
                user.getLastLoginAt()
        );
    }
}
