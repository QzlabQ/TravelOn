package org.microarchitecturovisco.communityservice.dto;

import org.microarchitecturovisco.communityservice.domain.Attraction;

import java.util.List;

/**
 * Resolves the gallery for an attraction. New attractions store a list in
 * {@code imageUrls}; legacy rows only have a single {@code coverImageUrl}, which is
 * surfaced as a one-element gallery so previews and detail pages keep working.
 */
final class AttractionImages {

    private AttractionImages() {
    }

    static List<String> resolve(Attraction attraction) {
        List<String> images = attraction.getImageUrls();
        if (images != null && !images.isEmpty()) {
            return images;
        }
        String legacyCover = attraction.getCoverImageUrl();
        return legacyCover != null && !legacyCover.isBlank() ? List.of(legacyCover) : List.of();
    }
}
