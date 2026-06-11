package org.microarchitecturovisco.communityservice.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

public record CreateAttractionRequest(
        @NotBlank @Size(max = 120) String name,
        @Size(max = 255) String cityId,
        @Size(max = 2000) String description,
        List<@Size(max = 1000) String> imageUrls
) {
}
