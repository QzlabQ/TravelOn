package org.microarchitecturovisco.communityservice.repository;

import org.microarchitecturovisco.communityservice.domain.CommunityCategory;
import org.microarchitecturovisco.communityservice.domain.CommunityPost;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface CommunityPostRepository extends JpaRepository<CommunityPost, UUID> {
    Page<CommunityPost> findByCategory(CommunityCategory category, Pageable pageable);

    @Modifying
    @Query("update CommunityPost p set p.authorName = :name where p.authorUserId = :userId")
    int updateAuthorName(@Param("userId") UUID userId, @Param("name") String name);

    java.util.List<CommunityPost> findByAuthorUserIdOrderByCreatedAtDesc(UUID authorUserId);

    @Query("""
            select post from CommunityPost post left join post.destinationCity c
            where (:category is null or post.category = :category)
              and (cast(:cityId as string) is null or c.cityId = :cityId)
              and (cast(:keyword as string) is null
                or lower(post.title) like concat('%', lower(cast(:keyword as string)), '%')
                or lower(post.content) like concat('%', lower(cast(:keyword as string)), '%')
                or lower(coalesce(c.region, '')) like concat('%', lower(cast(:keyword as string)), '%'))
            """)
    Page<CommunityPost> findFiltered(
            @Param("category") CommunityCategory category,
            @Param("cityId") String cityId,
            @Param("keyword") String keyword,
            Pageable pageable
    );
}
