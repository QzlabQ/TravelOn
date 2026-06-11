package org.microarchitecturovisco.communityservice.repository;

import org.microarchitecturovisco.communityservice.domain.Favorite;
import org.microarchitecturovisco.communityservice.domain.FavoriteTargetType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface FavoriteRepository extends JpaRepository<Favorite, UUID> {

    Optional<Favorite> findByUserIdAndTypeAndTargetId(UUID userId, FavoriteTargetType type, String targetId);

    boolean existsByUserIdAndTypeAndTargetId(UUID userId, FavoriteTargetType type, String targetId);

    List<Favorite> findByUserIdAndTypeOrderByCreatedAtDesc(UUID userId, FavoriteTargetType type);
}
