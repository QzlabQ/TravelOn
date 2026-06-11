package org.microarchitecturovisco.communityservice.dto;

public record ReviewLikeResponse(
        Long reviewId,
        boolean liked,
        int likeCount
) {
}
