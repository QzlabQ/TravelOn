package org.microarchitecturovisco.communityservice.dto;

import org.microarchitecturovisco.communityservice.domain.CommunityCategory;
import org.microarchitecturovisco.communityservice.domain.Review;
import org.microarchitecturovisco.communityservice.domain.ReviewTargetType;

import java.time.Instant;
import java.util.UUID;

public record ReviewResponse(
        Long id,
        ReviewTargetType targetType,
        String targetId,
        String targetName,
        int rating,
        String content,
        CommunityCategory category,
        UUID authorUserId,
        String authorName,
        Instant createdAt,
        Instant updatedAt
) {
    public static ReviewResponse from(Review review) {
        return new ReviewResponse(
                review.getId(),
                review.getTargetType(),
                review.getTargetId(),
                review.getTargetName(),
                review.getRating(),
                review.getContent(),
                review.getCategory(),
                review.getAuthorUserId(),
                review.getAuthorName(),
                review.getCreatedAt(),
                review.getUpdatedAt()
        );
    }
}
