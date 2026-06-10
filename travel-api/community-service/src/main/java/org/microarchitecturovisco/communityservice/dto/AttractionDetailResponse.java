package org.microarchitecturovisco.communityservice.dto;

import org.microarchitecturovisco.communityservice.domain.Attraction;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record AttractionDetailResponse(
        UUID id,
        String name,
        String city,
        String cityId,
        String description,
        String coverImageUrl,
        double averageRating,
        long reviewCount,
        String createdByName,
        Instant createdAt,
        List<ReviewResponse> latestReviews
) {
    public static AttractionDetailResponse from(Attraction attraction, double averageRating, long reviewCount, List<ReviewResponse> latestReviews) {
        return new AttractionDetailResponse(
                attraction.getId(),
                attraction.getName(),
                attraction.getCity() != null ? attraction.getCity().getRegion() : null,
                attraction.getCity() != null ? attraction.getCity().getCityId() : null,
                attraction.getDescription(),
                attraction.getCoverImageUrl(),
                Math.round(averageRating * 10.0) / 10.0,
                reviewCount,
                attraction.getCreatedByName(),
                attraction.getCreatedAt(),
                latestReviews
        );
    }
}
