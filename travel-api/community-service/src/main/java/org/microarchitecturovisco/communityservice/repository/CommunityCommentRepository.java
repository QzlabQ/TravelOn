package org.microarchitecturovisco.communityservice.repository;

import org.microarchitecturovisco.communityservice.domain.CommunityComment;
import org.microarchitecturovisco.communityservice.domain.FavoriteTargetType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface CommunityCommentRepository extends JpaRepository<CommunityComment, UUID> {

    List<CommunityComment> findByTargetTypeAndTargetIdOrderByCreatedAtDesc(FavoriteTargetType targetType, String targetId);

    long countByTargetTypeAndTargetId(FavoriteTargetType targetType, String targetId);
}
