package org.microarchitecturovisco.communityservice.service;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.communityservice.domain.Attraction;
import org.microarchitecturovisco.communityservice.domain.City;
import org.microarchitecturovisco.communityservice.domain.CommunityCategory;
import org.microarchitecturovisco.communityservice.domain.FavoriteTargetType;
import org.microarchitecturovisco.communityservice.domain.Review;
import org.microarchitecturovisco.communityservice.domain.ReviewTargetType;
import org.microarchitecturovisco.communityservice.dto.AttractionDetailResponse;
import org.microarchitecturovisco.communityservice.dto.AttractionResponse;
import org.microarchitecturovisco.communityservice.dto.CreateAttractionRequest;
import org.microarchitecturovisco.communityservice.dto.CreateAttractionReviewRequest;
import org.microarchitecturovisco.communityservice.dto.ReviewResponse;
import org.microarchitecturovisco.communityservice.dto.UserProfileResponse;
import org.microarchitecturovisco.communityservice.repository.AttractionRepository;
import org.microarchitecturovisco.communityservice.repository.CityRepository;
import org.microarchitecturovisco.communityservice.repository.FavoriteRepository;
import org.microarchitecturovisco.communityservice.repository.ReviewRepository;
import org.microarchitecturovisco.communityservice.repository.TargetRatingAggregate;
import org.microarchitecturovisco.communityservice.util.CommunityImages;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AttractionService {

    private final AttractionRepository attractionRepository;
    private final ReviewRepository reviewRepository;
    private final CityRepository cityRepository;
    private final UserClient userClient;
    private final FavoriteService favoriteService;
    private final ReviewLikeService reviewLikeService;
    private final FavoriteRepository favoriteRepository;

    public Page<AttractionResponse> list(String cityId, String keyword, String sort, int page, int size) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size, 1), 50);
        String normalizedCityId = normalizeOptional(cityId);
        String normalizedKeyword = normalizeOptional(keyword);

        List<Attraction> attractions = attractionRepository.findFiltered(normalizedCityId, normalizedKeyword);

        List<String> ids = attractions.stream()
                .map(a -> a.getId().toString())
                .toList();

        Map<String, TargetRatingAggregate> ratingMap = ids.isEmpty()
                ? Map.of()
                : reviewRepository.aggregateRatings(ReviewTargetType.SCENIC_SPOT, ids).stream()
                        .collect(Collectors.toMap(TargetRatingAggregate::getTargetId, r -> r));

        List<AttractionResponse> ranked = attractions.stream()
                .map(attraction -> {
                    TargetRatingAggregate agg = ratingMap.get(attraction.getId().toString());
                    double avg = agg != null ? agg.getAvg() : 0.0;
                    long cnt = agg != null ? agg.getCnt() : 0L;
                    return AttractionResponse.from(attraction, avg, cnt);
                })
                .sorted(comparatorFor(sort))
                .toList();

        int from = Math.min(safePage * safeSize, ranked.size());
        int to = Math.min(from + safeSize, ranked.size());
        return new PageImpl<>(ranked.subList(from, to), PageRequest.of(safePage, safeSize), ranked.size());
    }

    /**
     * "reviewCount" (default) ranks by most reviews, then highest rating, newest first;
     * "rating" ranks by highest rating, then most reviews, newest first;
     * "latest" ranks purely by creation time, newest first.
     */
    private Comparator<AttractionResponse> comparatorFor(String sort) {
        if ("latest".equalsIgnoreCase(sort)) {
            return Comparator.comparing(AttractionResponse::createdAt, Comparator.reverseOrder());
        }
        if ("rating".equalsIgnoreCase(sort)) {
            return Comparator
                    .comparingDouble(AttractionResponse::averageRating)
                    .thenComparingLong(AttractionResponse::reviewCount)
                    .reversed()
                    .thenComparing(AttractionResponse::createdAt, Comparator.reverseOrder());
        }
        return Comparator
                .comparingLong(AttractionResponse::reviewCount)
                .thenComparingDouble(AttractionResponse::averageRating)
                .reversed()
                .thenComparing(AttractionResponse::createdAt, Comparator.reverseOrder());
    }

    public AttractionResponse create(String token, CreateAttractionRequest request) {
        UserProfileResponse user = userClient.requireUser(token);
        String normalizedName = request.name().trim();
        String normalizedCityId = normalizeOptional(request.cityId());

        City city = normalizedCityId != null ? cityRepository.findByCityId(normalizedCityId).orElse(null) : null;

        // dedup: return existing if same name+cityId already present
        return attractionRepository.findByNameAndCityId(normalizedName, normalizedCityId != null ? normalizedCityId : "")
                .map(existing -> {
                    long cnt = reviewRepository.countByTargetTypeAndTargetId(ReviewTargetType.SCENIC_SPOT, existing.getId().toString());
                    double avg = reviewRepository.averageRating(ReviewTargetType.SCENIC_SPOT, existing.getId().toString());
                    return AttractionResponse.from(existing, avg, cnt);
                })
                .orElseGet(() -> {
                    List<String> images = CommunityImages.normalize(request.imageUrls());
                    Attraction attraction = Attraction.builder()
                            .id(UUID.randomUUID())
                            .name(normalizedName)
                            .city(city)
                            .description(normalizeOptional(request.description()))
                            .imageUrls(images)
                            .coverImageUrl(images.isEmpty() ? null : images.get(0))
                            .createdByUserId(user.id())
                            .createdByName(user.displayName())
                            .build();
                    Attraction saved = attractionRepository.save(attraction);
                    return AttractionResponse.from(saved, 0.0, 0L);
                });
    }

    public AttractionDetailResponse getDetail(UUID id, String token) {
        Attraction attraction = requireAttraction(id);
        UUID currentUserId = userClient.tryResolveUserId(token);
        String targetId = attraction.getId().toString();
        double avg = reviewRepository.averageRating(ReviewTargetType.SCENIC_SPOT, targetId);
        long cnt = reviewRepository.countByTargetTypeAndTargetId(ReviewTargetType.SCENIC_SPOT, targetId);
        List<ReviewResponse> latestReviews = reviewLikeService.toResponses(
                reviewRepository.findTop5ByTargetTypeAndTargetIdOrderByCreatedAtDesc(ReviewTargetType.SCENIC_SPOT, targetId),
                currentUserId);
        boolean favorited = favoriteService.isFavorited(currentUserId, FavoriteTargetType.ATTRACTION, targetId);
        return AttractionDetailResponse.from(attraction, avg, cnt, favorited, latestReviews);
    }

    @Transactional
    public AttractionResponse update(String token, UUID id, CreateAttractionRequest request) {
        userClient.requireAdmin(token);
        Attraction attraction = requireAttraction(id);
        String normalizedCityId = normalizeOptional(request.cityId());
        City city = normalizedCityId != null ? cityRepository.findByCityId(normalizedCityId).orElse(null) : null;
        List<String> images = CommunityImages.normalize(request.imageUrls());

        attraction.setName(request.name().trim());
        attraction.setCity(city);
        attraction.setDescription(normalizeOptional(request.description()));
        // Use a mutable copy: Hibernate clears/repopulates the managed @ElementCollection on flush,
        // which fails with UnsupportedOperationException for the immutable list from List.toList().
        attraction.setImageUrls(new java.util.ArrayList<>(images));
        attraction.setCoverImageUrl(images.isEmpty() ? null : images.get(0));

        Attraction saved = attractionRepository.save(attraction);
        String targetId = saved.getId().toString();
        long cnt = reviewRepository.countByTargetTypeAndTargetId(ReviewTargetType.SCENIC_SPOT, targetId);
        double avg = reviewRepository.averageRating(ReviewTargetType.SCENIC_SPOT, targetId);
        return AttractionResponse.from(saved, avg, cnt);
    }

    @Transactional
    public void delete(String token, UUID id) {
        userClient.requireAdmin(token);
        Attraction attraction = requireAttraction(id);
        String targetId = attraction.getId().toString();
        reviewRepository.deleteByTargetTypeAndTargetId(ReviewTargetType.SCENIC_SPOT, targetId);
        favoriteRepository.deleteByTypeAndTargetId(FavoriteTargetType.ATTRACTION, targetId);
        attractionRepository.delete(attraction);
    }

    public ReviewResponse createReview(String token, UUID attractionId, CreateAttractionReviewRequest request) {
        UserProfileResponse user = userClient.requireUser(token);
        Attraction attraction = requireAttraction(attractionId);

        Review review = Review.builder()
                .id(reviewRepository.findMaxId() + 1)
                .targetType(ReviewTargetType.SCENIC_SPOT)
                .targetId(attraction.getId().toString())
                .targetName(attraction.getName())
                .rating(request.rating())
                .content(request.content().trim())
                .category(CommunityCategory.SCENIC_SPOT)
                .imageUrls(CommunityImages.normalize(request.imageUrls()))
                .authorUserId(user.id())
                .authorName(user.displayName())
                .build();

        return ReviewResponse.from(reviewRepository.save(review));
    }

    private Attraction requireAttraction(UUID id) {
        return attractionRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Attraction not found"));
    }

    private String normalizeOptional(String value) {
        return value == null || value.trim().isEmpty() ? null : value.trim();
    }
}
