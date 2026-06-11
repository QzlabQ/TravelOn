package org.microarchitecturovisco.communityservice.repository;

import org.microarchitecturovisco.communityservice.domain.CommunityCategory;
import org.microarchitecturovisco.communityservice.domain.CommunityPost;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface CommunityPostRepository extends JpaRepository<CommunityPost, UUID> {
    Page<CommunityPost> findByCategory(CommunityCategory category, Pageable pageable);

    java.util.List<CommunityPost> findByAuthorUserIdOrderByCreatedAtDesc(UUID authorUserId);

    @Query("""
            select post from CommunityPost post left join post.destinationCity c
            where (:category is null or post.category = :category)
              and (lower(post.title) like lower(concat('%', :keyword, '%'))
                or lower(post.content) like lower(concat('%', :keyword, '%'))
                or lower(coalesce(c.region, '')) like lower(concat('%', :keyword, '%')))
            """)
    Page<CommunityPost> search(
            @Param("category") CommunityCategory category,
            @Param("keyword") String keyword,
            Pageable pageable
    );
}
