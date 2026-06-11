package org.microarchitecturovisco.communityservice.dto;

import org.microarchitecturovisco.communityservice.domain.TravelRoute;
import org.microarchitecturovisco.communityservice.domain.TravelStyle;

import java.time.Instant;
import java.util.UUID;

/** Summary projection of a {@link TravelRoute} used in list views. */
public record TravelRouteResponse(
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
        int stopCount,
        double averageRating,
        long reviewCount,
        String createdByName,
        Instant createdAt
) {
    public static TravelRouteResponse from(TravelRoute route, double averageRating, long reviewCount) {
        return new TravelRouteResponse(
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
                route.getStops().size(),
                Math.round(averageRating * 10.0) / 10.0,
                reviewCount,
                route.getAuthorName(),
                route.getCreatedAt()
        );
    }
}
