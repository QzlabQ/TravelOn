package org.microarchitecturovisco.communityservice.repository;

import org.microarchitecturovisco.communityservice.domain.CommunityCategory;
import org.microarchitecturovisco.communityservice.domain.Review;
import org.microarchitecturovisco.communityservice.domain.ReviewTargetType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface ReviewRepository extends JpaRepository<Review, UUID> {

    @Query("""
            select review from Review review
            where (:targetType is null or review.targetType = :targetType)
              and (:targetId is null or review.targetId = :targetId)
              and (:category is null or review.category = :category)
            """)
    Page<Review> search(
            @Param("targetType") ReviewTargetType targetType,
            @Param("targetId") String targetId,
            @Param("category") CommunityCategory category,
            Pageable pageable
    );

    List<Review> findTop5ByTargetTypeAndTargetIdOrderByCreatedAtDesc(ReviewTargetType targetType, String targetId);

    long countByTargetTypeAndTargetId(ReviewTargetType targetType, String targetId);

    @Query("select coalesce(avg(review.rating), 0) from Review review where review.targetType = :targetType and review.targetId = :targetId")
    double averageRating(@Param("targetType") ReviewTargetType targetType, @Param("targetId") String targetId);
}
