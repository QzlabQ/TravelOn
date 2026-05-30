package org.microarchitecturovisco.userservice.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
        @NotBlank @Email @Size(max = 100) String email,
        @NotBlank @Size(min = 6, max = 80) String password,
        @NotBlank @Size(max = 50) String name,
        @NotBlank @Size(max = 50) String surname,
        @Size(max = 32) String phone
) {
}
