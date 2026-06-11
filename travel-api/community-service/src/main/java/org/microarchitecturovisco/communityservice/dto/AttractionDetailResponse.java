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
        List<String> imageUrls,
        double averageRating,
        long reviewCount,
        boolean favoritedByCurrentUser,
        String createdByName,
        Instant createdAt,
        List<ReviewResponse> latestReviews
) {
    public static AttractionDetailResponse from(Attraction attraction, double averageRating, long reviewCount, boolean favoritedByCurrentUser, List<ReviewResponse> latestReviews) {
        List<String> images = AttractionImages.resolve(attraction);
        return new AttractionDetailResponse(
                attraction.getId(),
                attraction.getName(),
                attraction.getCity() != null ? attraction.getCity().getRegion() : null,
                attraction.getCity() != null ? attraction.getCity().getCityId() : null,
                attraction.getDescription(),
                images.isEmpty() ? null : images.get(0),
                images,
                Math.round(averageRating * 10.0) / 10.0,
                reviewCount,
                favoritedByCurrentUser,
                attraction.getCreatedByName(),
                attraction.getCreatedAt(),
                latestReviews
        );
    }
}
