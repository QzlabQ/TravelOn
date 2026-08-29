package org.microarchitecturovisco.communityservice.repository;

import org.microarchitecturovisco.communityservice.domain.CommunityComment;
import org.microarchitecturovisco.communityservice.domain.FavoriteTargetType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface CommunityCommentRepository extends JpaRepository<CommunityComment, UUID> {

    List<CommunityComment> findByTargetTypeAndTargetIdOrderByCreatedAtDesc(FavoriteTargetType targetType, String targetId);

    @Modifying
    @Query("update CommunityComment c set c.authorName = :name where c.authorUserId = :userId")
    int updateAuthorName(@Param("userId") UUID userId, @Param("name") String name);

    @Query("""
            select comment
            from CommunityComment comment
            left join CommentLike commentLike on commentLike.commentId = comment.id
            where comment.targetType = :targetType and comment.targetId = :targetId
            group by comment
            order by count(commentLike) desc, comment.createdAt desc
            """)
    List<CommunityComment> findByTargetOrderByLikeCountDesc(
            @Param("targetType") FavoriteTargetType targetType,
            @Param("targetId") String targetId
    );

    long countByTargetTypeAndTargetId(FavoriteTargetType targetType, String targetId);

    void deleteByTargetTypeAndTargetId(FavoriteTargetType targetType, String targetId);
}
