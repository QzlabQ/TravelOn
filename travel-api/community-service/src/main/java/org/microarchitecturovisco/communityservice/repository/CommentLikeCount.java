package org.microarchitecturovisco.communityservice.repository;

import java.util.UUID;

public interface CommentLikeCount {
    UUID getCommentId();

    long getLikeCount();
}
