package org.microarchitecturovisco.communityservice.dto;

import org.microarchitecturovisco.communityservice.domain.ReviewTargetType;

import java.util.List;

public record CommunitySummaryResponse(
        ReviewTargetType targetType,
        String targetId,
        double averageRating,
        long reviewCount,
        List<ReviewResponse> latestReviews
) {
}
