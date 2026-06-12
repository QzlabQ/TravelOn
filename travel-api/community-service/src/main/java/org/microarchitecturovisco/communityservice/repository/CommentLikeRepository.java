package org.microarchitecturovisco.communityservice.repository;

import org.microarchitecturovisco.communityservice.domain.CommentLike;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CommentLikeRepository extends JpaRepository<CommentLike, UUID> {

    Optional<CommentLike> findByCommentIdAndUserId(UUID commentId, UUID userId);

    long countByCommentId(UUID commentId);

    List<CommentLike> findByUserIdAndCommentIdIn(UUID userId, List<UUID> commentIds);

    @Query("""
            select cl.commentId as commentId, count(cl) as likeCount
            from CommentLike cl
            where cl.commentId in :commentIds
            group by cl.commentId
            """)
    List<CommentLikeCount> countByCommentIdIn(@Param("commentIds") List<UUID> commentIds);

    void deleteByCommentId(UUID commentId);

    void deleteByCommentIdIn(List<UUID> commentIds);
}
