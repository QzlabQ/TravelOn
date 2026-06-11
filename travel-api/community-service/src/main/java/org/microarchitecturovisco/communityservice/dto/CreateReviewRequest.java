package org.microarchitecturovisco.communityservice.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.microarchitecturovisco.communityservice.domain.CommunityCategory;
import org.microarchitecturovisco.communityservice.domain.ReviewTargetType;

import java.util.List;

public record CreateReviewRequest(
        @NotNull ReviewTargetType targetType,
        @Size(max = 120) String targetId,
        @NotBlank @Size(max = 120) String targetName,
        @Min(1) @Max(5) int rating,
        @NotBlank @Size(max = 2000) String content,
        @NotNull CommunityCategory category,
        List<@Size(max = 1000) String> imageUrls
) {
}
