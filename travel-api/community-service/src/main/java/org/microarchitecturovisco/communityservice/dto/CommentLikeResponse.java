package org.microarchitecturovisco.communityservice.dto;

import java.util.UUID;

public record CommentLikeResponse(
        UUID commentId,
        boolean liked,
        int likeCount
) {
}
