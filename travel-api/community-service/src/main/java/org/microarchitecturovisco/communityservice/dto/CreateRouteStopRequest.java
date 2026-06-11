package org.microarchitecturovisco.communityservice.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

/**
 * One stop in a new route. Attractions may only be referenced by id and must
 * already exist in the community.
 */
public record CreateRouteStopRequest(
        @NotNull UUID attractionId,
        @Min(1) int dayNumber,
        int sortOrder,
        @Size(max = 1000) String note
) {
}
