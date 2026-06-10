package org.microarchitecturovisco.communityservice.dto;

import org.microarchitecturovisco.communityservice.domain.CommunityCategory;
import org.microarchitecturovisco.communityservice.domain.CommunityPost;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record PostResponse(
        UUID id,
        String title,
        String content,
        CommunityCategory category,
        String destination,
        String destinationCityId,
        List<String> imageUrls,
        UUID authorUserId,
        String authorName,
        int likeCount,
        boolean likedByCurrentUser,
        Instant createdAt,
        Instant updatedAt
) {
    public static PostResponse from(CommunityPost post, boolean likedByCurrentUser) {
        return new PostResponse(
                post.getId(),
                post.getTitle(),
                post.getContent(),
                post.getCategory(),
                post.getDestinationCity() != null ? post.getDestinationCity().getRegion() : null,
                post.getDestinationCity() != null ? post.getDestinationCity().getCityId() : null,
                post.getImageUrls(),
                post.getAuthorUserId(),
                post.getAuthorName(),
                post.getLikeCount(),
                likedByCurrentUser,
                post.getCreatedAt(),
                post.getUpdatedAt()
        );
    }
}
