package org.microarchitecturovisco.communityservice.service;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.communityservice.domain.Favorite;
import org.microarchitecturovisco.communityservice.domain.FavoriteTargetType;
import org.microarchitecturovisco.communityservice.dto.FavoriteResponse;
import org.microarchitecturovisco.communityservice.repository.FavoriteRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class FavoriteService {

    private final FavoriteRepository favoriteRepository;
    private final UserClient userClient;

    @Transactional
    public FavoriteResponse toggle(String token, FavoriteTargetType type, String targetId) {
        UUID userId = userClient.requireUser(token).id();
        return favoriteRepository.findByUserIdAndTypeAndTargetId(userId, type, targetId)
                .map(existing -> {
                    favoriteRepository.delete(existing);
                    return new FavoriteResponse(type, targetId, false);
                })
                .orElseGet(() -> {
                    favoriteRepository.save(Favorite.builder()
                            .id(UUID.randomUUID())
                            .userId(userId)
                            .type(type)
                            .targetId(targetId)
                            .createdAt(Instant.now())
                            .build());
                    return new FavoriteResponse(type, targetId, true);
                });
    }

    public FavoriteResponse status(String token, FavoriteTargetType type, String targetId) {
        return new FavoriteResponse(type, targetId, isFavorited(userClient.tryResolveUserId(token), type, targetId));
    }

    public boolean isFavorited(UUID userId, FavoriteTargetType type, String targetId) {
        return userId != null && favoriteRepository.existsByUserIdAndTypeAndTargetId(userId, type, targetId);
    }

    /** Target ids the user has favorited for a given type, most-recent first. */
    public List<String> favoriteTargetIds(UUID userId, FavoriteTargetType type) {
        return favoriteRepository.findByUserIdAndTypeOrderByCreatedAtDesc(userId, type).stream()
                .map(Favorite::getTargetId)
                .toList();
    }
}
