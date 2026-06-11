package org.microarchitecturovisco.communityservice.dto;

import org.microarchitecturovisco.communityservice.domain.CommunityCategory;
import org.microarchitecturovisco.communityservice.domain.Review;
import org.microarchitecturovisco.communityservice.domain.ReviewTargetType;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record ReviewResponse(
        Long id,
        ReviewTargetType targetType,
        String targetId,
        String targetName,
        int rating,
        String content,
        CommunityCategory category,
        List<String> imageUrls,
        UUID authorUserId,
        String authorName,
        int likeCount,
        boolean likedByCurrentUser,
        Instant createdAt,
        Instant updatedAt
) {
    public static ReviewResponse from(Review review) {
        return from(review, 0, false);
    }

    public static ReviewResponse from(Review review, int likeCount, boolean likedByCurrentUser) {
        return new ReviewResponse(
                review.getId(),
                review.getTargetType(),
                review.getTargetId(),
                review.getTargetName(),
                review.getRating(),
                review.getContent(),
                review.getCategory(),
                review.getImageUrls(),
                review.getAuthorUserId(),
                review.getAuthorName(),
                likeCount,
                likedByCurrentUser,
                review.getCreatedAt(),
                review.getUpdatedAt()
        );
    }
}
