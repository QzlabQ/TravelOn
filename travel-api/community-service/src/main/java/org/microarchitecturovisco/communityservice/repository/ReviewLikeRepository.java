package org.microarchitecturovisco.communityservice.repository;

import org.microarchitecturovisco.communityservice.domain.ReviewLike;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ReviewLikeRepository extends JpaRepository<ReviewLike, UUID> {

    Optional<ReviewLike> findByReviewIdAndUserId(Long reviewId, UUID userId);

    boolean existsByReviewIdAndUserId(Long reviewId, UUID userId);

    long countByReviewId(Long reviewId);

    void deleteByReviewId(Long reviewId);

    List<ReviewLike> findByUserIdAndReviewIdIn(UUID userId, List<Long> reviewIds);

    @Query("""
            select rl.reviewId as reviewId, count(rl) as likeCount
            from ReviewLike rl
            where rl.reviewId in :reviewIds
            group by rl.reviewId
            """)
    List<ReviewLikeCount> countByReviewIdIn(@Param("reviewIds") List<Long> reviewIds);
}
