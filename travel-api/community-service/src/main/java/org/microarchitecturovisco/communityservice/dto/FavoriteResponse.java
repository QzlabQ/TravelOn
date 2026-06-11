package org.microarchitecturovisco.communityservice.dto;

import org.microarchitecturovisco.communityservice.domain.FavoriteTargetType;

public record FavoriteResponse(
        FavoriteTargetType type,
        String targetId,
        boolean favorited
) {
}
