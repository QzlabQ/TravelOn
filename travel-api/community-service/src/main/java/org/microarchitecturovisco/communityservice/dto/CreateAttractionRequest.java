package org.microarchitecturovisco.communityservice.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateAttractionRequest(
        @NotBlank @Size(max = 120) String name,
        @Size(max = 255) String cityId,
        @Size(max = 2000) String description,
        @Size(max = 1000) String coverImageUrl
) {
}
