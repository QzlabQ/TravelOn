package org.microarchitecturovisco.communityservice.service;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.communityservice.domain.Attraction;
import org.microarchitecturovisco.communityservice.domain.CommunityPost;
import org.microarchitecturovisco.communityservice.domain.FavoriteTargetType;
import org.microarchitecturovisco.communityservice.domain.ReviewTargetType;
import org.microarchitecturovisco.communityservice.domain.TravelRoute;
import org.microarchitecturovisco.communityservice.dto.AttractionResponse;
import org.microarchitecturovisco.communityservice.dto.PostResponse;
import org.microarchitecturovisco.communityservice.dto.ReviewResponse;
import org.microarchitecturovisco.communityservice.dto.TravelRouteResponse;
import org.microarchitecturovisco.communityservice.repository.AttractionRepository;
import org.microarchitecturovisco.communityservice.repository.CommunityPostRepository;
import org.microarchitecturovisco.communityservice.repository.ReviewRepository;
import org.microarchitecturovisco.communityservice.repository.TargetRatingAggregate;
import org.microarchitecturovisco.communityservice.repository.TravelRouteRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Backs the in-community "我的" page: the current user's content and favorites. */
@Service
@RequiredArgsConstructor
public class ProfileService {

    private final UserClient userClient;
    private final CommunityPostRepository postRepository;
    private final TravelRouteRepository routeRepository;
    private final AttractionRepository attractionRepository;
    private final ReviewRepository reviewRepository;
    private final FavoriteService favoriteService;
    private final ReviewLikeService reviewLikeService;
    private final CommentService commentService;

    // ── My content ────────────────────────────────────────────────────────────

    public List<PostResponse> myPosts(String token) {
        UUID userId = userClient.requireUser(token).id();
        return postRepository.findByAuthorUserIdOrderByCreatedAtDesc(userId).stream()
                .map(post -> PostResponse.from(post, false, false, commentService.countPostComments(post.getId())))
                .toList();
    }

    public List<TravelRouteResponse> myRoutes(String token) {
        UUID userId = userClient.requireUser(token).id();
        return toRouteResponses(routeRepository.findByAuthorUserIdOrderByCreatedAtDesc(userId));
    }

    public List<ReviewResponse> myReviews(String token) {
        UUID userId = userClient.requireUser(token).id();
        return reviewLikeService.toResponses(reviewRepository.findByAuthorUserIdOrderByCreatedAtDesc(userId), userId);
    }

    // ── My favorites ────────────────────────────────────────────────────────────

    public List<PostResponse> myFavoritePosts(String token) {
        UUID userId = userClient.requireUser(token).id();
        List<UUID> ids = parseUuids(favoriteService.favoriteTargetIds(userId, FavoriteTargetType.POST));
        Map<UUID, CommunityPost> byId = postRepository.findAllById(ids).stream()
                .collect(Collectors.toMap(CommunityPost::getId, Function.identity()));
        return ids.stream()
                .map(byId::get)
                .filter(post -> post != null)
                .map(post -> PostResponse.from(post, false, true, commentService.countPostComments(post.getId())))
                .toList();
    }

    public List<TravelRouteResponse> myFavoriteRoutes(String token) {
        UUID userId = userClient.requireUser(token).id();
        List<UUID> ids = parseUuids(favoriteService.favoriteTargetIds(userId, FavoriteTargetType.ROUTE));
        Map<UUID, TravelRoute> byId = routeRepository.findAllById(ids).stream()
                .collect(Collectors.toMap(TravelRoute::getId, Function.identity()));
        return toRouteResponses(ids.stream().map(byId::get).filter(route -> route != null).toList());
    }

    public List<AttractionResponse> myFavoriteAttractions(String token) {
        UUID userId = userClient.requireUser(token).id();
        List<UUID> ids = parseUuids(favoriteService.favoriteTargetIds(userId, FavoriteTargetType.ATTRACTION));
        Map<UUID, Attraction> byId = attractionRepository.findAllById(ids).stream()
                .collect(Collectors.toMap(Attraction::getId, Function.identity()));
        List<Attraction> ordered = ids.stream().map(byId::get).filter(a -> a != null).toList();
        Map<String, TargetRatingAggregate> ratings = ratingMap(ReviewTargetType.SCENIC_SPOT, ordered.stream().map(a -> a.getId().toString()).toList());
        return ordered.stream()
                .map(attraction -> {
                    TargetRatingAggregate agg = ratings.get(attraction.getId().toString());
                    return AttractionResponse.from(attraction, agg != null ? agg.getAvg() : 0.0, agg != null ? agg.getCnt() : 0L);
                })
                .toList();
    }

    // ── helpers ────────────────────────────────────────────────────────────────

    private List<TravelRouteResponse> toRouteResponses(List<TravelRoute> routes) {
        Map<String, TargetRatingAggregate> ratings = ratingMap(ReviewTargetType.ROUTE, routes.stream().map(r -> r.getId().toString()).toList());
        return routes.stream()
                .map(route -> {
                    TargetRatingAggregate agg = ratings.get(route.getId().toString());
                    return TravelRouteResponse.from(route, agg != null ? agg.getAvg() : 0.0, agg != null ? agg.getCnt() : 0L);
                })
                .toList();
    }

    private Map<String, TargetRatingAggregate> ratingMap(ReviewTargetType type, List<String> ids) {
        if (ids.isEmpty()) {
            return Map.of();
        }
        return reviewRepository.aggregateRatings(type, ids).stream()
                .collect(Collectors.toMap(TargetRatingAggregate::getTargetId, Function.identity()));
    }

    private List<UUID> parseUuids(List<String> raw) {
        return raw.stream().map(this::parseUuid).filter(id -> id != null).toList();
    }

    private UUID parseUuid(String value) {
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
