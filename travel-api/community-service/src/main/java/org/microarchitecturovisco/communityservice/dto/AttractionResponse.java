package org.microarchitecturovisco.communityservice.dto;

import org.microarchitecturovisco.communityservice.domain.Attraction;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record AttractionResponse(
        UUID id,
        String name,
        String city,
        String cityId,
        String description,
        String coverImageUrl,
        List<String> imageUrls,
        double averageRating,
        long reviewCount,
        String createdByName,
        Instant createdAt
) {
    public static AttractionResponse from(Attraction attraction, double averageRating, long reviewCount) {
        List<String> images = AttractionImages.resolve(attraction);
        return new AttractionResponse(
                attraction.getId(),
                attraction.getName(),
                attraction.getCity() != null ? attraction.getCity().getRegion() : null,
                attraction.getCity() != null ? attraction.getCity().getCityId() : null,
                attraction.getDescription(),
                images.isEmpty() ? null : images.get(0),
                images,
                Math.round(averageRating * 10.0) / 10.0,
                reviewCount,
                attraction.getCreatedByName(),
                attraction.getCreatedAt()
        );
    }
}
