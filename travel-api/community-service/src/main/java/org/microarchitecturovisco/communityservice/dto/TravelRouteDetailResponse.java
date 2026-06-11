package org.microarchitecturovisco.communityservice.dto;

import org.microarchitecturovisco.communityservice.domain.TravelRoute;
import org.microarchitecturovisco.communityservice.domain.TravelStyle;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Full projection of a {@link TravelRoute}, including its stops and recent reviews. */
public record TravelRouteDetailResponse(
        UUID id,
        String title,
        String summary,
        int days,
        int peopleCount,
        int budget,
        TravelStyle style,
        String city,
        String cityId,
        String coverImageUrl,
        List<String> imageUrls,
        List<RouteStopResponse> stops,
        double averageRating,
        long reviewCount,
        boolean favoritedByCurrentUser,
        String createdByName,
        Instant createdAt,
        List<ReviewResponse> latestReviews
) {
    public static TravelRouteDetailResponse from(TravelRoute route, double averageRating, long reviewCount, boolean favoritedByCurrentUser, List<ReviewResponse> latestReviews) {
        return new TravelRouteDetailResponse(
                route.getId(),
                route.getTitle(),
                route.getSummary(),
                route.getDays(),
                route.getPeopleCount(),
                route.getBudget(),
                route.getStyle(),
                route.getDestinationCity() != null ? route.getDestinationCity().getRegion() : null,
                route.getDestinationCity() != null ? route.getDestinationCity().getCityId() : null,
                route.getCoverImageUrl(),
                List.copyOf(route.getImageUrls()),
                route.getStops().stream().map(RouteStopResponse::from).toList(),
                Math.round(averageRating * 10.0) / 10.0,
                reviewCount,
                favoritedByCurrentUser,
                route.getAuthorName(),
                route.getCreatedAt(),
                latestReviews
        );
    }
}
