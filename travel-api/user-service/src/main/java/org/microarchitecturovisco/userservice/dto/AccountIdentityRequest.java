package org.microarchitecturovisco.userservice.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AccountIdentityRequest(
        @NotBlank @Size(max = 80) String realName,
        @NotBlank @Size(max = 24) String documentType,
        @NotBlank @Size(max = 48) String documentNumber
) {
}