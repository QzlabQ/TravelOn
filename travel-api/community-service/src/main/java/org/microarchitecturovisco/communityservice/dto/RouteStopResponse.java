package org.microarchitecturovisco.communityservice.dto;

import org.microarchitecturovisco.communityservice.domain.RouteStop;

import java.util.UUID;

public record RouteStopResponse(
        UUID attractionId,
        String attractionName,
        String attractionCity,
        String coverImageUrl,
        int dayNumber,
        int sortOrder,
        String note
) {
    public static RouteStopResponse from(RouteStop stop) {
        return new RouteStopResponse(
                stop.getAttractionId(),
                stop.getAttractionName(),
                stop.getAttractionCity(),
                stop.getCoverImageUrl(),
                stop.getDayNumber(),
                stop.getSortOrder(),
                stop.getNote()
        );
    }
}
