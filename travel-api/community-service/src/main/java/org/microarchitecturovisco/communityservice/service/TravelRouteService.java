package org.microarchitecturovisco.communityservice.service;

import lombok.RequiredArgsConstructor;
import org.microarchitecturovisco.communityservice.domain.Attraction;
import org.microarchitecturovisco.communityservice.domain.City;
import org.microarchitecturovisco.communityservice.domain.CommunityCategory;
import org.microarchitecturovisco.communityservice.domain.FavoriteTargetType;
import org.microarchitecturovisco.communityservice.domain.Review;
import org.microarchitecturovisco.communityservice.domain.ReviewTargetType;
import org.microarchitecturovisco.communityservice.domain.RouteStop;
import org.microarchitecturovisco.communityservice.domain.TravelRoute;
import org.microarchitecturovisco.communityservice.domain.TravelStyle;
import org.microarchitecturovisco.communityservice.dto.CreateAttractionReviewRequest;
import org.microarchitecturovisco.communityservice.dto.CreateRouteStopRequest;
import org.microarchitecturovisco.communityservice.dto.CreateTravelRouteRequest;
import org.microarchitecturovisco.communityservice.dto.ReviewResponse;
import org.microarchitecturovisco.communityservice.dto.TravelRouteDetailResponse;
import org.microarchitecturovisco.communityservice.dto.TravelRouteResponse;
import org.microarchitecturovisco.communityservice.dto.UserProfileResponse;
import org.microarchitecturovisco.communityservice.repository.AttractionRepository;
import org.microarchitecturovisco.communityservice.repository.CityRepository;
import org.microarchitecturovisco.communityservice.repository.FavoriteRepository;
import org.microarchitecturovisco.communityservice.repository.ReviewRepository;
import org.microarchitecturovisco.communityservice.repository.TargetRatingAggregate;
import org.microarchitecturovisco.communityservice.repository.TravelRouteRepository;
import org.microarchitecturovisco.communityservice.util.CommunityImages;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class TravelRouteService {

    private static final ReviewTargetType TARGET = ReviewTargetType.ROUTE;

    private final TravelRouteRepository routeRepository;
    private final AttractionRepository attractionRepository;
    private final ReviewRepository reviewRepository;
    private final CityRepository cityRepository;
    private final UserClient userClient;
    private final FavoriteService favoriteService;
    private final ReviewLikeService reviewLikeService;
    private final FavoriteRepository favoriteRepository;

    public Page<TravelRouteResponse> list(String style, String cityId, String keyword, String sort, int page, int size) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size, 1), 50);

        List<TravelRoute> routes = routeRepository.findFiltered(
                parseStyle(style),
                normalizeOptional(cityId),
                normalizeOptional(keyword)
        );

        List<String> ids = routes.stream().map(r -> r.getId().toString()).toList();
        Map<String, TargetRatingAggregate> ratingMap = ids.isEmpty()
                ? Map.of()
                : reviewRepository.aggregateRatings(TARGET, ids).stream()
                        .collect(Collectors.toMap(TargetRatingAggregate::getTargetId, r -> r));

        List<TravelRouteResponse> ranked = routes.stream()
                .map(route -> {
                    TargetRatingAggregate agg = ratingMap.get(route.getId().toString());
                    double avg = agg != null ? agg.getAvg() : 0.0;
                    long cnt = agg != null ? agg.getCnt() : 0L;
                    return TravelRouteResponse.from(route, avg, cnt);
                })
                .sorted(comparatorFor(sort))
                .toList();

        int from = Math.min(safePage * safeSize, ranked.size());
        int to = Math.min(from + safeSize, ranked.size());
        return new PageImpl<>(ranked.subList(from, to), PageRequest.of(safePage, safeSize), ranked.size());
    }

    /**
     * "popular" ranks by most reviews, then highest rating, newest first;
     * "latest" (default) ranks purely by creation time, newest first.
     */
    private Comparator<TravelRouteResponse> comparatorFor(String sort) {
        if ("popular".equalsIgnoreCase(sort)) {
            return Comparator
                    .comparingLong(TravelRouteResponse::reviewCount)
                    .thenComparingDouble(TravelRouteResponse::averageRating)
                    .reversed()
                    .thenComparing(TravelRouteResponse::createdAt, Comparator.reverseOrder());
        }
        return Comparator.comparing(TravelRouteResponse::createdAt, Comparator.reverseOrder());
    }

    public TravelRouteResponse create(String token, CreateTravelRouteRequest request) {
        UserProfileResponse user = userClient.requireUser(token);
        String normalizedCityId = normalizeOptional(request.cityId());
        City city = requireCity(normalizedCityId);

        // Build snapshot stops; every attraction must already exist in the community
        // and belong to the route's city.
        List<RouteStop> stops = buildStops(request.stops(), normalizedCityId);

        List<String> images = CommunityImages.normalize(request.imageUrls());
        String cover = images.isEmpty()
                ? stops.stream().map(RouteStop::getCoverImageUrl).filter(c -> c != null).findFirst().orElse(null)
                : images.get(0);

        TravelRoute route = TravelRoute.builder()
                .id(UUID.randomUUID())
                .title(request.title().trim())
                .summary(normalizeOptional(request.summary()))
                .days(request.days())
                .peopleCount(request.peopleCount())
                .budget(request.budget())
                .style(request.style())
                .destinationCity(city)
                .imageUrls(images)
                .coverImageUrl(cover)
                .stops(stops)
                .authorUserId(user.id())
                .authorName(user.displayName())
                .build();
        stops.forEach(stop -> stop.setRoute(route));

        return TravelRouteResponse.from(routeRepository.save(route), 0.0, 0L);
    }

    public TravelRouteDetailResponse getDetail(UUID id, String token) {
        TravelRoute route = requireRoute(id);
        UUID currentUserId = userClient.tryResolveUserId(token);
        String targetId = route.getId().toString();
        double avg = reviewRepository.averageRating(TARGET, targetId);
        long cnt = reviewRepository.countByTargetTypeAndTargetId(TARGET, targetId);
        List<ReviewResponse> latestReviews = reviewLikeService.toResponses(
                reviewRepository.findTop5ByTargetTypeAndTargetIdOrderByCreatedAtDesc(TARGET, targetId),
                currentUserId);
        boolean favorited = favoriteService.isFavorited(currentUserId, FavoriteTargetType.ROUTE, targetId);
        return TravelRouteDetailResponse.from(route, avg, cnt, favorited, latestReviews);
    }

    @Transactional
    public void delete(String token, UUID id) {
        TravelRoute route = requireRoute(id);
        userClient.requireOwnerOrAdmin(token, route.getAuthorUserId());
        String targetId = route.getId().toString();
        reviewRepository.deleteByTargetTypeAndTargetId(TARGET, targetId);
        favoriteRepository.deleteByTypeAndTargetId(FavoriteTargetType.ROUTE, targetId);
        routeRepository.delete(route);
    }

    public ReviewResponse createReview(String token, UUID routeId, CreateAttractionReviewRequest request) {
        UserProfileResponse user = userClient.requireUser(token);
        TravelRoute route = requireRoute(routeId);

        Review review = Review.builder()
                .id(reviewRepository.findMaxId() + 1)
                .targetType(TARGET)
                .targetId(route.getId().toString())
                .targetName(route.getTitle())
                .rating(request.rating())
                .content(request.content().trim())
                .category(CommunityCategory.ROUTE)
                .imageUrls(CommunityImages.normalize(request.imageUrls()))
                .authorUserId(user.id())
                .authorName(user.displayName())
                .build();

        return ReviewResponse.from(reviewRepository.save(review));
    }

    private TravelRoute requireRoute(UUID id) {
        return routeRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Travel route not found"));
    }

    private City requireCity(String normalizedCityId) {
        if (normalizedCityId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Travel route must specify a city");
        }
        return cityRepository.findByCityId(normalizedCityId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown city: " + normalizedCityId));
    }

    private List<RouteStop> buildStops(List<CreateRouteStopRequest> stopRequests, String requiredCityId) {
        List<RouteStop> stops = new ArrayList<>();
        for (CreateRouteStopRequest stopRequest : stopRequests) {
            Attraction attraction = attractionRepository.findById(stopRequest.attractionId())
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.BAD_REQUEST, "Referenced attraction not found: " + stopRequest.attractionId()));
            String attractionCityId = attraction.getCity() != null ? attraction.getCity().getCityId() : null;
            if (!requiredCityId.equals(attractionCityId)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Attraction \"" + attraction.getName() + "\" does not belong to the route city");
            }
            stops.add(RouteStop.builder()
                    .id(UUID.randomUUID())
                    .attractionId(attraction.getId())
                    .attractionName(attraction.getName())
                    .attractionCity(attraction.getCity() != null ? attraction.getCity().getRegion() : null)
                    .coverImageUrl(attraction.getCoverImageUrl())
                    .dayNumber(stopRequest.dayNumber())
                    .sortOrder(stopRequest.sortOrder())
                    .note(normalizeOptional(stopRequest.note()))
                    .build());
        }
        return stops;
    }

    private TravelStyle parseStyle(String value) {
        String normalized = normalizeOptional(value);
        if (normalized == null) {
            return null;
        }
        try {
            return TravelStyle.valueOf(normalized.toUpperCase());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private String normalizeOptional(String value) {
        return value == null || value.trim().isEmpty() ? null : value.trim();
    }
}
