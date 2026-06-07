package org.microarchitecturovisco.communityservice.dto;

import java.util.UUID;

public record LikeResponse(UUID postId, boolean liked, int likeCount) {
}
