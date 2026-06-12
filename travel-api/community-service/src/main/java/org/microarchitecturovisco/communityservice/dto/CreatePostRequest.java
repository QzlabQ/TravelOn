package org.microarchitecturovisco.communityservice.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.microarchitecturovisco.communityservice.domain.CommunityCategory;
import org.microarchitecturovisco.communityservice.domain.ReviewTargetType;

import java.util.List;

public record CreatePostRequest(
        @NotBlank @Size(max = 120) String title,
        @NotBlank @Size(max = 4000) String content,
        @NotNull CommunityCategory category,
        @Size(max = 255) String destinationCityId,
        ReviewTargetType associatedTargetType,
        @Size(max = 120) String associatedTargetId,
        @Size(max = 255) String associatedTargetName,
        List<@Size(max = 1000) String> imageUrls
) {
}
