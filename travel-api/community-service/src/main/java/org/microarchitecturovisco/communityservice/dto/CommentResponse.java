package org.microarchitecturovisco.communityservice.dto;

import org.microarchitecturovisco.communityservice.domain.CommunityComment;

import java.time.Instant;
import java.util.UUID;

public record CommentResponse(
        UUID id,
        UUID authorUserId,
        String authorName,
        String content,
        Instant createdAt
) {
    public static CommentResponse from(CommunityComment comment) {
        return new CommentResponse(
                comment.getId(),
                comment.getAuthorUserId(),
                comment.getAuthorName(),
                comment.getContent(),
                comment.getCreatedAt()
        );
    }
}
