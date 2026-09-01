package org.microarchitecturovisco.userservice.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record SavedBankCardRequest(
        @NotBlank @Pattern(regexp = "\\d{16,19}") String cardNumber,
        @Size(max = 64) String label
) {
}