package org.microarchitecturovisco.communityservice.dto;

import org.microarchitecturovisco.communityservice.domain.CommunityComment;

import java.time.Instant;
import java.util.UUID;

public record CommentResponse(
        UUID id,
        UUID authorUserId,
        String authorName,
        String content,
        Instant createdAt,
        int likeCount,
        boolean likedByCurrentUser
) {
    public static CommentResponse from(CommunityComment comment) {
        return from(comment, 0, false);
    }

    public static CommentResponse from(CommunityComment comment, int likeCount, boolean likedByCurrentUser) {
        return new CommentResponse(
                comment.getId(),
                comment.getAuthorUserId(),
                comment.getAuthorName(),
                comment.getContent(),
                comment.getCreatedAt(),
                likeCount,
                likedByCurrentUser
        );
    }
}
