package org.microarchitecturovisco.userservice.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;

public record UpdateProfileRequest(
        @Email @Size(max = 100) String email,
        @Size(max = 50) String name,
        @Size(max = 50) String surname,
        @Size(max = 32) String phone,
        @Size(max = 255) String avatarUrl
) {
}
