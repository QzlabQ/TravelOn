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
    /** 刚创建的帖子：没有任何点赞、收藏或评论。 */
    public static PostResponse forNewPost(CommunityPost post) {
        return from(post, 0, false, false, 0);
    }

    /**
     * likeCount 必须由调用方按 post_like 明细实时统计后传入。
     * community_post.like_count 这一列只在建帖时写入 0、之后从不维护，读它会永远得到 0。
     */
    public static PostResponse from(
            CommunityPost post,
            int likeCount,
            boolean likedByCurrentUser,
            boolean favoritedByCurrentUser,
            long commentCount
    ) {
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
                likeCount,
                likedByCurrentUser,
                favoritedByCurrentUser,
                commentCount,
                post.getCreatedAt(),
                post.getUpdatedAt()
        );
    }
}
