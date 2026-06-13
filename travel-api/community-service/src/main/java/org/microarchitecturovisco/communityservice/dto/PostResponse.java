package org.microarchitecturovisco.communityservice.dto;

import org.microarchitecturovisco.communityservice.domain.CommunityCategory;
import org.microarchitecturovisco.communityservice.domain.CommunityPost;
import org.microarchitecturovisco.communityservice.domain.PostContentFormat;
import org.microarchitecturovisco.communityservice.domain.ReviewTargetType;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record PostResponse(
        UUID id,
        String title,
        String content,
        PostContentFormat contentFormat,
        CommunityCategory category,
        String destination,
        String destinationCityId,
        ReviewTargetType associatedTargetType,
        String associatedTargetId,
        String associatedTargetName,
        List<String> imageUrls,
        UUID authorUserId,
        String authorName,
        int likeCount,
        boolean likedByCurrentUser,
        boolean favoritedByCurrentUser,
        long commentCount,
        Instant createdAt,
        Instant updatedAt
) {
    public static PostResponse from(CommunityPost post, boolean likedByCurrentUser) {
        return from(post, likedByCurrentUser, false, 0);
    }

    public static PostResponse from(CommunityPost post, boolean likedByCurrentUser, boolean favoritedByCurrentUser, long commentCount) {
        return new PostResponse(
                post.getId(),
                post.getTitle(),
                post.getContent(),
                post.getContentFormat(),
                post.getCategory(),
                post.getDestinationCity() != null ? post.getDestinationCity().getRegion() : null,
                post.getDestinationCity() != null ? post.getDestinationCity().getCityId() : null,
                post.getAssociatedTargetType(),
                post.getAssociatedTargetId(),
                post.getAssociatedTargetName(),
                post.getImageUrls(),
                post.getAuthorUserId(),
                post.getAuthorName(),
                post.getLikeCount(),
                likedByCurrentUser,
                favoritedByCurrentUser,
                commentCount,
                post.getCreatedAt(),
                post.getUpdatedAt()
        );
    }
}
