package org.microarchitecturovisco.communityservice.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

public record CreateAttractionReviewRequest(
        @Min(1) @Max(5) int rating,
        @NotBlank @Size(max = 2000) String content,
        List<@Size(max = 1000) String> imageUrls
) {
}
