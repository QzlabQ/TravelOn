package org.microarchitecturovisco.userservice.dto;

public record AuthResponse(
        String token,
        UserProfileResponse user
) {
}
