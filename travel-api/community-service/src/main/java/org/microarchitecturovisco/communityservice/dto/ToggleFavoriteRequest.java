package org.microarchitecturovisco.communityservice.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.microarchitecturovisco.communityservice.domain.FavoriteTargetType;

public record ToggleFavoriteRequest(
        @NotNull FavoriteTargetType type,
        @NotBlank String targetId
) {
}
